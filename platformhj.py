# stewart_logger.py
# Requisitos: pip install pyserial
import csv
import os
import re
import threading
from datetime import datetime
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import serial
import serial.tools.list_ports

# ======== Config ========
BAUD = 115200
CSV_DELIM = ';'  # Excel (pt-BR) costuma abrir melhor com ';'

# Cabeçalho agora inclui alpha e colunas de valores filtrados
CSV_HEADERS = [
    'hora', 'duty_pct', 'alpha',
    'fb1_raw','fb2_raw','fb3_raw','fb4_raw','fb5_raw','fb6_raw',
    'fb1_v_raw','fb2_v_raw','fb3_v_raw','fb4_v_raw','fb5_v_raw','fb6_v_raw',
    'fb1_v_filt','fb2_v_filt','fb3_v_filt','fb4_v_filt','fb5_v_filt','fb6_v_filt'
]

# ======== REGEX ========
# Formato antigo (sem filtrado, com contagem ADC e volts):
LINE_REGEX_OLD = re.compile(
    r"Duty:\s*([0-9]+(?:\.[0-9]+)?)%.*?"
    r"FB1:\s*(\d+)\s*\(([\d\.]+)V\).*?"
    r"FB2:\s*(\d+)\s*\(([\d\.]+)V\).*?"
    r"FB3:\s*(\d+)\s*\(([\d\.]+)V\).*?"
    r"FB4:\s*(\d+)\s*\(([\d\.]+)V\).*?"
    r"FB5:\s*(\d+)\s*\(([\d\.]+)V\).*?"
    r"FB6:\s*(\d+)\s*\(([\d\.]+)V\)",
    re.IGNORECASE
)

# Formato novo (com alpha, volts bruto e volts filtrado):
# Exemplo:
# Duty=37.5%) | a=0.100 | FB1: raw 1.00V -> filt 0.92V | FB2: raw 0.98V -> filt 0.90V | ...
LINE_REGEX_NEW = re.compile(
    r"Duty\s*=\s*([0-9]+(?:\.[0-9]+)?)%\)\s*\|\s*a\s*=\s*([0-9]*\.?[0-9]+)\s*\|.*?"
    r"FB1:\s*raw\s*([\d\.]+)V\s*->\s*filt\s*([\d\.]+)V.*?"
    r"FB2:\s*raw\s*([\d\.]+)V\s*->\s*filt\s*([\d\.]+)V.*?"
    r"FB3:\s*raw\s*([\d\.]+)V\s*->\s*filt\s*([\d\.]+)V.*?"
    r"FB4:\s*raw\s*([\d\.]+)V\s*->\s*filt\s*([\d\.]+)V.*?"
    r"FB5:\s*raw\s*([\d\.]+)V\s*->\s*filt\s*([\d\.]+)V.*?"
    r"FB6:\s*raw\s*([\d\.]+)V\s*->\s*filt\s*([\d\.]+)V",
    re.IGNORECASE
)

def default_csv_path():
    ts = datetime.now().strftime("%H-%M-%S")  # só tempo, sem data
    return f"telemetria_{ts}.csv"  # mesma pasta do script

# ======== App ========
class App:
    def __init__(self, root):
        self.root = root
        root.title("Stewart – Logger & Controle")

        self.ser = None
        self.reader_thread = None
        self.stop_flag = threading.Event()

        # CSV pré-selecionado na mesma pasta
        self.csv_path = default_csv_path()
        self.csv_file = None
        self.csv_writer = None

        self._build_ui()
        self._refresh_ports()
        self.lbl_csv.config(text=self.csv_path)

    def _build_ui(self):
        top = ttk.Frame(self.root, padding=8)
        top.pack(fill='x')

        ttk.Label(top, text="Porta:").pack(side='left')
        self.cbo_port = ttk.Combobox(top, width=12, state='readonly')
        self.cbo_port.pack(side='left', padx=(4,8))
        ttk.Button(top, text="↻", width=3, command=self._refresh_ports).pack(side='left')

        self.btn_connect = ttk.Button(top, text="Conectar e Gravar", command=self.connect)
        self.btn_connect.pack(side='left', padx=6)

        self.btn_stop = ttk.Button(top, text="Parar", command=self.disconnect, state='disabled')
        self.btn_stop.pack(side='left', padx=6)

        ttk.Button(top, text="Escolher CSV…", command=self.choose_csv).pack(side='left', padx=6)
        self.lbl_csv = ttk.Label(top, text="(sem arquivo selecionado)")
        self.lbl_csv.pack(side='left', padx=6)

        mid = ttk.Frame(self.root, padding=(8,0,8,8))
        mid.pack(fill='both', expand=True)

        self.txt = tk.Text(mid, height=16, wrap='none')
        self.txt.pack(fill='both', expand=True, side='left')
        scroll = ttk.Scrollbar(mid, command=self.txt.yview)
        scroll.pack(side='left', fill='y')
        self.txt['yscrollcommand'] = scroll.set

        right = ttk.Frame(mid); right.pack(side='left', fill='y', padx=(8,0))
        ttk.Label(right, text="Comandos rápidos").pack(anchor='w')
        ttk.Button(right, text="Avanço (f)", command=lambda: self.send_cmd("f")).pack(fill='x', pady=2)
        ttk.Button(right, text="Retorno (t)", command=lambda: self.send_cmd("t")).pack(fill='x', pady=2)
        ttk.Button(right, text="Travado (b)", command=lambda: self.send_cmd("b")).pack(fill='x', pady=2)
        ttk.Button(right, text="Solto (s)",   command=lambda: self.send_cmd("s")).pack(fill='x', pady=2)

        ttk.Separator(right, orient='horizontal').pack(fill='x', pady=6)
        ttk.Label(right, text="Duty (%)").pack(anchor='w')
        self.duty_var = tk.StringVar(value="50")
        row = ttk.Frame(right); row.pack(fill='x', pady=2)
        ttk.Entry(row, textvariable=self.duty_var, width=6).pack(side='left')
        ttk.Button(row, text="Enviar", command=self.send_duty).pack(side='left', padx=4)

        row2 = ttk.Frame(right); row2.pack(fill='x', pady=2)
        for pct in (0,25,50,75,100):
            ttk.Button(row2, text=str(pct), width=3, command=lambda p=pct: self._quick_duty(p)).pack(side='left', padx=1)

        ttk.Separator(right, orient='horizontal').pack(fill='x', pady=6)
        ttk.Button(right, text="Limpar console", command=self.clear_console).pack(fill='x')
        ttk.Button(right, text="Limpar buffer serial", command=self.clear_buffer).pack(fill='x', pady=(4,0))

    def _refresh_ports(self):
        ports = [p.device for p in serial.tools.list_ports.comports()]
        self.cbo_port['values'] = ports
        if ports and not self.cbo_port.get():
            self.cbo_port.set(ports[0])

    def choose_csv(self):
        path = filedialog.asksaveasfilename(
            title="Salvar CSV",
            defaultextension=".csv",
            filetypes=[("CSV", "*.csv")],
            initialfile=self.csv_path
        )
        if not path:
            return
        self._close_csv()
        self.csv_path = path
        self.lbl_csv.config(text=self.csv_path)

    # ---------- Conectar / Parar ----------
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

        # abre/cria CSV
        try:
            new_file = not os.path.exists(self.csv_path) or os.path.getsize(self.csv_path) == 0
            self.csv_file = open(self.csv_path, 'a', newline='', encoding='utf-8')
            self.csv_writer = csv.writer(self.csv_file, delimiter=CSV_DELIM)
            if new_file:
                self.csv_writer.writerow(CSV_HEADERS)
                self.csv_file.flush()
        except Exception as e:
            messagebox.showerror("CSV", f"Não consegui abrir CSV: {e}")
            try: self.ser.close()
            except Exception: pass
            self.ser = None
            return

        self._log(f"[OK] Conectado em {port} @ {BAUD} bps\n")
        self._log(f"[CSV] Gravando em: {self.csv_path}\n")

        self.stop_flag.clear()
        self.reader_thread = threading.Thread(target=self._reader_loop, daemon=True)
        self.reader_thread.start()

        # estados dos botões
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

        self._log("[OK] Desconectado.\n")

        # estados dos botões
        self.btn_stop.configure(state='disabled')
        self.btn_connect.configure(state='normal')

    # ---------- Utilidades ----------
    def _close_csv(self):
        try:
            if self.csv_file:
                self.csv_file.flush()
                self.csv_file.close()
        except Exception:
            pass
        self.csv_file = None
        self.csv_writer = None

    def clear_console(self):
        self.txt.delete('1.0', 'end')

    def clear_buffer(self):
        if self.ser and self.ser.is_open:
            try:
                self.ser.reset_input_buffer()
                self._log("[OK] Buffer da serial limpo.\n")
            except Exception as e:
                self._log(f"[ERRO] {e}\n")

    def _quick_duty(self, pct):
        self.duty_var.set(str(pct))
        self.send_duty()

    def send_cmd(self, cmd):
        if not (self.ser and self.ser.is_open):
            self._log("[ERRO envio] porta não conectada.\n"); return
        try:
            self.ser.write((cmd + "\n").encode('utf-8'))
        except Exception as e:
            self._log(f"[ERRO envio] {e}\n")

    def send_duty(self):
        s = self.duty_var.get().strip()
        if not s:
            return
        if s.endswith('%'):
            s = s[:-1]
        try:
            val = float(s)
        except ValueError:
            messagebox.showerror("Duty inválido", "Digite um número entre 0 e 100.")
            return
        val = max(0.0, min(100.0, val))
        self.send_cmd(f"{val}")

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
                text = line.decode(errors='replace').strip()
                self._on_line(text)

    def _on_line(self, text):
        # Mostra no console
        self._log(text + "\n")

        if not self.csv_writer:
            return

        # Tenta formato novo primeiro (com alpha e filtrado)
        m_new = LINE_REGEX_NEW.search(text)
        if m_new:
            duty = float(m_new.group(1))
            alpha = float(m_new.group(2))

            # volts bruto e filtrado por FB (FB1..FB6)
            v_raw = [float(m_new.group(i)) for i in (3,5,7,9,11,13)]
            v_flt = [float(m_new.group(i)) for i in (4,6,8,10,12,14)]

            # como o formato novo não traz a contagem ADC, deixamos vazio
            fb_raw_counts = [""]*6

            hora = datetime.now().strftime('%H:%M:%S.%f')[:-3]
            row = (
                [hora, f"{duty:.1f}", f"{alpha:.3f}"]
                + fb_raw_counts
                + [f"{v:.2f}" for v in v_raw]
                + [f"{v:.2f}" for v in v_flt]
            )
            try:
                self.csv_writer.writerow(row)
                if self.csv_file:
                    self.csv_file.flush()
            except Exception as e:
                self._log(f"[ERRO CSV] {e}\n")
            return

        # Tenta formato antigo (sem alpha e sem filtrado)
        m_old = LINE_REGEX_OLD.search(text)
        if m_old:
            duty = float(m_old.group(1))
            fb_raw = [int(m_old.group(i)) for i in (2,4,6,8,10,12)]
            v_raw  = [float(m_old.group(i)) for i in (3,5,7,9,11,13)]
            v_flt  = [""]*6  # sem filtrado nesse formato
            alpha  = ""      # sem alpha nesse formato

            hora = datetime.now().strftime('%H:%M:%S.%f')[:-3]
            row = (
                [hora, f"{duty:.1f}", alpha]
                + fb_raw
                + [f"{v:.2f}" for v in v_raw]
                + v_flt
            )
            try:
                self.csv_writer.writerow(row)
                if self.csv_file:
                    self.csv_file.flush()
            except Exception as e:
                self._log(f"[ERRO CSV] {e}\n")

    def _log(self, s):
        self.txt.insert('end', s)
        self.txt.see('end')

if __name__ == "__main__":
    root = tk.Tk()
    App(root)
    root.mainloop()
