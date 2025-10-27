"""
Teste direto da função de validação (sem servidor)
"""
import sys
sys.path.append('.')

from app import platform

print("="*70)
print("🧪 TESTE DIRETO DA VALIDAÇÃO")
print("="*70)
print()

# Teste 1: Pose que você disse estar dando erro
print("📋 TESTE 1: z=500mm (deveria ser VÁLIDO)")
L, valid, P = platform.inverse_kinematics(x=0, y=0, z=500, roll=0, pitch=0, yaw=0)
print()

# Teste 2: z=433mm (limite inferior)
print("📋 TESTE 2: z=433mm (limite inferior)")
L, valid, P = platform.inverse_kinematics(x=0, y=0, z=433, roll=0, pitch=0, yaw=0)
print()

# Teste 3: z=631mm (limite superior)
print("📋 TESTE 3: z=631mm (limite superior)")
L, valid, P = platform.inverse_kinematics(x=0, y=0, z=631, roll=0, pitch=0, yaw=0)
print()

# Teste 4: z=432mm (abaixo do limite)
print("📋 TESTE 4: z=432mm (ABAIXO do limite - deveria ser INVÁLIDO)")
L, valid, P = platform.inverse_kinematics(x=0, y=0, z=432, roll=0, pitch=0, yaw=0)
print()

print("="*70)
