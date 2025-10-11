# stewart_console.py
# Requisitos:
#   pip install pyserial
#
# O que faz:
# - Lista portas seriais disponíveis
# - Conectar / Parar
# - Console de leitura (somente leitura)
# - Salva CSV com: hora ; direcao ; linha (direcao = RX/TX)
# - Botão "h (ajuda)"
# - Setpoint digitável (0..100) com botão Enviar e Enter para enviar
# - Campos KP / KI / DB com botões individuais
# - Campo livre para qualquer comando + opções de finalização (\n, \r, \r\n)
# - Botões para limpar console e limpar buffer serial
# - Botão para escolher CSV; um default é criado na mesma pasta
# - Opção de ecoar os comandos TX no CSV

import csv
import os
import threading
from datetime import datetime
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

import serial
import serial.tools.list_ports

# ======== Config ========
BAUD = 115200
CSV_DELIM = ';'  # Excel (pt-BR) costuma abrir melhor com ';'

def _base_dir():
    try:
        return os.path.dirname(os.path.abspath(__file__))
    except NameError:
        return os.getcwd()

def default_csv_path():
    ts = datetime.now().strftime("%H-%M-%S")  # só tempo, sem data
    return os.path.join(_base_dir(), f"telemetria_raw_{ts}.csv")

ENDINGS = {
    "LF (\\n)": b"\n",
    "CR (\\r)": b"\r",
    "CRLF (\\r\\n)": b"\r\n",
    "Nenhum": b"",
}

class App:
    def __init__(self, root):
        self.root = root
        root.title("Stewart – Console de Teste (SP/Kp/Ki/DB)")

        self.ser = None
        self.reader_thread = None
        self.stop_flag = threading.Event()

        # CSV
        self.csv_path = default_csv_path()
        self.csv_file = None
        self.csv_writer = None

        # Estado UI
        self.ending_choice = tk.StringVar(value="LF (\\n)")
        self.echo_tx_csv = tk.BooleanVar(value=True)

        # Campos
        self.sp_entry_var = tk.StringVar(value="0.0")  # setpoint digitável
        self.kp_var = tk.StringVar(value="0.5")
        self.ki_var = tk.StringVar(value="0.0")
        self.db_var = tk.StringVar(value="0.5")
        self.tx_entry_var = tk.StringVar(value="")

        self._build_ui()
        self._refresh_ports()
        self.lbl_csv.config(text=self.csv_path)

    # ---------- UI ----------
    def _build_ui(self):
        # Linha 1: porta / conectar / parar / escolher CSV
        top = ttk.Frame(self.root, padding=8)
        top.pack(fill='x')

        ttk.Label(top, text="Porta:").pack(side='left')
        self.cbo_port = ttk.Combobox(top, width=16, state='readonly')
        self.cbo_port.pack(side='left', padx=(4,8))
        ttk.Button(top, text="↻", width=3, command=self._refresh_ports).pack(side='left', padx=(0,8))

        self.btn_connect = ttk.Button(top, text="Conectar e Gravar", command=self.connect)
        self.btn_connect.pack(side='left', padx=4)

        self.btn_stop = ttk.Button(top, text="Parar", command=self.disconnect, state='disabled')
        self.btn_stop.pack(side='left', padx=4)

        ttk.Button(top, text="Escolher CSV…", command=self.choose_csv).pack(side='left', padx=8)
        self.lbl_csv = ttk.Label(top, text="(sem arquivo selecionado)")
        self.lbl_csv.pack(side='left', padx=6)

        # Linha 2: opções de TX
        opts = ttk.Frame(self.root, padding=(8,0,8,0))
        opts.pack(fill='x')
        ttk.Label(opts, text="Final de linha:").pack(side='left')
        self.cbo_end = ttk.Combobox(opts, width=12, state='readonly', values=list(ENDINGS.keys()),
                                    textvariable=self.ending_choice)
        self.cbo_end.pack(side='left', padx=(4,8))
        ttk.Checkbutton(opts, text="Ecoar comandos (TX) no CSV", variable=self.echo_tx_csv).pack(side='left')

        # Linha 3: console
        mid = ttk.Frame(self.root, padding=(8,8,8,8))
        mid.pack(fill='both', expand=True)

        self.txt = tk.Text(mid, height=20, wrap='none')
        self.txt.pack(fill='both', expand=True, side='left')
        scroll = ttk.Scrollbar(mid, command=self.txt.yview)
        scroll.pack(side='left', fill='y')
        self.txt['yscrollcommand'] = scroll.set

        # Lado direito: ações
        right = ttk.Frame(mid)
        right.pack(side='left', fill='y', padx=(8,0))

        # Grupo ajuda
        grp_help = ttk.LabelFrame(right, text="Ajuda", padding=8)
        grp_help.pack(fill='x')
        ttk.Button(grp_help, text="h (ajuda)", command=lambda: self._tx("h")).pack(fill='x', pady=2)

        # Grupo SP (digitável)
        grp_sp = ttk.LabelFrame(right, text="Setpoint (%)", padding=8)
        grp_sp.pack(fill='x', pady=(8,0))

        # Validação simples: permitir dígitos, ponto e vazio (para digitação gradual)
        vcmd = (self.root.register(self._validate_float_input), "%P")
        try:
            # ttk.Spinbox disponível em Tk >= 8.5/8.6
            self.sp_spin = ttk.Spinbox(
                grp_sp,
                from_=0.0, to=100.0, increment=0.1,
                textvariable=self.sp_entry_var,
                validate="key", validatecommand=vcmd,
                width=8, justify="right"
            )
        except Exception:
            # Fallback: Entry
            self.sp_spin = ttk.Entry(
                grp_sp,
                textvariable=self.sp_entry_var,
                validate="key", validatecommand=vcmd,
                width=8, justify="right"
            )
        self.sp_spin.pack(side='left')
        ttk.Label(grp_sp, text="  (0 a 100, ex.: 37.5)").pack(side='left')

        # Enter envia SP
        self.sp_spin.bind("<Return>", lambda e: self.send_sp())

        ttk.Button(grp_sp, text="Enviar SP", command=self.send_sp).pack(fill='x', pady=(8,0))

        # Grupo ganhos
        grp_g = ttk.LabelFrame(right, text="Ganhos", padding=8)
        grp_g.pack(fill='x', pady=(8,0))

        row = ttk.Frame(grp_g); row.pack(fill='x', pady=2)
        ttk.Label(row, text="Kp: ").pack(side='left')
        ttk.Entry(row, textvariable=self.kp_var, width=8, justify='right').pack(side='left', padx=(2,8))
        ttk.Button(row, text="Enviar", command=self.send_kp).pack(side='left')

        row2 = ttk.Frame(grp_g); row2.pack(fill='x', pady=2)
        ttk.Label(row2, text="Ki: ").pack(side='left')
        ttk.Entry(row2, textvariable=self.ki_var, width=8, justify='right').pack(side='left', padx=(2,8))
        ttk.Button(row2, text="Enviar", command=self.send_ki).pack(side='left')

        row3 = ttk.Frame(grp_g); row3.pack(fill='x', pady=2)
        ttk.Label(row3, text="DB: ").pack(side='left')
        ttk.Entry(row3, textvariable=self.db_var, width=8, justify='right').pack(side='left', padx=(2,8))
        ttk.Button(row3, text="Enviar", command=self.send_db).pack(side='left')

        # Grupo comando livre
        grp_tx = ttk.LabelFrame(right, text="Comando livre", padding=8)
        grp_tx.pack(fill='x', pady=(8,0))
        entry_tx = ttk.Entry(grp_tx, textvariable=self.tx_entry_var)
        entry_tx.pack(fill='x', pady=(0,6))
        entry_tx.bind("<Return>", lambda e: self.send_entry())
        ttk.Button(grp_tx, text="Enviar", command=self.send_entry).pack(fill='x')

        # Botões utilidades
        util = ttk.Frame(right); util.pack(fill='x', pady=(8,0))
        ttk.Button(util, text="Limpar console", command=self.clear_console).pack(fill='x', pady=2)
        ttk.Button(util, text="Limpar buffer serial", command=self.clear_buffer).pack(fill='x', pady=2)

        # Rodapé
        foot = ttk.Frame(self.root, padding=(8,0,8,8))
        foot.pack(fill='x')
        ttk.Label(foot, text="CSV salva linhas cruas de RX e também os comandos TX (se habilitado).").pack(anchor='w')

    # ---------- Validação de número ----------
    def _validate_float_input(self, proposed: str) -> bool:
        # Permite vazio (enquanto digitando), ou número com ponto
        if proposed.strip() == "":
            return True
        try:
            float(proposed)
            return True
        except ValueError:
            return False

    # ---------- CSV ----------
    def _open_csv_if_needed(self):
        try:
            new_file = not os.path.exists(self.csv_path) or os.path.getsize(self.csv_path) == 0
            self.csv_file = open(self.csv_path, 'a', newline='', encoding='utf-8')
            self.csv_writer = csv.writer(self.csv_file, delimiter=CSV_DELIM)
            if new_file:
                self.csv_writer.writerow(['hora', 'direcao', 'linha'])  # direcao = RX/TX
                self.csv_file.flush()
        except Exception as e:
            messagebox.showerror("CSV", f"Não consegui abrir CSV: {e}")
            self.csv_writer = None
            self.csv_file = None
            return False
        return True

    def _close_csv(self):
        try:
            if self.csv_file:
                self.csv_file.flush()
                self.csv_file.close()
        except Exception:
            pass
        self.csv_file = None
        self.csv_writer = None

    def _write_csv(self, direcao: str, text: str):
        if not self.csv_writer:
            return
        hora = datetime.now().strftime('%H:%M:%S.%f')[:-3]
        try:
            self.csv_writer.writerow([hora, direcao, text])
            if self.csv_file:
                self.csv_file.flush()
        except Exception as e:
            self._log(f"[ERRO CSV] {e}\n")

    # ---------- Conectar / Parar ----------
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
        if not path:
            return
        self._close_csv()
        self.csv_path = path
        self.lbl_csv.config(text=self.csv_path)

    def connect(self):
        if self.ser and self.ser.is_open:
            return
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

    def disconnect(self):
        self.stop_flag.set()
        if self.reader_thread:
            self.reader_thread.join(timeout=1.0)

        if self.ser:
            try: self.ser.close()
            except Exception: pass
            self.ser = None

        self._close_csv()
        self._log("[OK] Desconectado.\n")

        self.btn_stop.configure(state='disabled')
        self.btn_connect.configure(state='normal')

    # ---------- Leitura / Escrita ----------
    def _reader_loop(self):
        buf = b""
        while not self.stop_flag.is_set():
            try:
                data = self.ser.read(1024)
            except Exception as e:
                self._log(f"[ERRO leitura] {e}\n")
                break
            if not data:
                continue
            buf += data
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                text = line.decode(errors='replace').rstrip("\r")
                self._on_rx_line(text)

        # flush final (linhas sem \n)
        if buf:
            try:
                text = buf.decode(errors='replace').rstrip("\r")
                if text:
                    self._on_rx_line(text)
            except Exception:
                pass

    def _on_rx_line(self, text: str):
        self._log(text + "\n")
        self._write_csv("RX", text)

    def _tx(self, s: str):
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

    # ---------- Ações de envio ----------
    def _clamp(self, v: float, lo: float, hi: float) -> float:
        return max(lo, min(hi, v))

    def send_sp(self):
        s = self.sp_entry_var.get().strip().replace(",", ".")
        if s == "":
            messagebox.showwarning("SP", "Informe um valor entre 0 e 100.")
            return
        try:
            v = float(s)
        except ValueError:
            messagebox.showwarning("SP", "Valor inválido. Use números, ex.: 37.5")
            return
        v = self._clamp(v, 0.0, 100.0)
        # normaliza o texto do campo (clamp + 1 casa decimal)
        self.sp_entry_var.set(f"{v:.1f}")
        self._tx(f"sp={v:.2f}")

    def send_kp(self):
        try:
            v = float(self.kp_var.get().strip().replace(",", "."))
        except ValueError:
            messagebox.showwarning("Kp", "Valor inválido.")
            return
        self._tx(f"kp={v}")

    def send_ki(self):
        try:
            v = float(self.ki_var.get().strip().replace(",", "."))
        except ValueError:
            messagebox.showwarning("Ki", "Valor inválido.")
            return
        self._tx(f"ki={v}")

    def send_db(self):
        try:
            v = float(self.db_var.get().strip().replace(",", "."))
        except ValueError:
            messagebox.showwarning("DB", "Valor inválido.")
            return
        self._tx(f"db={v}")

    def send_entry(self):
        s = self.tx_entry_var.get().strip()
        if not s:
            return
        self._tx(s)
        # mantém o texto para repetir se quiser; apague se preferir:
        # self.tx_entry_var.set("")

    # ---------- Utilidades ----------
    def clear_console(self):
        self.txt.delete('1.0', 'end')

    def clear_buffer(self):
        if self.ser and self.ser.is_open:
            try:
                self.ser.reset_input_buffer()
                self._log("[OK] Buffer da serial limpo.\n")
            except Exception as e:
                self._log(f"[ERRO] {e}\n")

    def _log(self, s):
        self.txt.insert('end', s)
        self.txt.see('end')

if __name__ == "__main__":
    root = tk.Tk()
    App(root)
    root.mainloop()
