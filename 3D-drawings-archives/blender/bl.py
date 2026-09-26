"""Cliente mínimo do add-on BlenderMCP (socket JSON em 127.0.0.1:9876).

  python bl.py exec script.py          executa um script Python dentro do Blender
                                       (com REPO = raiz do repositório já definido)
  python bl.py shot saida.png [lado]   captura o viewport
  python bl.py info                    informações da cena
"""
import json
import os
import socket
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def send(cmd_type, params=None, timeout=180):
    s = socket.create_connection(("127.0.0.1", 9876), timeout=5)
    s.settimeout(timeout)
    s.sendall(json.dumps({"type": cmd_type, "params": params or {}}).encode())
    buf = b""
    while True:
        chunk = s.recv(1 << 20)
        if not chunk:
            break
        buf += chunk
        try:
            data = json.loads(buf.decode())
            break
        except ValueError:
            continue
    s.close()
    return data


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "exec":
        code = f"REPO = {REPO!r}\n" + open(sys.argv[2], encoding="utf-8").read()
        r = send("execute_code", {"code": code})
    elif cmd == "shot":
        size = int(sys.argv[3]) if len(sys.argv) > 3 else 1200
        r = send("get_viewport_screenshot", {"filepath": sys.argv[2], "max_size": size, "format": "png"})
    else:
        r = send("get_scene_info")
    out = json.dumps(r, ensure_ascii=False)
    print(out[:6000])
