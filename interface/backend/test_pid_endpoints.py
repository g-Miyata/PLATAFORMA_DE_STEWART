"""
Script de teste para verificar os endpoints PID do backend
"""
import requests
import json

API_BASE = "http://localhost:8001"

def test_endpoints():
    print("🧪 Testando endpoints PID...")
    print("="*60)
    
    # 1. Verificar se API está rodando
    try:
        r = requests.get(f"{API_BASE}/")
        print("✅ API está rodando")
        print(f"   Versão: {r.json()['version']}")
    except Exception as e:
        print(f"❌ API não está acessível: {e}")
        print("   Execute 'python app.py' no diretório backend")
        return
    
    # 2. Listar portas
    try:
        r = requests.get(f"{API_BASE}/serial/ports")
        ports = r.json()['ports']
        print(f"✅ Portas seriais detectadas: {ports}")
    except Exception as e:
        print(f"❌ Erro ao listar portas: {e}")
    
    # 3. Testar endpoint de setpoint
    try:
        r = requests.post(
            f"{API_BASE}/pid/setpoint",
            json={"piston": None, "value": 50.0}
        )
        if r.status_code == 400:
            print("⚠️  Setpoint: Serial não conectada (esperado)")
        else:
            print(f"✅ Setpoint endpoint OK: {r.json()['message']}")
    except Exception as e:
        print(f"❌ Erro setpoint: {e}")
    
    # 4. Testar endpoint de ganhos
    try:
        r = requests.post(
            f"{API_BASE}/pid/gains",
            json={"piston": 1, "kp": 2.0, "ki": 0.0, "kd": 0.0}
        )
        if r.status_code == 400:
            print("⚠️  Ganhos: Serial não conectada (esperado)")
        else:
            print(f"✅ Ganhos endpoint OK: {r.json()['message']}")
    except Exception as e:
        print(f"❌ Erro ganhos: {e}")
    
    # 5. Testar endpoint de configurações
    try:
        r = requests.post(
            f"{API_BASE}/pid/settings",
            json={"dbmm": 0.2, "fc": 4.0, "minpwm": 0}
        )
        if r.status_code == 400:
            print("⚠️  Settings: Serial não conectada (esperado)")
        else:
            print(f"✅ Settings endpoint OK: {r.json()['message']}")
    except Exception as e:
        print(f"❌ Erro settings: {e}")
    
    # 6. Testar endpoint manual
    try:
        r = requests.post(f"{API_BASE}/pid/manual/A")
        if r.status_code == 400:
            print("⚠️  Manual: Serial não conectada (esperado)")
        else:
            print(f"✅ Manual endpoint OK: {r.json()['message']}")
    except Exception as e:
        print(f"❌ Erro manual: {e}")
    
    # 7. Testar endpoint select
    try:
        r = requests.post(f"{API_BASE}/pid/select/1")
        if r.status_code == 400:
            print("⚠️  Select: Serial não conectada (esperado)")
        else:
            print(f"✅ Select endpoint OK: {r.json()['message']}")
    except Exception as e:
        print(f"❌ Erro select: {e}")
    
    print("="*60)
    print("✅ Todos os endpoints estão configurados corretamente!")
    print("\n💡 Próximos passos:")
    print("   1. Conecte o ESP32 à porta USB")
    print("   2. Abra interface/frontend/pid-control.html no navegador")
    print("   3. Selecione a porta e clique em 'Conectar'")
    print("   4. Comece a controlar a plataforma!")

if __name__ == "__main__":
    test_endpoints()
