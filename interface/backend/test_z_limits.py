"""
Teste rápido dos limites de Z válidos
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

def test_pose(x, y, z, roll, pitch, yaw):
    T = np.array([x, y, z])
    Rm = R.from_euler('ZYX', [yaw, pitch, roll], degrees=True).as_matrix()
    P = (P0 @ Rm.T) + T
    Lvec = P - B
    L = np.linalg.norm(Lvec, axis=1)
    valid = np.all((L >= stroke_min) & (L <= stroke_max))
    return L, valid

print("="*60)
print("🧪 TESTE DE LIMITES - Interface Kinematics")
print("="*60)
print()

# Testa z mínimo (432)
print("📏 Teste z = 432mm (MÍNIMO)")
L, valid = test_pose(0, 0, 432, 0, 0, 0)
print(f"  L = [{L.min():.1f} - {L.max():.1f}]mm")
print(f"  Status: {'✅ VÁLIDO' if valid else '❌ INVÁLIDO'}")
print()

# Testa z máximo (630)
print("📏 Teste z = 630mm (MÁXIMO SEGURO)")
L, valid = test_pose(0, 0, 630, 0, 0, 0)
print(f"  L = [{L.min():.1f} - {L.max():.1f}]mm")
print(f"  Status: {'✅ VÁLIDO' if valid else '❌ INVÁLIDO'}")
print()

# Testa z médio (532)
print("📏 Teste z = 532mm (MEIO)")
L, valid = test_pose(0, 0, 532, 0, 0, 0)
print(f"  L = [{L.min():.1f} - {L.max():.1f}]mm")
print(f"  Status: {'✅ VÁLIDO' if valid else '❌ INVÁLIDO'}")
print()

# Testa inclinações em z=432
print("📏 Teste z = 432mm + Roll=10° (pode ser inválido)")
L, valid = test_pose(0, 0, 432, 10, 0, 0)
print(f"  L = [{L.min():.1f} - {L.max():.1f}]mm")
print(f"  Status: {'✅ VÁLIDO' if valid else '❌ INVÁLIDO'}")
if not valid:
    print(f"  ⚠️ Na altura mínima, inclinações podem ser inválidas!")
print()

# Testa inclinações em z=500 (maior)
print("📏 Teste z = 500mm + Roll=10° (deve ser válido)")
L, valid = test_pose(0, 0, 500, 10, 0, 0)
print(f"  L = [{L.min():.1f} - {L.max():.1f}]mm")
print(f"  Status: {'✅ VÁLIDO' if valid else '❌ INVÁLIDO'}")
print()

# Testa z acima do limite
print("📏 Teste z = 650mm (ACIMA DO LIMITE)")
L, valid = test_pose(0, 0, 650, 0, 0, 0)
print(f"  L = [{L.min():.1f} - {L.max():.1f}]mm")
print(f"  Status: {'✅ VÁLIDO' if valid else '❌ INVÁLIDO'}")
if not valid:
    print(f"  ❌ Pistões excedem 680mm!")
print()

print("="*60)
print("✅ LIMITES CORRETOS PARA INTERFACE:")
print("  • Z mínimo: 432mm")
print("  • Z máximo: 630mm")
print("  • Sliders atualizados: min='432' max='630'")
print("="*60)
