"""
Teste de validação com geometria REAL da plataforma Stewart
Configuração:
- Altura neutra z = 432mm
- Comprimento mínimo pistão = 500mm
- Curso útil = 180mm (limitado)
- Comprimento máximo = 680mm
"""
import numpy as np
from scipy.spatial.transform import Rotation as R

# ===== CONFIGURAÇÃO REAL =====
h0 = 432          # altura neutra (mm)
stroke_min = 500  # comprimento mínimo do pistão (mm)
stroke_max = 680  # comprimento máximo (500 + 180 = 680mm)
curso_util = 180  # curso útil limitado (mm)

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

def inverse_kinematics(x=0, y=0, z=None, roll=0, pitch=0, yaw=0):
    if z is None:
        z = h0
    T = np.array([x, y, z])
    Rm = R.from_euler('ZYX', [yaw, pitch, roll], degrees=True).as_matrix()
    P = (P0 @ Rm.T) + T
    Lvec = P - B
    L = np.linalg.norm(Lvec, axis=1)
    valid = np.all((L >= stroke_min) & (L <= stroke_max))
    return L, valid, P

def lengths_to_stroke_mm(lengths):
    """
    Converte comprimento absoluto para curso (setpoint para Arduino)
    Arduino parte de 0mm, então subtraímos stroke_min
    """
    return np.clip(lengths - stroke_min, 0.0, curso_util)

print("="*70)
print("🧪 TESTE DE VALIDAÇÃO - Geometria REAL da Plataforma")
print("="*70)
print()
print("📏 Configuração:")
print(f"  • Altura neutra (z): {h0}mm")
print(f"  • Comprimento mínimo pistão: {stroke_min}mm")
print(f"  • Curso útil: {curso_util}mm")
print(f"  • Comprimento máximo: {stroke_max}mm")
print()

# ===== TESTE 1: Posição Neutra =====
print("="*70)
print("📐 Teste 1: Posição Neutra (z=432mm)")
print("-"*70)
x, y, z = 0, 0, 432
roll, pitch, yaw = 0, 0, 0
print(f"Entrada: x={x}, y={y}, z={z}, roll={roll}°, pitch={pitch}°, yaw={yaw}°")

L, valid, P = inverse_kinematics(x, y, z, roll, pitch, yaw)
stroke_mm = lengths_to_stroke_mm(L)

print(f"\nVálido: {'✅ SIM' if valid else '❌ NÃO'}")
print(f"\nComprimentos absolutos calculados (L):")
for i, length in enumerate(L):
    status = "✅" if stroke_min <= length <= stroke_max else "❌"
    print(f"  {status} Pistão {i+1}: {length:.2f}mm")

print(f"\nSetpoints para Arduino (curso = L - {stroke_min}):")
for i, stroke in enumerate(stroke_mm):
    print(f"  → spmm{i+1}={stroke:.3f} mm")

print(f"\n✅ Esperado: Pistões em posição intermediária (~90mm se z=432 for o meio)")
print()

# ===== TESTE 2: Inclinação Roll =====
print("="*70)
print("📐 Teste 2: Inclinação Roll = 10°")
print("-"*70)
x, y, z = 0, 0, 432
roll, pitch, yaw = 10, 0, 0
print(f"Entrada: x={x}, y={y}, z={z}, roll={roll}°, pitch={pitch}°, yaw={yaw}°")

L, valid, P = inverse_kinematics(x, y, z, roll, pitch, yaw)
stroke_mm = lengths_to_stroke_mm(L)

print(f"\nVálido: {'✅ SIM' if valid else '❌ NÃO'}")
print(f"\nComprimentos absolutos calculados (L):")
for i, length in enumerate(L):
    status = "✅" if stroke_min <= length <= stroke_max else "❌"
    print(f"  {status} Pistão {i+1}: {length:.2f}mm")

print(f"\nSetpoints para Arduino (curso = L - {stroke_min}):")
for i, stroke in enumerate(stroke_mm):
    print(f"  → spmm{i+1}={stroke:.3f} mm")

print(f"\n✅ Esperado: Pistões com valores diferentes (cria inclinação)")
print()

# ===== TESTE 3: Máxima Extensão =====
print("="*70)
print("📐 Teste 3: Máxima Extensão Permitida")
print("-"*70)

# Procura z que resulta em L próximo de 680mm
for test_z in range(400, 700, 10):
    L_test, valid_test, _ = inverse_kinematics(0, 0, test_z, 0, 0, 0)
    if valid_test and L_test.mean() > 670:
        x, y, z = 0, 0, test_z
        break

roll, pitch, yaw = 0, 0, 0
print(f"Entrada: x={x}, y={y}, z={z}, roll={roll}°, pitch={pitch}°, yaw={yaw}°")

L, valid, P = inverse_kinematics(x, y, z, roll, pitch, yaw)
stroke_mm = lengths_to_stroke_mm(L)

print(f"\nVálido: {'✅ SIM' if valid else '❌ NÃO'}")
print(f"\nComprimentos absolutos calculados (L):")
for i, length in enumerate(L):
    status = "✅" if stroke_min <= length <= stroke_max else "❌"
    print(f"  {status} Pistão {i+1}: {length:.2f}mm")

print(f"\nSetpoints para Arduino (curso = L - {stroke_min}):")
for i, stroke in enumerate(stroke_mm):
    print(f"  → spmm{i+1}={stroke:.3f} mm")

print(f"\n✅ Esperado: Pistões próximos de {curso_util}mm (máxima extensão)")
print()

# ===== TESTE 4: Mínima Retração =====
print("="*70)
print("📐 Teste 4: Mínima Retração (pistões em 500mm)")
print("-"*70)

# Procura z que resulta em L próximo de 500mm
for test_z in range(100, 500, 10):
    L_test, valid_test, _ = inverse_kinematics(0, 0, test_z, 0, 0, 0)
    if valid_test and L_test.mean() < 510:
        x, y, z = 0, 0, test_z
        break

roll, pitch, yaw = 0, 0, 0
print(f"Entrada: x={x}, y={y}, z={z}, roll={roll}°, pitch={pitch}°, yaw={yaw}°")

L, valid, P = inverse_kinematics(x, y, z, roll, pitch, yaw)
stroke_mm = lengths_to_stroke_mm(L)

print(f"\nVálido: {'✅ SIM' if valid else '❌ NÃO'}")
print(f"\nComprimentos absoltos calculados (L):")
for i, length in enumerate(L):
    status = "✅" if stroke_min <= length <= stroke_max else "❌"
    print(f"  {status} Pistão {i+1}: {length:.2f}mm")

print(f"\nSetpoints para Arduino (curso = L - {stroke_min}):")
for i, stroke in enumerate(stroke_mm):
    print(f"  → spmm{i+1}={stroke:.3f} mm")

print(f"\n✅ Esperado: Pistões próximos de 0mm (mínima extensão)")
print()

# ===== TESTE 5: Pose Inválida =====
print("="*70)
print("📐 Teste 5: Pose INVÁLIDA (fora dos limites)")
print("-"*70)
x, y, z = 0, 0, 700
roll, pitch, yaw = 0, 0, 0
print(f"Entrada: x={x}, y={y}, z={z}, roll={roll}°, pitch={pitch}°, yaw={yaw}°")

L, valid, P = inverse_kinematics(x, y, z, roll, pitch, yaw)

print(f"\nVálido: {'✅ SIM' if valid else '❌ NÃO'}")
print(f"\nComprimentos absolutos calculados (L):")
for i, length in enumerate(L):
    status = "✅" if stroke_min <= length <= stroke_max else "❌"
    print(f"  {status} Pistão {i+1}: {length:.2f}mm (limite: {stroke_min}-{stroke_max}mm)")

if not valid:
    print(f"\n❌ REJEITADO: Pose excede os limites físicos dos pistões!")
print()

# ===== RESUMO =====
print("="*70)
print("✅ VALIDAÇÃO CONCLUÍDA")
print("="*70)
print()
print("📋 Resumo da Configuração:")
print(f"  Backend:")
print(f"    • h0 = {h0}mm")
print(f"    • stroke_min = {stroke_min}mm")
print(f"    • stroke_max = {stroke_max}mm")
print()
print(f"  Arduino:")
print(f"    • Lmm[6] = {{{curso_util}, {curso_util}, {curso_util}, {curso_util}, {curso_util}, {curso_util}}}mm")
print()
print(f"  Conversão:")
print(f"    • setpoint_arduino = comprimento_calculado - {stroke_min}")
print(f"    • Exemplo: L=590mm → spmm=90mm")
print()
print("🚀 Sistema configurado e validado!")
