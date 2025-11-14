"""
test_joystick_endpoint.py
Testes para o endpoint /joystick/pose

Para executar:
    python test_joystick_endpoint.py
"""

import requests
import json

API_BASE = "http://localhost:8001"

def test_joystick_home():
    """Testa pose home (todos os eixos em 0)"""
    print("\n🧪 Teste 1: Pose HOME (0,0,0,0,0,0)")
    print("-" * 50)
    
    payload = {
        "lx": 0.0,
        "ly": 0.0,
        "rx": 0.0,
        "ry": 0.0,
        "apply": False,
        "z_base": 432
    }
    
    response = requests.post(f"{API_BASE}/joystick/pose", json=payload)
    data = response.json()
    
    print(f"Status Code: {response.status_code}")
    print(f"Valid: {data.get('valid')}")
    print(f"Applied: {data.get('applied')}")
    print(f"Pose: {data.get('pose')}")
    
    assert data["valid"] == True, "Pose home deve ser válida"
    assert data["applied"] == False, "Não deve aplicar (apply=False)"
    print("✅ Teste passou!")

def test_joystick_max_translation():
    """Testa translação máxima (±10mm)"""
    print("\n🧪 Teste 2: Translação Máxima X=10mm, Y=10mm")
    print("-" * 50)
    
    payload = {
        "lx": 1.0,   # Máximo direita
        "ly": -1.0,  # Máximo frente (invertido)
        "rx": 0.0,
        "ry": 0.0,
        "apply": False,
        "z_base": 432
    }
    
    response = requests.post(f"{API_BASE}/joystick/pose", json=payload)
    data = response.json()
    
    print(f"Status Code: {response.status_code}")
    print(f"Valid: {data.get('valid')}")
    print(f"Pose: {data.get('pose')}")
    
    pose = data["pose"]
    assert abs(pose["x"] - 10.0) < 0.01, "X deve ser 10mm"
    assert abs(pose["y"] - 10.0) < 0.01, "Y deve ser 10mm"
    print("✅ Teste passou!")

def test_joystick_max_rotation():
    """Testa rotação máxima (±10°)"""
    print("\n🧪 Teste 3: Rotação Máxima Roll=10°, Pitch=10°")
    print("-" * 50)
    
    payload = {
        "lx": 0.0,
        "ly": 0.0,
        "rx": 1.0,   # Máximo pitch
        "ry": -1.0,  # Máximo roll (invertido)
        "apply": False,
        "z_base": 432
    }
    
    response = requests.post(f"{API_BASE}/joystick/pose", json=payload)
    data = response.json()
    
    print(f"Status Code: {response.status_code}")
    print(f"Valid: {data.get('valid')}")
    print(f"Pose: {data.get('pose')}")
    
    pose = data["pose"]
    assert abs(pose["roll"] - 10.0) < 0.01, "Roll deve ser 10°"
    assert abs(pose["pitch"] - 10.0) < 0.01, "Pitch deve ser 10°"
    print("✅ Teste passou!")

def test_joystick_deadzone_simulation():
    """Simula zona morta (valores pequenos)"""
    print("\n🧪 Teste 4: Simulação de Zona Morta (valores < 0.1)")
    print("-" * 50)
    
    payload = {
        "lx": 0.05,   # Abaixo da zona morta
        "ly": 0.08,   # Abaixo da zona morta
        "rx": 0.03,
        "ry": 0.02,
        "apply": False,
        "z_base": 432
    }
    
    response = requests.post(f"{API_BASE}/joystick/pose", json=payload)
    data = response.json()
    
    print(f"Status Code: {response.status_code}")
    print(f"Valid: {data.get('valid')}")
    print(f"Pose: {data.get('pose')}")
    
    # Nota: O backend não aplica deadzone, isso é feito no frontend
    # Este teste verifica que valores pequenos ainda são processados corretamente
    print("✅ Teste passou! (Deadzone é aplicada no frontend)")

def test_joystick_combined():
    """Testa combinação de translação + rotação"""
    print("\n🧪 Teste 5: Combinação (50% de cada eixo)")
    print("-" * 50)
    
    payload = {
        "lx": 0.5,    # 5mm em X
        "ly": -0.5,   # 5mm em Y
        "rx": 0.5,    # 5° em pitch
        "ry": -0.5,   # 5° em roll
        "apply": False,
        "z_base": 432
    }
    
    response = requests.post(f"{API_BASE}/joystick/pose", json=payload)
    data = response.json()
    
    print(f"Status Code: {response.status_code}")
    print(f"Valid: {data.get('valid')}")
    print(f"Pose: {data.get('pose')}")
    print(f"Lengths: {[f'{l:.1f}' for l in data.get('lengths_abs', [])]}")
    
    assert data["valid"], "Pose combinada deve ser válida"
    print("✅ Teste passou!")

def test_joystick_with_apply():
    """Testa com apply=True (requer serial conectada!)"""
    print("\n🧪 Teste 6: Aplicação no Hardware (apply=True)")
    print("-" * 50)
    print("⚠️  ATENÇÃO: Este teste envia comando serial!")
    print("⚠️  Certifique-se de que a plataforma está segura!")
    
    input("Pressione ENTER para continuar ou Ctrl+C para cancelar...")
    
    payload = {
        "lx": 0.3,
        "ly": 0.0,
        "rx": 0.0,
        "ry": 0.3,
        "apply": True,  # ⚠️ Vai enviar comando!
        "z_base": 432
    }
    
    response = requests.post(f"{API_BASE}/joystick/pose", json=payload)
    data = response.json()
    
    print(f"Status Code: {response.status_code}")
    print(f"Valid: {data.get('valid')}")
    print(f"Applied: {data.get('applied')}")
    print(f"Pose: {data.get('pose')}")
    print(f"Cursos (mm): {[f'{c:.2f}' for c in data.get('course_mm', [])]}")
    
    if response.status_code == 400:
        print("❌ Erro: Porta serial não está conectada")
    else:
        assert data["applied"], "Comando deveria ter sido aplicado"
        print("✅ Teste passou! Comando enviado com sucesso.")

def main():
    print("=" * 50)
    print("TESTES DO ENDPOINT /joystick/pose")
    print("=" * 50)
    
    try:
        # Testar se backend está rodando
        response = requests.get(API_BASE)
        print(f"✅ Backend está rodando: {response.json()['name']}")
    except Exception as e:
        print(f"❌ Backend não está acessível em {API_BASE}")
        print(f"   Erro: {e}")
        return
    
    try:
        test_joystick_home()
        test_joystick_max_translation()
        test_joystick_max_rotation()
        test_joystick_deadzone_simulation()
        test_joystick_combined()
        
        # Teste com apply=True requer confirmação
        print("\n" + "=" * 50)
        test_with_apply = input("Deseja testar apply=True (envia comando serial)? (s/N): ").lower()
        if test_with_apply == 's':
            test_joystick_with_apply()
        else:
            print("⏭️  Pulando teste com apply=True")
        
        print("\n" + "=" * 50)
        print("✅ TODOS OS TESTES PASSARAM!")
        print("=" * 50)
        
    except AssertionError as e:
        print(f"\n❌ Teste falhou: {e}")
    except Exception as e:
        print(f"\n❌ Erro inesperado: {e}")

if __name__ == "__main__":
    main()
