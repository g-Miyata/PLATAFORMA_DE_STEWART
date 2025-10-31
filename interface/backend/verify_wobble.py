"""
Verificação rápida de que a implementação está completa
"""
import ast
import re

def check_implementation():
    print("🔍 Verificando implementação do wobble_precession...\n")
    
    with open("app.py", "r", encoding="utf-8") as f:
        content = f.read()
    
    checks = {
        "✅ MotionRequest tem tilt_deg": "tilt_deg:" in content,
        "✅ MotionRequest tem prec_hz": "prec_hz:" in content,
        "✅ MotionRequest tem yaw_hz": "yaw_hz:" in content,
        "✅ MotionRequest tem z_amp_mm": "z_amp_mm:" in content,
        "✅ MotionRequest tem z_phase_deg": "z_phase_deg:" in content,
        "✅ Caso wobble_precession implementado": 'elif routine == "wobble_precession"' in content,
        "✅ Cálculo de theta_t": "theta_t =" in content,
        "✅ Cálculo de phi_t_rad": "phi_t_rad =" in content,
        "✅ Decomposição em roll": "roll = theta_t * cos" in content,
        "✅ Decomposição em pitch": "pitch = theta_t * sin" in content,
        "✅ Yaw acumulado": "yaw = 360.0 * yaw_hz * t" in content,
        "✅ Z oscilante": "z = h0 + z_amp_mm" in content,
        "✅ Exemplo 5 (wobble padrão)": '"routine": "wobble_precession"' in content and '"prec_hz": 0.4' in content,
        "✅ Exemplo 6 (wobble rápido)": '"prec_hz": 0.6' in content,
    }
    
    all_pass = True
    for check, result in checks.items():
        status = "✅" if result else "❌"
        print(f"{status} {check}")
        if not result:
            all_pass = False
    
    print("\n" + "="*60)
    if all_pass:
        print("🎉 IMPLEMENTAÇÃO COMPLETA E VERIFICADA!")
        print("="*60)
        print("\n📋 Próximos passos:")
        print("1. Inicie o servidor: python app.py")
        print("2. Execute os testes: python test_wobble.py")
        print("3. Abra kinematics.html no navegador")
        print("4. Teste o preset '🟡 Wobble Precession'")
    else:
        print("⚠️ ALGUNS CHECKS FALHARAM - Revise a implementação")
        print("="*60)
    
    return all_pass

if __name__ == "__main__":
    check_implementation()
