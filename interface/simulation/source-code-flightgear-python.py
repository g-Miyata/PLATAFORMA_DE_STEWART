"""
Código adaptado de flightgear-python (https://flightgear-python.readthedocs.io/en/latest/examples.html) usado como referência para o desenvolvimento de integração com FlightGear.
Simple telnet example with error handling
Requires FlightGear running with telnet enabled:
--telnet=socket,bi,60,localhost,5050,tcp
"""
import time
from pprint import pprint
from flightgear_python.fg_if import TelnetConnection

try:
    print("Tentando conectar ao FlightGear...")
    telnet_conn = TelnetConnection('localhost', 5050)
    telnet_conn.connect()
    print("✓ Conectado com sucesso!")
    
    print("\nListando propriedades top-level...")
    telnet_props = telnet_conn.list_props('/', recurse_limit=0)
    pprint(telnet_props)
    
    print("\nIniciando loop de leitura...\n")
    while True:
        try:
            roll = telnet_conn.get_prop('/orientation/roll-deg')
            print(f'Roll: {roll:.1f}deg', end=' | ')
            
            pitch = telnet_conn.get_prop('/orientation/pitch-deg')
            print(f'Pitch: {pitch:.1f}deg')
            
            time.sleep(0.1)  # Reduzido para 0.5s para evitar sobrecarga
            
        except KeyboardInterrupt:
            print("\n\nEncerrando...")
            break
        except Exception as e:
            print(f"Erro ao ler propriedade: {e}")
            time.sleep(1)
            
except ConnectionRefusedError:
    print("❌ Erro: Conexão recusada!")
    print("Certifique-se de que o FlightGear está rodando com:")
    print("  fgfs --telnet=socket,bi,60,localhost,5050,tcp")
except Exception as e:
    print(f"❌ Erro ao conectar: {e}")
finally:
    try:
        telnet_conn.disconnect()
    except:
        pass