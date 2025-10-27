"""
Teste completo de validação com os limites corretos
"""
import numpy as np
from scipy.spatial.transform import Rotation as R

stroke_min = 500
stroke_max = 680

B = np.array([
    [305.5, -17, 0],
    [305.5,  17, 0],
    [-137.7, 273.23, 0],
    [-168,   255.7, 0],
    [-167.2, -256.2, 0],
    [-136.8, -273.6, 0],
])

P0 = np.array([
    [191.1, -241.5, 0],
    [191.1,  241.5, 0],
    [113.6,  286.2, 0],
    [-304.7,  44.8, 0],
    [-304.7, -44.8, 0],
    [113.1, -286.4, 0],
])

def test_pose(x=0, y=0, z=500, roll=0, pitch=0, yaw=0):
    T = np.array([x, y, z])
    Rm = R.from_euler('ZYX', [yaw, pitch, roll], degrees=True).as_matrix()
    P = (P0 @ Rm.T) + T
    L = np.linalg.norm(P - B, axis=1)
    valid = np.all((L >= stroke_min) & (L <= stroke_max))
    
    # Porcentagem baseada no curso (0-180mm)
    rng = stroke_max - stroke_min
    perc = np.clip(((L - stroke_min) / rng) * 100.0, 0.0, 100.0)
    
    return L, perc, valid

print("="*80)
print("✅ TESTE COMPLETO DE VALIDAÇÃO")
print("="*80)
print(f"Configuração:")
print(f"  • Stroke MIN: {stroke_min}mm (pistão totalmente retraído)")
print(f"  • Stroke MAX: {stroke_max}mm (pistão estendido +180mm)")
print(f"  • Z MIN: 433mm | Z MAX: 631mm")
print("="*80)
print()

test_cases = [
    ("Z no MÍNIMO (433mm)", {"z": 433}),
    ("Z no MEIO (500mm)", {"z": 500}),
    ("Z no MÁXIMO (631mm)", {"z": 631}),
    ("Z ABAIXO do limite (432mm)", {"z": 432}),
    ("Z ACIMA do limite (632mm)", {"z": 632}),
]

for name, params in test_cases:
    print(f"📋 {name}")
    L, perc, valid = test_pose(**params)
    
    print(f"   Valid: {'✅ SIM' if valid else '❌ NÃO'}")
    
    all_valid = True
    for i in range(6):
        is_valid = stroke_min <= L[i] <= stroke_max
        status = "✅" if is_valid else "❌"
        print(f"   Pistão {i+1}: L={L[i]:.1f}mm ({perc[i]:.1f}%) {status}")
        if not is_valid:
            all_valid = False
            if L[i] < stroke_min:
                print(f"             ⚠️ ABAIXO de {stroke_min}mm!")
            elif L[i] > stroke_max:
                print(f"             ⚠️ ACIMA de {stroke_max}mm!")
    
    if valid != all_valid:
        print(f"   🐛 BUG: valid={valid} mas validação individual={all_valid}")
    
    print()

print("="*80)
print("✅ RESUMO:")
print("  • Z=433mm a Z=631mm → VÁLIDO")
print("  • Z<433mm → INVÁLIDO (pistões < 500mm)")
print("  • Z>631mm → INVÁLIDO (pistões > 680mm)")
print("="*80)
