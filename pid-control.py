# stewart_full_control.py
# Requisitos:
#   pip install pyserial
#
# O que faz:
# - Lista portas, conecta/desconecta e grava CSV (RX e, opcionalmente, TX)
# - Setpoint global em mm (spmm=VAL) e individuais (spmmN=VAL)
# - Ganhos Kp/Ki/Kd por pistão e "para todos"
# - Feedforward U0_adv/U0_ret por pistão e "para todos"
# - Ajustes dbmm, fc, minpwm
# - Modo manual A/R/ok no pistão selecionado (mantido)
# - Console RX/TX e painel com Y1..Y6 e PWM1..PWM6 em tempo real
#
# Observação:
# - Compatível com dois formatos de telemetria:
#   (novo)  ms;SP_mm;Y1;Y2;Y3;Y4;Y5;Y6;PWM1;PWM2;PWM3;PWM4;PWM5;PWM6
#   (antigo) ms;SP_mm;Y_mm;PWM

import csv
import os
import threading
import time
from datetime import datetime
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
    return os.path.join(_base_dir(), f"stewart_full_{ts}.csv")

ENDINGS = {
    "LF (\\n)": b"\n",
    "CR (\\r)": b"\r",
    "CRLF (\\r\\n)": b"\r\n",
    "Nenhum": b"",
}

class App:
    def __init__(self, root):
        self.root = root
        root.title("Stewart – Controle Completo (6 pistões)")

        # serial
        self.ser = None
        self.reader_thread = None
        self.stop_flag = threading.Event()

        # csv
        self.csv_path = default_csv_path()
        self.csv_file = None
        self.csv_writer = None

        # estados UI
        self.ending_choice = tk.StringVar(value="LF (\\n)")
        self.echo_tx_csv = tk.BooleanVar(value=False)

        self.sel_var = tk.IntVar(value=1)   # pistão p/ manual
        self.sp_global_var = tk.StringVar(value="0.0")
        self.sp_ind_vars = [tk.StringVar(value="0.0") for _ in range(6)]

        # ganhos por pistão
        self.kp_vars  = [tk.StringVar(value="2.0")  for _ in range(6)]
        self.ki_vars  = [tk.StringVar(value="0.00") for _ in range(6)]
        self.kd_vars  = [tk.StringVar(value="0.00") for _ in range(6)]

        # ajustes gerais
        self.db_var     = tk.StringVar(value="0.20")
        self.fc_var     = tk.StringVar(value="4.0")
        self.minpwm_var = tk.StringVar(value="0")

        # labels telemetria
        self.y_vals   = [tk.StringVar(value="--") for _ in range(6)]
        self.pwm_vals = [tk.StringVar(value="--") for _ in range(6)]
        self.last_sp  = tk.StringVar(value="--")

        # console livre
        self.tx_entry_var = tk.StringVar(value="")

        self._build_ui()
        self._refresh_ports()
        self.lbl_csv.config(text=self.csv_path)

    # ================== UI ==================
    def _build_ui(self):
        # Barra superior: conexão e CSV
        top = ttk.Frame(self.root, padding=8); top.pack(fill='x')
        ttk.Label(top, text="Porta:").pack(side='left')
        self.cbo_port = ttk.Combobox(top, width=16, state='readonly'); self.cbo_port.pack(side='left', padx=(4,8))
        ttk.Button(top, text="↻", width=3, command=self._refresh_ports).pack(side='left', padx=(0,8))
        self.btn_connect = ttk.Button(top, text="Conectar e Gravar", command=self.connect); self.btn_connect.pack(side='left', padx=4)
        self.btn_stop = ttk.Button(top, text="Parar", command=self.disconnect, state='disabled'); self.btn_stop.pack(side='left', padx=4)
        ttk.Button(top, text="Escolher CSV…", command=self.choose_csv).pack(side='left', padx=8)
        self.lbl_csv = ttk.Label(top, text="(sem arquivo)"); self.lbl_csv.pack(side='left', padx=6)

        # Opções de TX
        opts = ttk.Frame(self.root, padding=(8,0,8,0)); opts.pack(fill='x')
        ttk.Label(opts, text="Final de linha:").pack(side='left')
        self.cbo_end = ttk.Combobox(opts, width=12, state='readonly',
                                    values=list(ENDINGS.keys()),
                                    textvariable=self.ending_choice)
        self.cbo_end.pack(side='left', padx=(4,8))
        ttk.Checkbutton(opts, text="Ecoar TX no CSV", variable=self.echo_tx_csv).pack(side='left')

        # Área central: console + controles
        mid = ttk.Frame(self.root, padding=8); mid.pack(fill='both', expand=True)

        # Console RX/TX
        console_frame = ttk.LabelFrame(mid, text="Console", padding=6)
        console_frame.pack(side='left', fill='both', expand=True)
        self.txt = tk.Text(console_frame, height=26, wrap='none')
        self.txt.pack(fill='both', expand=True, side='left')
        scroll = ttk.Scrollbar(console_frame, command=self.txt.yview); scroll.pack(side='left', fill='y')
        self.txt['yscrollcommand'] = scroll.set

        # Controles
        right = ttk.Frame(mid); right.pack(side='left', fill='y', padx=(8,0))

        # Telemetria
        telem = ttk.LabelFrame(right, text="Telemetria (Y mm / PWM)", padding=6); telem.pack(fill='x')
        hdr = ttk.Frame(telem); hdr.pack(fill='x')
        ttk.Label(hdr, text="SP(mm):").pack(side='left')
        ttk.Label(hdr, textvariable=self.last_sp, width=8).pack(side='left', padx=(4,8))
        grid = ttk.Frame(telem); grid.pack(fill='x', pady=(4,2))
        for i in range(6):
            row = ttk.Frame(grid); row.pack(fill='x', pady=1)
            ttk.Label(row, text=f"P{i+1}: ", width=4).pack(side='left')
            ttk.Label(row, textvariable=self.y_vals[i], width=8, anchor='e').pack(side='left')
            ttk.Label(row, text="mm  |  PWM: ").pack(side='left')
            ttk.Label(row, textvariable=self.pwm_vals[i], width=6, anchor='e').pack(side='left')

        # Setpoints
        spbox = ttk.LabelFrame(right, text="Setpoints (mm)", padding=6); spbox.pack(fill='x', pady=(8,0))
        r1 = ttk.Frame(spbox); r1.pack(fill='x', pady=2)
        ttk.Label(r1, text="Global:").pack(side='left')
        ttk.Entry(r1, textvariable=self.sp_global_var, width=8, justify='right').pack(side='left', padx=4)
        ttk.Button(r1, text="Aplicar em todos", command=self.send_sp_global).pack(side='left', padx=6)

        gridsp = ttk.Frame(spbox); gridsp.pack(fill='x', pady=(4,0))
        for i in range(6):
            row = ttk.Frame(gridsp); row.pack(fill='x', pady=1)
            ttk.Label(row, text=f"P{i+1}:", width=4).pack(side='left')
            ttk.Entry(row, textvariable=self.sp_ind_vars[i], width=8, justify='right').pack(side='left', padx=4)
            ttk.Button(row, text="Enviar", command=lambda k=i: self.send_sp_ind(k)).pack(side='left')

        # Ganhos por pistão
        gbox = ttk.LabelFrame(right, text="Ganhos por pistão (mm)", padding=6); gbox.pack(fill='x', pady=(8,0))
        for i in range(6):
            row = ttk.Frame(gbox); row.pack(fill='x', pady=1)
            ttk.Label(row, text=f"P{i+1}:", width=4).pack(side='left')
            ttk.Label(row, text="Kp").pack(side='left')
            ttk.Entry(row, textvariable=self.kp_vars[i], width=6, justify='right').pack(side='left', padx=(2,6))
            ttk.Label(row, text="Ki").pack(side='left')
            ttk.Entry(row, textvariable=self.ki_vars[i], width=6, justify='right').pack(side='left', padx=(2,6))
            ttk.Label(row, text="Kd").pack(side='left')
            ttk.Entry(row, textvariable=self.kd_vars[i], width=6, justify='right').pack(side='left', padx=(2,6))
            ttk.Button(row, text="Enviar", command=lambda k=i: self.send_gains_ind(k)).pack(side='left')



        # Ajustes gerais
        adj = ttk.LabelFrame(right, text="Ajustes", padding=6); adj.pack(fill='x', pady=(8,0))
        rowd = ttk.Frame(adj); rowd.pack(fill='x', pady=2)
        ttk.Label(rowd, text="dbmm").pack(side='left')
        ttk.Entry(rowd, textvariable=self.db_var, width=6, justify='right').pack(side='left', padx=(2,8))
        ttk.Button(rowd, text="Enviar", command=self.send_db).pack(side='left', padx=(0,12))
        ttk.Label(rowd, text="fc (Hz)").pack(side='left')
        ttk.Entry(rowd, textvariable=self.fc_var, width=6, justify='right').pack(side='left', padx=(2,8))
        ttk.Button(rowd, text="Enviar", command=self.send_fc).pack(side='left', padx=(0,12))
        ttk.Label(rowd, text="minpwm").pack(side='left')
        ttk.Entry(rowd, textvariable=self.minpwm_var, width=6, justify='right').pack(side='left', padx=(2,8))
        ttk.Button(rowd, text="Enviar", command=self.send_minpwm).pack(side='left')

        # Manual
        man = ttk.LabelFrame(right, text="Manual (selecionado)", padding=6); man.pack(fill='x', pady=(8,0))
        rowm = ttk.Frame(man); rowm.pack(fill='x', pady=2)
        ttk.Label(rowm, text="sel:").pack(side='left')
        ttk.Combobox(rowm, state='readonly', width=4, values=[1,2,3,4,5,6],
                     textvariable=self.sel_var).pack(side='left', padx=4)
        ttk.Button(rowm, text="Selecionar", command=self.send_sel).pack(side='left', padx=(6,8))
        ttk.Button(rowm, text="A (avanço)", command=lambda: self._tx("A")).pack(side='left')
        ttk.Button(rowm, text="R (recuo)",  command=lambda: self._tx("R")).pack(side='left', padx=4)
        ttk.Button(rowm, text="ok (parar)", command=lambda: self._tx("ok")).pack(side='left')

        # Comando livre
        free = ttk.LabelFrame(right, text="Comando livre (TX)", padding=6); free.pack(fill='x', pady=(8,0))
        entry_tx = ttk.Entry(free, textvariable=self.tx_entry_var)
        entry_tx.pack(fill='x', pady=(0,6))
        entry_tx.bind("<Return>", lambda e: self.send_entry())
        ttk.Button(free, text="Enviar", command=self.send_entry).pack(fill='x')

        # Rodapé
        foot = ttk.Frame(self.root, padding=(8,0,8,8)); foot.pack(fill='x')
        ttk.Label(foot, text="Dica: use spmm=VAL para global e spmmN=VAL para individual.").pack(anchor='w')

    # ================== Serial / CSV ==================
    def _refresh_ports(self):
        ports = [p.device for p in serial.tools.list_ports.comports()]
        self.cbo_port['values'] = ports
        if ports and not self.cbo_port.get():
            self.cbo_port.set(ports[0])

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

    # ================== Conexão ==================
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

        # já envia a seleção atual (para manual)
        self.send_sel()

    def disconnect(self):
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

    # ================== RX/TX ==================
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
        # Console e CSV
        self._log(text + "\n")
        self._write_csv("RX", text)

        # Telemetria
        try:
            if text.startswith("ms;"):  # tenta parsear as duas versões
                parts = text.split(CSV_DELIM)
                # Novo formato: ms;SP_mm;Y1;Y2;Y3;Y4;Y5;Y6;PWM1;PWM2;PWM3;PWM4;PWM5;PWM6
                if len(parts) >= 14:
                    # partes fixas
                    sp = parts[1]
                    self.last_sp.set(sp)
                    # Y1..Y6 (2..7), PWM1..PWM6 (8..13)
                    for i in range(6):
                        self.y_vals[i].set(self._fmt(parts[2+i]))
                        self.pwm_vals[i].set(self._fmt(parts[8+i], integer=True))
                # Antigo: ms;SP_mm;Y_mm;PWM
                elif len(parts) >= 4:
                    sp = parts[1]; y = parts[2]; pwm = parts[3]
                    self.last_sp.set(sp)
                    self.y_vals[0].set(self._fmt(y))
                    self.pwm_vals[0].set(self._fmt(pwm, integer=True))
        except Exception:
            pass

    def _fmt(self, s, integer=False):
        try:
            if integer:
                return str(int(float(s.replace(',', '.'))))
            return f"{float(s.replace(',', '.')):.3f}"
        except Exception:
            return "--"

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

    def _log(self, s):
        self.txt.insert('end', s)
        self.txt.see('end')

    # ================== Helpers ==================
    def _parse_float(self, s, default=0.0):
        try:
            return float(str(s).strip().replace(",", "."))
        except Exception:
            return default

    # ================== Comandos prontos ==================
    def send_sel(self):
        v = max(1, min(6, int(self.sel_var.get())))
        self._tx(f"sel={v}")

    # Setpoints
    def send_sp_global(self):
        v = self._parse_float(self.sp_global_var.get(), 0.0)
        self._tx(f"spmm={v:.3f}")

    def send_sp_ind(self, idx):
        v = self._parse_float(self.sp_ind_vars[idx].get(), 0.0)
        self._tx(f"spmm{idx+1}={v:.3f}")

    # Ganhos
    def send_gains_ind(self, idx):
        kp = self._parse_float(self.kp_vars[idx].get(), 0.0)
        ki = self._parse_float(self.ki_vars[idx].get(), 0.0)
        kd = self._parse_float(self.kd_vars[idx].get(), 0.0)
        # precisa selecionar para usar os comandos kpmm/kimm/kdmm do "selecionado"
        self._tx(f"sel={idx+1}")
        self._tx(f"kpmm={kp}")
        self._tx(f"kimm={ki}")
        self._tx(f"kdmm={kd}")

    def send_gains_all(self):
        kp = self._parse_float(self.kp_all.get(), 0.0)
        ki = self._parse_float(self.ki_all.get(), 0.0)
        kd = self._parse_float(self.kd_all.get(), 0.0)
        self._tx(f"kpall={kp}")
        self._tx(f"kiall={ki}")
        self._tx(f"kdall={kd}")

    # Feedforward
    def send_ff_ind(self, idx):
        u0a = abs(self._parse_float(self.u0a_vars[idx].get(), 0.0))
        u0r = abs(self._parse_float(self.u0r_vars[idx].get(), 0.0))
        self._tx(f"sel={idx+1}")
        self._tx(f"u0a={u0a}")
        self._tx(f"u0r={u0r}")

    def send_ff_all(self):
        u0a = abs(self._parse_float(self.u0a_all.get(), 0.0))
        u0r = abs(self._parse_float(self.u0r_all.get(), 0.0))
        self._tx(f"u0aall={u0a}")
        self._tx(f"u0rall={u0r}")

    # Ajustes
    def send_db(self):
        v = abs(self._parse_float(self.db_var.get(), 0.0))
        self._tx(f"dbmm={v}")

    def send_fc(self):
        v = abs(self._parse_float(self.fc_var.get(), 4.0))
        self._tx(f"fc={v}")

    def send_minpwm(self):
        v = int(max(0, min(255, self._parse_float(self.minpwm_var.get(), 0))))
        self._tx(f"minpwm={v}")

    # Comando livre
    def send_entry(self):
        s = self.tx_entry_var.get().strip()
        if not s: return
        self._tx(s)

if __name__ == "__main__":
    root = tk.Tk()
    App(root)
    root.mainloop()
