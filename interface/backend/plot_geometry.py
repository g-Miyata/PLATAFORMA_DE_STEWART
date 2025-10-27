"""
Visualização da geometria real da plataforma Stewart
"""
import matplotlib.pyplot as plt
import numpy as np

# Configuração
stroke_min = 500  # mm
stroke_max = 680  # mm
curso = 180       # mm

# Alturas correspondentes
z_min = 432       # mm (pistões em 500mm)
z_mid = 532       # mm (pistões em 590mm)
z_max = 630       # mm (pistões em 680mm)

# Criar figura
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))

# ===== Gráfico 1: Relação z vs L =====
z_values = np.linspace(430, 635, 100)
L_values = z_values + 68  # aproximação linear

ax1.plot(z_values, L_values, 'b-', linewidth=2, label='Comprimento do pistão (L)')
ax1.axhline(stroke_min, color='r', linestyle='--', linewidth=1.5, label=f'Limite mínimo ({stroke_min}mm)')
ax1.axhline(stroke_max, color='r', linestyle='--', linewidth=1.5, label=f'Limite máximo ({stroke_max}mm)')

# Pontos de referência
ax1.plot(z_min, 500, 'go', markersize=12, label=f'Mínimo (z={z_min}mm, L≈500mm)')
ax1.plot(z_mid, 590, 'yo', markersize=12, label=f'Meio (z={z_mid}mm, L≈590mm)')
ax1.plot(z_max, 678, 'ro', markersize=12, label=f'Máximo (z={z_max}mm, L≈678mm)')

# Zona válida
ax1.fill_between(z_values, stroke_min, stroke_max, alpha=0.2, color='green', label='Zona válida')

ax1.set_xlabel('Altura da Plataforma z (mm)', fontsize=12, fontweight='bold')
ax1.set_ylabel('Comprimento Absoluto L (mm)', fontsize=12, fontweight='bold')
ax1.set_title('Relação: Altura z vs Comprimento do Pistão L', fontsize=14, fontweight='bold')
ax1.legend(loc='upper left', fontsize=9)
ax1.grid(True, alpha=0.3)
ax1.set_xlim(420, 640)
ax1.set_ylim(480, 700)

# ===== Gráfico 2: Curso do Arduino =====
stroke_values = L_values - stroke_min

ax2.plot(z_values, stroke_values, 'b-', linewidth=2, label='Curso enviado ao Arduino')
ax2.axhline(0, color='r', linestyle='--', linewidth=1.5, label='Mínimo (0mm)')
ax2.axhline(curso, color='r', linestyle='--', linewidth=1.5, label=f'Máximo ({curso}mm)')

# Pontos de referência
ax2.plot(z_min, 0, 'go', markersize=12, label=f'z={z_min}mm → stroke=0mm')
ax2.plot(z_mid, 90, 'yo', markersize=12, label=f'z={z_mid}mm → stroke=90mm')
ax2.plot(z_max, 178, 'ro', markersize=12, label=f'z={z_max}mm → stroke=178mm')

# Zona válida
ax2.fill_between(z_values, 0, curso, alpha=0.2, color='green', label='Zona válida')

ax2.set_xlabel('Altura da Plataforma z (mm)', fontsize=12, fontweight='bold')
ax2.set_ylabel('Setpoint Arduino (mm)', fontsize=12, fontweight='bold')
ax2.set_title('Conversão: stroke = L - 500', fontsize=14, fontweight='bold')
ax2.legend(loc='upper left', fontsize=9)
ax2.grid(True, alpha=0.3)
ax2.set_xlim(420, 640)
ax2.set_ylim(-10, 190)

plt.tight_layout()
plt.savefig('geometria_plataforma.png', dpi=150, bbox_inches='tight')
print("✅ Gráfico salvo: geometria_plataforma.png")
plt.show()
