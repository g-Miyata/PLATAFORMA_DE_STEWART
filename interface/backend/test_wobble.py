"""
Teste rápido da rotina wobble_precession
"""
import requests
import time

API_BASE = "http://localhost:8001"

def test_wobble_precession():
    """Testa a nova rotina wobble_precession"""
    print("🧪 Testando wobble_precession...")
    
    # 1. Verificar status inicial
    resp = requests.get(f"{API_BASE}/motion/status")
    print(f"📊 Status inicial: {resp.json()}")
    
    # 2. Iniciar wobble padrão
    payload = {
        "routine": "wobble_precession",
        "duration_s": 5,  # Teste curto de 5s
        "prec_hz": 0.4,
        "yaw_hz": 0.1,
        "tilt_deg": 3.0,
        "tilt_bias_deg": 0.0,
        "z_amp_mm": 6.0,
        "z_phase_deg": 90
    }
    
    print(f"\n🚀 Iniciando wobble com payload: {payload}")
    resp = requests.post(f"{API_BASE}/motion/start", json=payload)
    print(f"📡 Response: {resp.status_code} - {resp.json()}")
    
    if resp.status_code != 200:
        print("❌ Falha ao iniciar rotina!")
        return False
    
    # 3. Monitorar status durante execução
    print("\n⏱️  Monitorando execução...")
    for i in range(6):
        time.sleep(1)
        status = requests.get(f"{API_BASE}/motion/status").json()
        print(f"   t={i}s: running={status['running']}, elapsed={status.get('elapsed', 0):.2f}s")
        
        if not status['running'] and i < 4:
            print("⚠️ Rotina parou antes do esperado!")
            break
    
    # 4. Parar rotina
    print("\n⏹️  Parando rotina...")
    resp = requests.post(f"{API_BASE}/motion/stop")
    print(f"📡 Response: {resp.status_code} - {resp.json()}")
    
    # 5. Verificar status final
    time.sleep(0.5)
    status = requests.get(f"{API_BASE}/motion/status").json()
    print(f"\n📊 Status final: running={status['running']}")
    
    print("\n✅ Teste concluído com sucesso!")
    return True

def test_wobble_fast():
    """Testa wobble com parâmetros diferentes"""
    print("\n\n🧪 Testando wobble rápido...")
    
    payload = {
        "routine": "wobble_precession",
        "duration_s": 3,
        "prec_hz": 0.6,
        "yaw_hz": 0.15,
        "tilt_deg": 2.5,
        "z_amp_mm": 5,
        "z_phase_deg": 0
    }
    
    print(f"🚀 Iniciando wobble rápido: {payload}")
    resp = requests.post(f"{API_BASE}/motion/start", json=payload)
    print(f"📡 Response: {resp.status_code} - {resp.json()}")
    
    if resp.status_code != 200:
        print("❌ Falha ao iniciar rotina!")
        return False
    
    # Aguardar conclusão
    time.sleep(4)
    
    status = requests.get(f"{API_BASE}/motion/status").json()
    print(f"📊 Status final: running={status['running']}")
    print("✅ Teste rápido concluído!")
    return True

if __name__ == "__main__":
    print("=" * 60)
    print("🧪 TESTE DA ROTINA WOBBLE_PRECESSION")
    print("=" * 60)
    print("\n⚠️  Certifique-se de que o servidor está rodando em localhost:8001")
    print("⚠️  Serial NÃO precisa estar conectado para este teste\n")
    
    input("Pressione ENTER para iniciar os testes...")
    
    try:
        test_wobble_precession()
        test_wobble_fast()
        print("\n" + "=" * 60)
        print("🎉 TODOS OS TESTES PASSARAM!")
        print("=" * 60)
    except requests.exceptions.ConnectionError:
        print("\n❌ ERRO: Não foi possível conectar ao servidor!")
        print("   Execute: python app.py")
    except Exception as e:
        print(f"\n❌ ERRO: {e}")
        import traceback
        traceback.print_exc()
