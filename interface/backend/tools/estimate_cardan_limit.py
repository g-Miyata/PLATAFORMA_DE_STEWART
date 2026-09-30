"""Estimativa do ângulo máximo das juntas cardã a partir do modelo 3D.

Usa as medidas do cardã desenhado em 3D-drawings-archives/blender/kardan.py (a junta
real é metálica e não está no repositório; o suporte azul que a prende é impresso): cada garfo tem um cubo (Ø19 × 12 mm),
um pescoço (Ø14) e duas orelhas (placas 5,5 × 16 × 15 mm com ponta cilíndrica Ø16),
ligados pela cruzeta. O garfo A gira em torno do braço X da cruzeta e a cruzeta em
torno do braço Y (preso ao garfo B): a rotação relativa é Ry(β)·Rx(α). Para cada
direção de flexão, aumenta o ângulo até alguma peça de A invadir alguma peça de B e
devolve o menor ângulo entre os eixos dos dois garfos.

    python tools/estimate_cardan_limit.py

É uma ESTIMATIVA da peça do modelo: meça a junta real e troque o valor em limits.json.
"""
import math

import numpy as np

HUB_R, HUB_H, HUB_Z = 9.5, 12.0, 17.0       # cubo: raio, altura, centro (distância da cruzeta)
NECK_R, NECK_H, NECK_Z = 7.0, 10.0, 26.0    # pescoço (continua o cubo para fora)
EAR_X, EAR_T, EAR_W, EAR_H = 11.5, 5.5, 16.0, 15.0  # orelha: posição, espessura, largura, altura
TIP_R = 8.0                                  # ponta arredondada da orelha (em torno do braço)


def yoke_points(n=24):
    """Nuvem de pontos da superfície do garfo A (orelhas em ±X, cubo em −Z)."""
    pts = []
    for (r, h, zc) in ((HUB_R, HUB_H, -HUB_Z), (NECK_R, NECK_H, -NECK_Z)):
        for a in np.linspace(0, 2 * math.pi, n * 2, endpoint=False):
            for z in np.linspace(zc - h / 2, zc + h / 2, 7):
                pts.append((r * math.cos(a), r * math.sin(a), z))
        for rr in np.linspace(0, r, 5):
            for a in np.linspace(0, 2 * math.pi, n, endpoint=False):
                pts.append((rr * math.cos(a), rr * math.sin(a), zc + h / 2))
    for s in (1, -1):
        for x in np.linspace(EAR_X - EAR_T / 2, EAR_X + EAR_T / 2, 3):
            for y in np.linspace(-EAR_W / 2, EAR_W / 2, 9):
                for z in np.linspace(-EAR_H, 0, 9):
                    pts.append((s * x, y, z))
    return np.array(pts)


def inside_yoke_b(p, tol=0.0):
    """p (N×3) dentro de alguma peça do garfo B (orelhas em ±Y, cubo em +Z)?"""
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    hit = np.zeros(len(p), dtype=bool)
    for (r, h, zc) in ((HUB_R, HUB_H, HUB_Z), (NECK_R, NECK_H, NECK_Z)):
        hit |= (x ** 2 + y ** 2 < (r - tol) ** 2) & (np.abs(z - zc) < h / 2 - tol)
    for s in (1, -1):
        in_plate = (np.abs(y - s * EAR_X) < EAR_T / 2 - tol) & (np.abs(x) < EAR_W / 2 - tol) & (z > tol) & (z < EAR_H - tol)
        in_tip = (np.abs(y - s * EAR_X) < EAR_T / 2 - tol) & (x ** 2 + z ** 2 < (TIP_R - tol) ** 2)
        hit |= in_plate | in_tip
    return hit


def rot(alpha, beta):
    ca, sa, cb, sb = math.cos(alpha), math.sin(alpha), math.cos(beta), math.sin(beta)
    rx = np.array([[1, 0, 0], [0, ca, -sa], [0, sa, ca]])
    ry = np.array([[cb, 0, sb], [0, 1, 0], [-sb, 0, cb]])
    return ry @ rx


def max_angle(direction_deg, pts, tol=0.3):
    """Maior flexão (entre os eixos dos garfos) sem colisão, numa direção de flexão."""
    d = math.radians(direction_deg)
    last = 0.0
    for total in np.arange(0.5, 90.0, 0.25):
        # divide a flexão entre os dois braços da cruzeta conforme a direção
        R = rot(math.radians(total) * math.cos(d), math.radians(total) * math.sin(d))
        if inside_yoke_b(pts @ R.T, tol).any():
            break
        axis_a = R @ np.array([0, 0, -1.0])
        last = math.degrees(math.acos(max(-1.0, min(1.0, -axis_a[2]))))
    return last


def main():
    pts = yoke_points()
    angles = {d: max_angle(d, pts) for d in range(0, 91, 15)}
    for d, a in angles.items():
        print(f"direção {d:3d}°: {a:5.1f}°")
    worst = min(angles.values())
    print(f"ângulo máximo estimado (pior direção): {worst:.1f}°")
    return worst


if __name__ == "__main__":
    main()
