# stewart_raw_logger.py
# Requisitos:
#   pip install pyserial
#
# O que faz:
# - Lista portas seriais disponíveis (combo)
# - Conecta / Para
# - Mostra as linhas recebidas em um console (apenas leitura)
# - Salva em CSV com duas colunas: hora ; linha (linha é 100% crua, do jeito que veio)
# - Botão "Escolher CSV…" para definir outro caminho/arquivo
# - Já inicia com um arquivo default na mesma pasta do programa

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
    # “Mesma pasta do programa”
    try:
        return os.path.dirname(os.path.abspath(__file__))
    except NameError:
        # Fallback (ex.: ambiente interativo)
        return os.getcwd()

def default_csv_path():
    ts = datetime.now().strftime("%H-%M-%S")  # só tempo, sem data
    return os.path.join(_base_dir(), f"telemetria_raw_{ts}.csv")

# ======== App ========
class App:
    def __init__(self, root):
        self.root = root
        root.title("Stewart – RAW Logger")

        self.ser = None
        self.reader_thread = None
        self.stop_flag = threading.Event()

        # CSV default na mesma pasta do programa
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

        mid = ttk.Frame(self.root, padding=(8,8,8,8))
        mid.pack(fill='both', expand=True)

        self.txt = tk.Text(mid, height=18, wrap='none')
        self.txt.pack(fill='both', expand=True, side='left')
        scroll = ttk.Scrollbar(mid, command=self.txt.yview)
        scroll.pack(side='left', fill='y')
        self.txt['yscrollcommand'] = scroll.set

        right = ttk.Frame(mid); right.pack(side='left', fill='y', padx=(8,0))
        ttk.Button(right, text="Limpar console", command=self.clear_console).pack(fill='x', pady=(0,6))
        ttk.Button(right, text="Limpar buffer serial", command=self.clear_buffer).pack(fill='x')

        foot = ttk.Frame(self.root, padding=(8,0,8,8))
        foot.pack(fill='x')
        ttk.Label(foot, text="Observação: o CSV salva exatamente a linha recebida (sem parse).").pack(anchor='w')

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
            # Alguns dispositivos precisam desses sinais:
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
                # Cabeçalho simples: hora ; linha
                self.csv_writer.writerow(['hora', 'linha'])
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
                # mantém a linha exatamente como veio
                text = line.decode(errors='replace').rstrip("\r")
                self._on_line(text)

    def _on_line(self, text: str):
        # Mostra no console
        self._log(text + "\n")

        if not self.csv_writer:
            return

        # Grava: hora ; linha (crua)
        hora = datetime.now().strftime('%H:%M:%S.%f')[:-3]  # só tempo
        try:
            self.csv_writer.writerow([hora, text])
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
