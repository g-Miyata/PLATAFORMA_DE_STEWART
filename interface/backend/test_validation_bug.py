"""
Teste para reproduzir o bug de validação
"""
import numpy as np
from scipy.spatial.transform import Rotation as R

# Configuração
h0 = 432
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

def inverse_kinematics(x=0, y=0, z=432, roll=0, pitch=0, yaw=0):
    T = np.array([x, y, z])
    Rm = R.from_euler('ZYX', [yaw, pitch, roll], degrees=True).as_matrix()
    P = (P0 @ Rm.T) + T
    Lvec = P - B
    L = np.linalg.norm(Lvec, axis=1)
    valid = np.all((L >= stroke_min) & (L <= stroke_max))
    return L, bool(valid), P

def stroke_percentages(lengths):
    rng = stroke_max - stroke_min
    return np.clip(((lengths - stroke_min) / rng) * 100.0, 0.0, 100.0)

print("="*70)
print("🐛 TESTE DE BUG NA VALIDAÇÃO")
print("="*70)
print()

# Teste 1: Pose que você mostrou (611mm em todos)
print("📋 TESTE 1: Tentar encontrar pose que resulta em L≈611mm")
print()

# Vamos testar alguns valores de z
test_cases = [
    {"x": 0, "y": 0, "z": 500, "roll": 0, "pitch": 0, "yaw": 0},
    {"x": 0, "y": 0, "z": 550, "roll": 0, "pitch": 0, "yaw": 0},
    {"x": 0, "y": 0, "z": 433, "roll": 0, "pitch": 0, "yaw": 0},
    {"x": 0, "y": 0, "z": 432, "roll": 0, "pitch": 0, "yaw": 0},
]

for test in test_cases:
    L, valid, P = inverse_kinematics(**test)
    perc = stroke_percentages(L)
    
    print(f"Pose: z={test['z']}mm, roll={test['roll']}°")
    print(f"  Valid global: {valid}")
    
    for i in range(6):
        valid_individual = stroke_min <= L[i] <= stroke_max
        print(f"  Atuador {i+1}: L={L[i]:.1f}mm, {perc[i]:.1f}%, valid={valid_individual}")
    
    print()

print("="*70)
print("🔍 ANÁLISE:")
print("  • Se todos os atuadores têm L entre 500-680mm, mas valid=False")
print("  • Então há um BUG na validação!")
print("="*70)
