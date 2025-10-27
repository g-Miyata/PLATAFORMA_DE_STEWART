"""
Encontrar os limites reais de Z baseado nos limites de stroke (500-680mm)
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

def test_z(z):
    T = np.array([0, 0, z])
    Rm = R.from_euler('ZYX', [0, 0, 0], degrees=True).as_matrix()
    P = (P0 @ Rm.T) + T
    L = np.linalg.norm(P - B, axis=1)
    valid = np.all((L >= stroke_min) & (L <= stroke_max))
    return L, valid

print("="*70)
print("🔍 ENCONTRANDO LIMITES REAIS DE Z")
print("="*70)
print(f"Restrições: {stroke_min}mm ≤ L ≤ {stroke_max}mm")
print()

# Busca binária para Z mínimo
z_low = 400
z_high = 500
while z_high - z_low > 0.1:
    z_mid = (z_low + z_high) / 2
    L, valid = test_z(z_mid)
    if valid and L.min() >= stroke_min:
        z_high = z_mid
    else:
        z_low = z_mid

z_min_safe = z_high
L_min, valid_min = test_z(z_min_safe)

print(f"✅ Z MÍNIMO SEGURO: {z_min_safe:.1f}mm")
print(f"   Strokes: [{L_min.min():.1f} - {L_min.max():.1f}]mm")
print()

# Busca binária para Z máximo
z_low = 600
z_high = 700
while z_high - z_low > 0.1:
    z_mid = (z_low + z_high) / 2
    L, valid = test_z(z_mid)
    if valid and L.max() <= stroke_max:
        z_low = z_mid
    else:
        z_high = z_mid

z_max_safe = z_low
L_max, valid_max = test_z(z_max_safe)

print(f"✅ Z MÁXIMO SEGURO: {z_max_safe:.1f}mm")
print(f"   Strokes: [{L_max.min():.1f} - {L_max.max():.1f}]mm")
print()

print("="*70)
print(f"📏 LIMITES PARA O SLIDER:")
print(f"   min=\"{int(np.ceil(z_min_safe))}\"")
print(f"   max=\"{int(np.floor(z_max_safe))}\"")
print(f"   value=\"{int(np.ceil(z_min_safe))}\"")
print("="*70)
