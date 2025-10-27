"""
Encontra o h0 correto para a geometria da plataforma
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

def test_height(z):
    T = np.array([0, 0, z])
    Rm = np.eye(3)  # sem rotação
    P = (P0 @ Rm.T) + T
    Lvec = P - B
    L = np.linalg.norm(Lvec, axis=1)
    return L

print("🔍 Procurando h0 ideal...")
print("="*60)

# Testa vários valores de z
for z in range(100, 500, 10):
    L = test_height(z)
    L_min = L.min()
    L_max = L.max()
    L_mean = L.mean()
    
    # Verifica se todos estão dentro dos limites
    all_valid = np.all((L >= stroke_min) & (L <= stroke_max))
    
    # Verifica se está perto da posição neutra (meio do curso)
    target_length = (stroke_min + stroke_max) / 2  # 325mm
    deviation = abs(L_mean - target_length)
    
    if all_valid and deviation < 50:
        print(f"z={z:3d}mm → L=[{L_min:.1f}, {L_max:.1f}] mean={L_mean:.1f}mm {'✅' if deviation < 10 else '⚠️'}")
        if deviation < 10:
            print(f"  ⭐ IDEAL: Use h0={z}")

print()
print("="*60)
print("Testando posição mínima (curso=0, L=200mm):")
z_min = None
for z in range(50, 300, 5):
    L = test_height(z)
    if abs(L.mean() - 200) < 5:
        z_min = z
        print(f"  z={z}mm → L_mean={L.mean():.1f}mm ✅")
        break

print()
print("Testando posição máxima (curso=250mm, L=450mm):")
z_max = None
for z in range(200, 500, 5):
    L = test_height(z)
    if abs(L.mean() - 450) < 5:
        z_max = z
        print(f"  z={z}mm → L_mean={L.mean():.1f}mm ✅")
        break

if z_min and z_max:
    print()
    print("="*60)
    print(f"📊 Análise:")
    print(f"  z mínimo (L~500mm): {z_min}mm")
    print(f"  z máximo (L~680mm): {z_max}mm")
    print(f"  z neutro (L~540mm): {(z_min + z_max)//2}mm")
    print()
    print(f"✅ Recomendação: h0 = {(z_min + z_max)//2}mm")
