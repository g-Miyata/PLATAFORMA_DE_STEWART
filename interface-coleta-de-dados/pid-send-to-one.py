# stewart_test_console.py
# Requisitos:
#   pip install pyserial
#
# O que faz:
# - Lista portas seriais, conecta/desconecta
# - Console RX/TX e grava CSV (RX e, se quiser, TX)
# - Seleciona pistão 1..6 (envia sel=N)
# - Setpoint manual em mm ou % (Enter envia)
# - Ganhos: Kp, Ki, Kd (envia kpmm/kimm/kdmm em mm; kp/ki/kd em %)
# - Presets de testes: degrau, 3-degraus, sobe-desce, quadrada (N ciclos) e custom (lista)
# - Dwell (s) entre passos, repetições, botão "Parar teste"
# - Marca eventos no CSV ("EVENT") pra facilitar análise
#
# Extra na rotina CUSTOM:
# - Só envia o próximo setpoint quando estabilizar por 8 s com variação < 1.5 mm.

import csv
import os
import threading
import time
from datetime import datetime
from collections import deque  # NEW
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

import serial
import serial.tools.list_ports

BAUD = 115200
CSV_DELIM = ';'

def _base_dir():
    try:
        return os.path.dirname(os.path.abspath(__file__))
    except NameError:
        return os.getcwd()

def default_csv_path():
    ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    return os.path.join(_base_dir(), f"stewart_test_{ts}.csv")

ENDINGS = {
    "LF (\\n)": b"\n",
    "CR (\\r)": b"\r",
    "CRLF (\\r\\n)": b"\r\n",
    "Nenhum": b"",
}

class App:
    def __init__(self, root):
        self.root = root
        root.title("Stewart – Teste e Aquisição (1 pistão)")

        self.ser = None
        self.reader_thread = None
        self.stop_flag = threading.Event()
        self.test_thread = None
        self.test_stop = threading.Event()

        self.csv_path = default_csv_path()
        self.csv_file = None
        self.csv_writer = None

        self.ending_choice = tk.StringVar(value="LF (\\n)")
        self.echo_tx_csv = tk.BooleanVar(value=False)

        self.sel_var = tk.IntVar(value=1)   # pistão 1..6

        # SP manual
        self.units = tk.StringVar(value="mm")  # "mm" ou "%"
        self.sp_entry_var = tk.StringVar(value="0")

        # ganhos/DB
        self.kp_var  = tk.StringVar(value="2.0")
        self.ki_var  = tk.StringVar(value="0.00")
        self.kd_var  = tk.StringVar(value="0.00")  # NEW: Kd
        self.db_var  = tk.StringVar(value="0.20")

        # preset params
        self.dwell_var = tk.StringVar(value="3.0")   # seg entre passos
        self.reps_var  = tk.StringVar(value="1")     # repetições
        self.cycles_var = tk.StringVar(value="3")    # p/ quadrada
        self.ampl_var   = tk.StringVar(value="10")   # amplitude degrau (mm ou %)
        self.base_var   = tk.StringVar(value="0")    # base (mm ou %)
        self.custom_list_var = tk.StringVar(value="0, 30, 50, 120, 180, 150, 50, 0")

        # ---- Buffer de estabilidade (RX -> Y_mm) ----
        self._buf_lock = threading.Lock()
        self._ywin = deque()   # cada item: (t_epoch, y_mm)
        self._ywin_max_span = 12.0  # manter no máx ~12 s para avaliar janela de 8 s

        self.last_y_mm = None  # opcional: último Y_mm parseado

        self._build_ui()
        self._refresh_ports()
        self.lbl_csv.config(text=self.csv_path)

    # ---------------- UI ----------------
    def _build_ui(self):
        top = ttk.Frame(self.root, padding=8); top.pack(fill='x')
        ttk.Label(top, text="Porta:").pack(side='left')
        self.cbo_port = ttk.Combobox(top, width=16, state='readonly'); self.cbo_port.pack(side='left', padx=(4,8))
        ttk.Button(top, text="↻", width=3, command=self._refresh_ports).pack(side='left', padx=(0,8))
        self.btn_connect = ttk.Button(top, text="Conectar e Gravar", command=self.connect); self.btn_connect.pack(side='left', padx=4)
        self.btn_stop = ttk.Button(top, text="Parar", command=self.disconnect, state='disabled'); self.btn_stop.pack(side='left', padx=4)
        ttk.Button(top, text="Escolher CSV…", command=self.choose_csv).pack(side='left', padx=8)
        self.lbl_csv = ttk.Label(top, text="(sem arquivo)"); self.lbl_csv.pack(side='left', padx=6)

        opts = ttk.Frame(self.root, padding=(8,0,8,0)); opts.pack(fill='x')
        ttk.Label(opts, text="Final de linha:").pack(side='left')
        self.cbo_end = ttk.Combobox(opts, width=12, state='readonly',
                                    values=list(ENDINGS.keys()),
                                    textvariable=self.ending_choice)
        self.cbo_end.pack(side='left', padx=(4,8))
        ttk.Checkbutton(opts, text="Ecoar TX no CSV", variable=self.echo_tx_csv).pack(side='left')

        mid = ttk.Frame(self.root, padding=8); mid.pack(fill='both', expand=True)
        # console
        self.txt = tk.Text(mid, height=18, wrap='none'); self.txt.pack(fill='both', expand=True, side='left')
        scroll = ttk.Scrollbar(mid, command=self.txt.yview); scroll.pack(side='left', fill='y')
        self.txt['yscrollcommand'] = scroll.set

        right = ttk.Frame(mid); right.pack(side='left', fill='y', padx=(8,0))

        # seleção pistão
        grp_sel = ttk.LabelFrame(right, text="Pistão", padding=8); grp_sel.pack(fill='x')
        self.cbo_sel = ttk.Combobox(grp_sel, state='readonly', values=[1,2,3,4,5,6], textvariable=self.sel_var, width=4)
        self.cbo_sel.pack(side='left')
        ttk.Button(grp_sel, text="Selecionar", command=self.send_sel).pack(side='left', padx=6)

        # SP manual
        grp_sp = ttk.LabelFrame(right, text="Setpoint manual", padding=8); grp_sp.pack(fill='x', pady=(8,0))
        row = ttk.Frame(grp_sp); row.pack(fill='x', pady=3)
        ttk.Radiobutton(row, text="mm", variable=self.units, value="mm").pack(side='left')
        ttk.Radiobutton(row, text="%",  variable=self.units, value="%").pack(side='left')
        self.sp_entry = ttk.Entry(grp_sp, textvariable=self.sp_entry_var, width=10, justify='right'); self.sp_entry.pack(side='left', padx=(0,6))
        self.sp_entry.bind("<Return>", lambda e: self.send_sp_manual())
        ttk.Button(grp_sp, text="Enviar", command=self.send_sp_manual).pack(side='left')

        # ganhos
        grp_g = ttk.LabelFrame(right, text="Ganhos/DB", padding=8); grp_g.pack(fill='x', pady=(8,0))
        rowg1 = ttk.Frame(grp_g); rowg1.pack(fill='x', pady=2)
        ttk.Label(rowg1, text="Kp:").pack(side='left'); ttk.Entry(rowg1, textvariable=self.kp_var, width=8, justify='right').pack(side='left', padx=4)
        ttk.Button(rowg1, text="Enviar", command=self.send_kp).pack(side='left')
        rowg2 = ttk.Frame(grp_g); rowg2.pack(fill='x', pady=2)
        ttk.Label(rowg2, text="Ki:").pack(side='left'); ttk.Entry(rowg2, textvariable=self.ki_var, width=8, justify='right').pack(side='left', padx=4)
        ttk.Button(rowg2, text="Enviar", command=self.send_ki).pack(side='left')
        rowg2b = ttk.Frame(grp_g); rowg2b.pack(fill='x', pady=2)  # NEW: Kd
        ttk.Label(rowg2b, text="Kd:").pack(side='left'); ttk.Entry(rowg2b, textvariable=self.kd_var, width=8, justify='right').pack(side='left', padx=4)
        ttk.Button(rowg2b, text="Enviar", command=self.send_kd).pack(side='left')
        rowg3 = ttk.Frame(grp_g); rowg3.pack(fill='x', pady=2)
        ttk.Label(rowg3, text="DB (mm ou %):").pack(side='left'); ttk.Entry(rowg3, textvariable=self.db_var, width=8, justify='right').pack(side='left', padx=4)
        ttk.Button(rowg3, text="Enviar", command=self.send_db).pack(side='left')

        # util
        grp_u = ttk.LabelFrame(right, text="Util", padding=8); grp_u.pack(fill='x', pady=(8,0))
        ttk.Button(grp_u, text="R (recuo)", command=lambda: self._tx("R")).pack(fill='x', pady=2)
        ttk.Button(grp_u, text="A (avanço)", command=lambda: self._tx("A")).pack(fill='x', pady=2)
        ttk.Button(grp_u, text="ok (parar motor)", command=lambda: self._tx("ok")).pack(fill='x', pady=2)

        # presets
        grp_p = ttk.LabelFrame(right, text="Presets de teste", padding=8); grp_p.pack(fill='x', pady=(8,0))

        rowp0 = ttk.Frame(grp_p); rowp0.pack(fill='x', pady=2)
        ttk.Label(rowp0, text="Dwell (s):").pack(side='left')
        self.entry_dwell = ttk.Entry(rowp0, textvariable=self.dwell_var, width=6, justify='right'); self.entry_dwell.pack(side='left', padx=4)
        ttk.Label(rowp0, text="Reps:").pack(side='left')
        self.entry_reps = ttk.Entry(rowp0, textvariable=self.reps_var, width=6, justify='right'); self.entry_reps.pack(side='left', padx=4)

        rowp1 = ttk.Frame(grp_p); rowp1.pack(fill='x', pady=2)
        ttk.Label(rowp1, text="Base:").pack(side='left')
        ttk.Entry(rowp1, textvariable=self.base_var, width=6, justify='right').pack(side='left', padx=4)
        ttk.Label(rowp1, text="Ampl.:").pack(side='left')
        ttk.Entry(rowp1, textvariable=self.ampl_var, width=6, justify='right').pack(side='left', padx=4)

        ttk.Button(grp_p, text="Degrau único (base→base+ampl)", command=self.run_preset_step).pack(fill='x', pady=2)
        ttk.Button(grp_p, text="3 degraus (base, +A, +2A)", command=self.run_preset_3steps).pack(fill='x', pady=2)
        ttk.Button(grp_p, text="Sobe-desce (base↔base+A)", command=self.run_preset_updown).pack(fill='x', pady=2)

        rowp2 = ttk.Frame(grp_p); rowp2.pack(fill='x', pady=2)
        ttk.Label(rowp2, text="Quadrada ciclos:").pack(side='left')
        ttk.Entry(rowp2, textvariable=self.cycles_var, width=6, justify='right').pack(side='left', padx=4)
        ttk.Button(grp_p, text="Quadrada (0↔A)", command=self.run_preset_square).pack(side='left', padx=6)

        ttk.Label(grp_p, text="Custom lista (ex.: 0,10,20,10,0)").pack(anchor='w', pady=(6,0))
        ttk.Entry(grp_p, textvariable=self.custom_list_var).pack(fill='x')
        ttk.Button(grp_p, text="Rodar CUSTOM", command=self.run_preset_custom).pack(fill='x', pady=4)
        ttk.Button(grp_p, text="Parar teste", command=self.stop_test, style="Danger.TButton").pack(fill='x', pady=(2,0))

        # comando livre
        grp_tx = ttk.LabelFrame(right, text="Comando livre (TX)", padding=8); grp_tx.pack(fill='x', pady=(8,0))
        self.tx_entry_var = tk.StringVar(value="")
        entry_tx = ttk.Entry(grp_tx, textvariable=self.tx_entry_var)
        entry_tx.pack(fill='x', pady=(0,6))
        entry_tx.bind("<Return>", lambda e: self.send_entry())
        ttk.Button(grp_tx, text="Enviar", command=self.send_entry).pack(fill='x')

        # rodapé
        foot = ttk.Frame(self.root, padding=(8,0,8,8)); foot.pack(fill='x')
        ttk.Label(foot, text="CSV salva RX e eventos; pode habilitar TX também.").pack(anchor='w')

        # estilo danger
        style = ttk.Style(self.root)
        style.configure("Danger.TButton", foreground="white", background="#b00020")
        style.map("Danger.TButton", background=[('active', '#d0002a')])

    # ---------------- validação/aux ----------------
    def _parse_float(self, s, default=0.0):
        try:
            return float(str(s).strip().replace(",", "."))
        except Exception:
            return default

    def _refresh_ports(self):
        ports = [p.device for p in serial.tools.list_ports.comports()]
        self.cbo_port['values'] = ports
        if ports and not self.cbo_port.get():
            self.cbo_port.set(ports[0])

    def _open_csv_if_needed(self):
        try:
            new_file = not os.path.exists(self.csv_path) or os.path.getsize(self.csv_path) == 0
            self.csv_file = open(self.csv_path, 'a', newline='', encoding='utf-8')
            self.csv_writer = csv.writer(self.csv_file, delimiter=CSV_DELIM)
            if new_file:
                self.csv_writer.writerow(['hora', 'direcao', 'linha'])
                self.csv_file.flush()
            return True
        except Exception as e:
            messagebox.showerror("CSV", f"Não consegui abrir CSV: {e}")
            self.csv_file = None; self.csv_writer = None
            return False

    def _close_csv(self):
        try:
            if self.csv_file:
                self.csv_file.flush()
                self.csv_file.close()
        except Exception:
            pass
        self.csv_file = None
        self.csv_writer = None

    def _write_csv(self, direcao, text):
        if not self.csv_writer: return
        hora = datetime.now().strftime('%H:%M:%S.%f')[:-3]
        try:
            self.csv_writer.writerow([hora, direcao, text])
            if self.csv_file: self.csv_file.flush()
        except Exception as e:
            self._log(f"[ERRO CSV] {e}\n")

    def _mark_event(self, txt):  # marca no CSV e console
        self._log(f"[EVENT] {txt}\n")
        self._write_csv("EVENT", txt)

    # ---------------- util de estabilidade ----------------
    def _append_y(self, y_mm: float):
        """Guarda (t, y_mm) numa janela deslizante ~12 s."""
        t = time.time()
        with self._buf_lock:
            self._ywin.append((t, y_mm))
            # poda antigas
            cutoff = t - self._ywin_max_span
            while self._ywin and self._ywin[0][0] < cutoff:
                self._ywin.popleft()

    def _is_stable(self, span_s: float = 8.0, tol_mm: float = 1.5):
        """Retorna (bool, duracao_acumulada, min_y, max_y) se a janela de 'span_s'
        atingir variação < tol_mm."""
        t_now = time.time()
        with self._buf_lock:
            # garantimos somente pontos dentro da janela pedida
            cutoff = t_now - span_s
            window_vals = [y for (t, y) in self._ywin if t >= cutoff]
        if len(window_vals) < 2:
            return False, 0.0, None, None
        y_min = min(window_vals)
        y_max = max(window_vals)
        stable = (y_max - y_min) < tol_mm
        # duração efetiva da janela (entre primeiro e último ponto usados)
        # se a janela cobrir menos que span_s, não consideramos estável ainda
        with self._buf_lock:
            times = [t for (t, _) in self._ywin if t >= cutoff]
        dur = (times[-1] - times[0]) if times else 0.0
        return (stable and dur >= (span_s - 0.05)), dur, y_min, y_max

    # ---------------- serial ----------------
    def choose_csv(self):
        path = filedialog.asksaveasfilename(
            title="Salvar CSV",
            initialdir=_base_dir(),
            defaultextension=".csv",
            filetypes=[("CSV", "*.csv")],
            initialfile=os.path.basename(self.csv_path)
        )
        if not path: return
        self._close_csv()
        self.csv_path = path
        self.lbl_csv.config(text=self.csv_path)

    def connect(self):
        if self.ser and self.ser.is_open: return
        port = self.cbo_port.get().strip()
        if not port:
            messagebox.showwarning("Porta", "Selecione uma porta COM.")
            return
        try:
            self.ser = serial.Serial(port, BAUD, timeout=0.1)
            self.ser.setDTR(True); self.ser.setRTS(True)
        except Exception as e:
            messagebox.showerror("Erro ao abrir porta", str(e))
            return

        if not self._open_csv_if_needed():
            try: self.ser.close()
            except Exception: pass
            self.ser = None
            return

        self._log(f"[OK] Conectado em {port} @ {BAUD} bps\n")
        self._log(f"[CSV] Gravando em: {self.csv_path}\n")

        self.stop_flag.clear()
        self.reader_thread = threading.Thread(target=self._reader_loop, daemon=True)
        self.reader_thread.start()

        self.btn_connect.configure(state='disabled')
        self.btn_stop.configure(state='normal')

        # já envia a seleção atual
        self.send_sel()

    def disconnect(self):
        # para teste em andamento
        self.stop_test()
        self.stop_flag.set()
        if self.reader_thread: self.reader_thread.join(timeout=1.0)
        if self.ser:
            try: self.ser.close()
            except Exception: pass
            self.ser = None
        self._close_csv()
        self._log("[OK] Desconectado.\n")
        self.btn_stop.configure(state='disabled')
        self.btn_connect.configure(state='normal')

    def _reader_loop(self):
        buf = b""
        while not self.stop_flag.is_set():
            try:
                data = self.ser.read(1024)
            except Exception as e:
                self._log(f"[ERRO leitura] {e}\n")
                break
            if not data: continue
            buf += data
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                text = line.decode(errors='replace').rstrip("\r")
                self._on_rx_line(text)
        if buf:
            try:
                text = buf.decode(errors='replace').rstrip("\r")
                if text: self._on_rx_line(text)
            except Exception:
                pass

    def _on_rx_line(self, text):
        # Log e CSV
        self._log(text + "\n")
        self._write_csv("RX", text)

        # Parse telemetria "ms;SP_mm;Y_mm;PWM"
        try:
            # ignora header
            if text.startswith("ms;SP_mm;Y_mm;PWM"):
                return
            parts = text.split(CSV_DELIM)
            if len(parts) >= 4:
                # ms = int(parts[0])  # não precisamos aqui
                # sp = float(parts[1].replace(",", "."))
                y  = float(parts[2].replace(",", "."))
                self.last_y_mm = y
                self._append_y(y)
        except Exception:
            # se não parseou, segue a vida
            pass

    def _tx(self, s):
        if not self.ser or not self.ser.is_open:
            messagebox.showwarning("Serial", "Conecte primeiro.")
            return
        ending = ENDINGS.get(self.ending_choice.get(), b"\n")
        data = s.encode('utf-8', errors='replace') + ending
        try:
            self.ser.write(data)
            self._log(f">>> {s}\n")
            if self.echo_tx_csv.get():
                self._write_csv("TX", s)
        except Exception as e:
            self._log(f"[ERRO TX] {e}\n")

    # ---------------- comandos rápidos ----------------
    def send_sel(self):
        val = int(self.sel_var.get())
        val = max(1, min(6, val))
        self._tx(f"sel={val}")

    def send_sp_manual(self):
        v = self._parse_float(self.sp_entry_var.get(), 0.0)
        if self.units.get() == "mm":
            self._tx(f"spmm={v:.3f}")
        else:
            v = max(0.0, min(100.0, v))
            self._tx(f"sp={v:.2f}")

    def send_kp(self):
        v = self._parse_float(self.kp_var.get(), 0.0)
        if self.units.get() == "mm":
            self._tx(f"kpmm={v}")
        else:
            self._tx(f"kp={v}")

    def send_ki(self):
        v = self._parse_float(self.ki_var.get(), 0.0)
        if self.units.get() == "mm":
            self._tx(f"kimm={v}")
        else:
            self._tx(f"ki={v}")

    def send_kd(self):  # NEW
        v = self._parse_float(self.kd_var.get(), 0.0)
        if self.units.get() == "mm":
            self._tx(f"kdmm={v}")
        else:
            self._tx(f"kd={v}")

    def send_db(self):
        v = self._parse_float(self.db_var.get(), 0.0)
        if self.units.get() == "mm":
            self._tx(f"dbmm={v}")
        else:
            self._tx(f"db={v}")

    def send_entry(self):
        s = getattr(self, "tx_entry_var", tk.StringVar()).get().strip()
        if not s: return
        self._tx(s)

    # ---------------- presets ----------------
    def _run_sequence(self, points, dwell_s, reps=1):
        """Roda uma sequência de SPs (mm ou %) com dwell entre pontos, em thread."""
        if self.test_thread and self.test_thread.is_alive():
            messagebox.showinfo("Teste", "Já existe um teste rodando.")
            return
        try:
            dwell = float(dwell_s)
            reps = int(reps)
        except Exception:
            messagebox.showwarning("Parâmetros", "Dwell e reps inválidos.")
            return

        mode = self.units.get()
        cmd_name = "spmm" if mode == "mm" else "sp"

        def worker():
            self.test_stop.clear()
            self._mark_event(f"START {mode} sequence: {points} | dwell={dwell}s reps={reps}")
            for r in range(1, reps+1):
                if self.test_stop.is_set(): break
                self._mark_event(f"rep {r}/{reps}")
                for p in points:
                    if self.test_stop.is_set(): break
                    # clamp básico para %
                    if mode == "%" and (p < 0 or p > 100):
                        self._mark_event(f"clamped {p} to [0,100]")
                        p = max(0, min(100, p))
                    self._mark_event(f"SP→ {p} {mode}")
                    self._tx(f"{cmd_name}={p:.3f}")
                    # espera dwell em fatias curtas pra poder parar
                    t0 = time.time()
                    while time.time() - t0 < dwell:
                        if self.test_stop.is_set(): break
                        time.sleep(0.05)
                if self.test_stop.is_set(): break
            self._mark_event("END sequence")

        self.test_thread = threading.Thread(target=worker, daemon=True)
        self.test_thread.start()

    def stop_test(self):
        self.test_stop.set()

    # ---- botões de preset ----
    def _get_base_amp(self):
        base = self._parse_float(self.base_var.get(), 0.0)
        ampl = self._parse_float(self.ampl_var.get(), 0.0)
        return base, ampl

    def run_preset_step(self):
        base, ampl = self._get_base_amp()
        seq = [base, base + ampl]
        self._run_sequence(seq, self.dwell_var.get(), self.reps_var.get())

    def run_preset_3steps(self):
        base, ampl = self._get_base_amp()
        seq = [base, base + ampl, base + 2*ampl]
        self._run_sequence(seq, self.dwell_var.get(), self.reps_var.get())

    def run_preset_updown(self):
        base, ampl = self._get_base_amp()
        seq = [base, base + ampl, base, base + ampl, base]
        self._run_sequence(seq, self.dwell_var.get(), self.reps_var.get())

    def run_preset_square(self):
        # alterna 0 ↔ ampl (ou base ↔ base+ampl se base!=0)
        base, ampl = self._get_base_amp()
        high = base + ampl
        cycles = int(self._parse_float(self.cycles_var.get(), 1))
        seq = []
        for _ in range(cycles):
            seq += [base, high]
        self._run_sequence(seq, self.dwell_var.get(), self.reps_var.get())

    def run_preset_custom(self):
        """Custom agora só avança para o próximo SP quando estabilizar 8 s com variação < 1.5 mm."""
        raw = self.custom_list_var.get()
        try:
            vals = [float(x.strip().replace(",", ".")) for x in raw.split(",") if x.strip() != ""]
        except Exception:
            messagebox.showwarning("Custom", "Lista inválida. Ex.: 0, 10, 20, 10, 0")
            return
        if not vals:
            messagebox.showwarning("Custom", "Informe pelo menos um valor.")
            return

        if self.test_thread and self.test_thread.is_alive():
            messagebox.showinfo("Teste", "Já existe um teste rodando.")
            return

        mode = self.units.get()
        cmd_name = "spmm" if mode == "mm" else "sp"

        # parâmetros de estabilidade
        STAB_SPAN = 8.0      # segundos
        STAB_TOL  = 3.0      # mm
        MAX_WAIT_PER_POINT = 300.0  # segurança: 5 min por ponto

        def worker():
            self.test_stop.clear()
            self._mark_event(f"START CUSTOM ({mode}) vals={vals} | criterio: {STAB_SPAN}s, Δ<{STAB_TOL} mm")

            for p in vals:
                if self.test_stop.is_set(): break

                # clamp para %
                if mode == "%" and (p < 0 or p > 100):
                    self._mark_event(f"clamped {p} to [0,100]")
                    p = max(0, min(100, p))

                # limpa janela antes de cada novo SP para avaliar estabilização "a partir de agora"
                with self._buf_lock:
                    self._ywin.clear()

                self._mark_event(f"SP→ {p} {mode}")
                self._tx(f"{cmd_name}={p:.3f}")

                t_start = time.time()
                reached = False
                last_report = 0.0

                while not self.test_stop.is_set():
                    stable, dur, ymin, ymax = self._is_stable(STAB_SPAN, STAB_TOL)
                    if stable:
                        self._mark_event(f"OK estabilizado por {STAB_SPAN:.1f}s | Δ={(ymax - ymin):.3f} mm | y∈[{ymin:.3f},{ymax:.3f}]")
                        reached = True
                        break

                    # status a cada ~2 s pra acompanhar no console
                    now = time.time()
                    if now - last_report > 2.0:
                        if ymin is not None and ymax is not None:
                            self._log(f"[aguardando estabilizar] dur={dur:.1f}s Δ={(ymax - ymin):.3f} mm\n")
                        else:
                            self._log("[aguardando estabilizar] coletando amostras...\n")
                        last_report = now

                    # timeout de segurança
                    if now - t_start > MAX_WAIT_PER_POINT:
                        self._mark_event(f"TIMEOUT {MAX_WAIT_PER_POINT:.0f}s sem estabilizar (seguindo para o próximo)")
                        break

                    time.sleep(0.05)

                if not reached and self.test_stop.is_set():
                    break

            self._mark_event("END CUSTOM")

        self.test_thread = threading.Thread(target=worker, daemon=True)
        self.test_thread.start()

    # ---------------- util ----------------
    def _log(self, s):
        self.txt.insert('end', s)
        self.txt.see('end')

if __name__ == "__main__":
    root = tk.Tk()
    App(root)
    root.mainloop()
