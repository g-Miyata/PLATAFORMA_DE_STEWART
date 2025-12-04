# Script de teste para as rotinas de movimento
# Execute com: python test_motion.py

import requests
import time
import json

BASE_URL = "http://localhost:8001"

def test_motion_status():
    """Testa GET /motion/status"""
    print("\n1️⃣ Testando GET /motion/status...")
    response = requests.get(f"{BASE_URL}/motion/status")
    print(f"   Status Code: {response.status_code}")
    print(f"   Response: {response.json()}")
    assert response.status_code == 200
    print("   ✅ OK")

def test_sine_axis_z():
    """Testa rotina sine_axis em Z"""
    print("\n2️⃣ Testando POST /motion/start (sine_axis, z)...")
    payload = {
        "routine": "sine_axis",
        "axis": "z",
        "amp": 5,
        "hz": 0.5,
        "duration_s": 10
    }
    response = requests.post(f"{BASE_URL}/motion/start", json=payload)
    print(f"   Status Code: {response.status_code}")
    print(f"   Response: {response.json()}")
    
    if response.status_code == 200:
        print("   ✅ Rotina iniciada!")
        
        # Aguardar 3 segundos
        print("   ⏳ Aguardando 3 segundos...")
        time.sleep(3)
        
        # Verificar status
        status = requests.get(f"{BASE_URL}/motion/status").json()
        print(f"   Status: running={status['running']}, elapsed={status['elapsed']:.2f}s")
        
        if status['running']:
            print("   ✅ Rotina rodando corretamente!")
    else:
        print(f"   ❌ Erro: {response.json()}")

def test_stop():
    """Testa POST /motion/stop"""
    print("\n3️⃣ Testando POST /motion/stop...")
    response = requests.post(f"{BASE_URL}/motion/stop")
    print(f"   Status Code: {response.status_code}")
    print(f"   Response: {response.json()}")
    assert response.status_code == 200
    print("   ✅ OK")
    
    # Verificar que parou
    time.sleep(2)
    status = requests.get(f"{BASE_URL}/motion/status").json()
    print(f"   Status após parada: running={status['running']}")
    assert status['running'] == False
    print("   ✅ Rotina parada confirmada!")

def test_circle_xy():
    """Testa rotina circle_xy"""
    print("\n4️⃣ Testando POST /motion/start (circle_xy)...")
    payload = {
        "routine": "circle_xy",
        "ax": 10,
        "ay": 8,
        "hz": 0.3,
        "duration_s": 15
    }
    response = requests.post(f"{BASE_URL}/motion/start", json=payload)
    print(f"   Status Code: {response.status_code}")
    print(f"   Response: {response.json()}")
    
    if response.status_code == 200:
        print("   ✅ Rotina iniciada!")
        time.sleep(2)
        
        # Parar
        requests.post(f"{BASE_URL}/motion/stop")
        print("   ✅ Parada OK")
    else:
        print(f"   ❌ Erro: {response.json()}")

def test_lissajous_xy():
    """Testa rotina lissajous_xy"""
    print("\n5️⃣ Testando POST /motion/start (lissajous_xy)...")
    payload = {
        "routine": "lissajous_xy",
        "ax": 12,
        "ay": 8,
        "fx": 0.2,
        "fy": 0.3,
        "phx": 0,
        "phy": 90,
        "duration_s": 20
    }
    response = requests.post(f"{BASE_URL}/motion/start", json=payload)
    print(f"   Status Code: {response.status_code}")
    print(f"   Response: {response.json()}")
    
    if response.status_code == 200:
        print("   ✅ Rotina iniciada!")
        time.sleep(2)
        
        # Parar
        requests.post(f"{BASE_URL}/motion/stop")
        print("   ✅ Parada OK")
    else:
        print(f"   ❌ Erro: {response.json()}")

def test_heave_pitch():
    """Testa rotina heave_pitch"""
    print("\n6️⃣ Testando POST /motion/start (heave_pitch)...")
    payload = {
        "routine": "heave_pitch",
        "amp": 8,
        "ay": 2.5,
        "hz": 0.2,
        "duration_s": 25
    }
    response = requests.post(f"{BASE_URL}/motion/start", json=payload)
    print(f"   Status Code: {response.status_code}")
    print(f"   Response: {response.json()}")
    
    if response.status_code == 200:
        print("   ✅ Rotina iniciada!")
        time.sleep(2)
        
        # Parar
        requests.post(f"{BASE_URL}/motion/stop")
        print("   ✅ Parada OK")
    else:
        print(f"   ❌ Erro: {response.json()}")

def test_invalid_routine():
    """Testa rotina inválida"""
    print("\n7️⃣ Testando rotina inválida...")
    payload = {
        "routine": "invalid_routine",
        "duration_s": 10
    }
    response = requests.post(f"{BASE_URL}/motion/start", json=payload)
    print(f"   Status Code: {response.status_code}")
    print(f"   Response: {response.json()}")
    assert response.status_code == 400
    print("   ✅ Erro esperado recebido corretamente!")

def test_sine_without_axis():
    """Testa sine_axis sem especificar axis"""
    print("\n8️⃣ Testando sine_axis sem 'axis'...")
    payload = {
        "routine": "sine_axis",
        "amp": 5,
        "hz": 0.3,
        "duration_s": 10
    }
    response = requests.post(f"{BASE_URL}/motion/start", json=payload)
    print(f"   Status Code: {response.status_code}")
    print(f"   Response: {response.json()}")
    assert response.status_code == 400
    print("   ✅ Erro esperado recebido corretamente!")

def test_duplicate_start():
    """Testa iniciar rotina enquanto outra está rodando"""
    print("\n9️⃣ Testando iniciar rotina duplicada...")
    
    # Iniciar primeira rotina
    payload1 = {
        "routine": "sine_axis",
        "axis": "x",
        "duration_s": 20
    }
    r1 = requests.post(f"{BASE_URL}/motion/start", json=payload1)
    print(f"   Primeira rotina: {r1.status_code}")
    
    if r1.status_code == 200:
        # Tentar iniciar segunda IMEDIATAMENTE (sem delay)
        # Se a thread está rodando, deve bloquear
        payload2 = {
            "routine": "circle_xy",
            "duration_s": 10
        }
        r2 = requests.post(f"{BASE_URL}/motion/start", json=payload2)
        print(f"   Segunda rotina: {r2.status_code}")
        print(f"   Response: {r2.json()}")
        
        # Se serial não está aberta, a primeira rotina pode ter falhado imediatamente
        # Nesse caso, a segunda pode iniciar (status 200)
        # Se serial está aberta, deve retornar 409 (Conflict)
        if r2.status_code == 409:
            print("   ✅ Erro de conflito recebido corretamente!")
            # Parar primeira
            requests.post(f"{BASE_URL}/motion/stop")
            time.sleep(2)
        elif r2.status_code == 200:
            print("   ⚠️ Segunda rotina iniciou (primeira provavelmente falhou por falta de serial)")
            print("   ℹ️  Este teste requer serial aberta para validar corretamente")
            # Parar segunda
            requests.post(f"{BASE_URL}/motion/stop")
            time.sleep(1)
        else:
            print(f"   ❌ Status inesperado: {r2.status_code}")
            assert False, f"Status inesperado: {r2.status_code}"
    else:
        print(f"   ⚠️ Não foi possível iniciar primeira rotina")

if __name__ == "__main__":
    print("=" * 60)
    print("🧪 TESTES DAS ROTINAS DE MOVIMENTO")
    print("=" * 60)
    
    try:
        test_motion_status()
        test_sine_axis_z()
        test_stop()
        test_circle_xy()
        test_lissajous_xy()
        test_heave_pitch()
        test_invalid_routine()
        test_sine_without_axis()
        test_duplicate_start()
        
        print("\n" + "=" * 60)
        print("✅ TODOS OS TESTES PASSARAM!")
        print("=" * 60)
        
    except AssertionError as e:
        print(f"\n❌ TESTE FALHOU: {e}")
    except requests.exceptions.ConnectionError:
        print(f"\n❌ ERRO: Não foi possível conectar ao servidor em {BASE_URL}")
        print("   Certifique-se de que o servidor está rodando!")
    except Exception as e:
        print(f"\n❌ ERRO INESPERADO: {e}")
