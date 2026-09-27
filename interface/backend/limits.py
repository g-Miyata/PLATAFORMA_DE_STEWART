"""Limites reais da mecânica: curso das pernas, ângulo das juntas cardã e folga entre pernas.

Uma pose só é aceita se, em TODAS as pernas:
  - o comprimento estiver dentro do curso (500–750 mm: os 250 mm do atuador);
  - o cardã da base não dobrar além do máximo (ângulo entre a perna e o eixo do assento,
    a normal da face inclinada do bloco azul, tirada do STL em 3D-drawings-archives);
  - o cardã do tampo não dobrar além do máximo (ângulo entre a perna e a normal do tampo);
  - duas pernas quaisquer não chegarem perto demais (menor distância entre os eixos,
    fora da região das juntas, contra o diâmetro do tubo mais uma folga).

Os valores FÍSICOS ficam em limits.json. A OPERAÇÃO usa uma margem (padrão 20%):
  - curso: 10% do curso em cada ponta (525–725 mm);
  - cardãs: 80% do ângulo máximo;
  - folga entre pernas: a distância exigida × 1,2.
"""
import json
import math
import shutil
from dataclasses import asdict, dataclass, fields
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

LIMITS_FILE = Path(__file__).resolve().parent / "limits.json"

# faixas aceitas para cada valor físico (o que a página Ajustes → Limites deixa editar)
LIMIT_RANGES = {
    "stroke_min": (400.0, 600.0),
    "stroke_max": (600.0, 800.0),
    "cardan_base_max_deg": (10.0, 80.0),
    "cardan_top_max_deg": (10.0, 80.0),
    "leg_radius_mm": (5.0, 60.0),
    "leg_clearance_mm": (0.0, 50.0),
    "joint_zone_mm": (0.0, 150.0),
    "margin": (0.0, 0.5),
}
HOME_RANGE = (400.0, 800.0)

# assento do cardã da base (face do bloco azul, do STL): componentes da normal em
# (para dentro, para longe da perna vizinha do par, para cima)
SEAT_NORMAL = (0.45, 0.44, 0.78)

REASONS = {
    "curso": "fora do curso do atuador",
    "cardan_base": "cardã da base no limite",
    "cardan_topo": "cardã do tampo no limite",
    "folga": "pernas perto de encostar",
}


@dataclass
class JointLimits:
    """Valores físicos (o máximo que a mecânica aguenta) e a margem de operação."""
    stroke_min: float = 500.0
    stroke_max: float = 750.0
    cardan_base_max_deg: float = 45.0
    cardan_top_max_deg: float = 45.0
    #: raio do tubo do atuador (perfil em D de 44 × 42 mm)
    leg_radius_mm: float = 23.0
    #: folga mínima entre as superfícies de duas pernas
    leg_clearance_mm: float = 5.0
    #: trecho junto às juntas que não entra na checagem de folga (as pernas de um par se tocam ali por construção)
    joint_zone_mm: float = 60.0
    margin: float = 0.2
    #: altura de repouso; None = automática (centro do curso de operação com o tampo nivelado)
    home_z: Optional[float] = None
    note: str = ""

    @classmethod
    def from_dict(cls, d: dict) -> "JointLimits":
        names = {f.name for f in fields(cls)}
        lim = cls(**{k: v for k, v in d.items() if k in names})
        lim.validate()
        return lim

    def validate(self):
        for k, (lo, hi) in LIMIT_RANGES.items():
            v = getattr(self, k)
            if not isinstance(v, (int, float)) or not (lo <= float(v) <= hi):
                raise ValueError(f"{k} deve ficar entre {lo:g} e {hi:g}")
        if self.stroke_max - self.stroke_min < 50:
            raise ValueError("O curso precisa ter pelo menos 50 mm")
        if self.home_z is not None and not (HOME_RANGE[0] <= float(self.home_z) <= HOME_RANGE[1]):
            raise ValueError(f"home_z deve ficar entre {HOME_RANGE[0]:g} e {HOME_RANGE[1]:g} (ou vazio = automático)")

    def to_dict(self) -> dict:
        return asdict(self)

    def operational(self) -> Dict[str, float]:
        """Os mesmos limites com a margem de segurança aplicada."""
        m = float(self.margin)
        rng = self.stroke_max - self.stroke_min
        return {
            "stroke_min": self.stroke_min + rng * m / 2,
            "stroke_max": self.stroke_max - rng * m / 2,
            "cardan_base_max_deg": self.cardan_base_max_deg * (1 - m),
            "cardan_top_max_deg": self.cardan_top_max_deg * (1 - m),
            "min_axis_distance_mm": self.min_axis_distance() * (1 + m),
        }

    def physical(self) -> Dict[str, float]:
        return {
            "stroke_min": self.stroke_min,
            "stroke_max": self.stroke_max,
            "cardan_base_max_deg": self.cardan_base_max_deg,
            "cardan_top_max_deg": self.cardan_top_max_deg,
            "min_axis_distance_mm": self.min_axis_distance(),
        }

    def min_axis_distance(self) -> float:
        """Distância mínima entre os eixos de duas pernas (dois raios + folga)."""
        return 2 * self.leg_radius_mm + self.leg_clearance_mm


def load_limits(path: Path = LIMITS_FILE) -> JointLimits:
    if path.is_file():
        return JointLimits.from_dict(json.loads(path.read_text(encoding="utf-8")))
    return JointLimits()


def save_limits(lim: JointLimits, path: Path = LIMITS_FILE) -> Optional[str]:
    """Grava limits.json guardando o anterior em .bak. Devolve o caminho da cópia."""
    lim.validate()
    backup = None
    if path.is_file():
        backup = str(path.with_suffix(".json.bak"))
        shutil.copyfile(path, backup)
    path.write_text(json.dumps(lim.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
    return backup


# ---------------------------------------------------------------- geometria
def seat_normals(B: np.ndarray) -> np.ndarray:
    """Eixo de cada cardã da base: a normal da face do bloco azul em que ele se apoia."""
    n = []
    for i in range(len(B)):
        # a vizinha do par é a junta da base mais próxima
        d = np.linalg.norm(B[:, :2] - B[i, :2], axis=1)
        d[i] = np.inf
        j = int(np.argmin(d))
        radial = B[i, :2] / np.linalg.norm(B[i, :2])
        away = B[i, :2] - B[j, :2]
        away = away / np.linalg.norm(away)
        inward, apart, up = SEAT_NORMAL
        v = np.array([-inward * radial[0] + apart * away[0], -inward * radial[1] + apart * away[1], up])
        n.append(v / np.linalg.norm(v))
    return np.array(n)


PAIRS = [(i, j) for i in range(6) for j in range(i + 1, 6)]


def segment_distance(p1, q1, p2, q2):
    """Menor distância entre os segmentos p1–q1 e p2–q2 (vetorizado nas primeiras dimensões)."""
    d1 = q1 - p1
    d2 = q2 - p2
    r = p1 - p2
    a = np.sum(d1 * d1, axis=-1)
    e = np.sum(d2 * d2, axis=-1)
    f = np.sum(d2 * r, axis=-1)
    c = np.sum(d1 * r, axis=-1)
    b = np.sum(d1 * d2, axis=-1)
    denom = a * e - b * b
    s = np.where(denom > 1e-9, np.clip((b * f - c * e) / np.where(denom > 1e-9, denom, 1), 0, 1), 0.0)
    t = (b * s + f) / np.where(e > 1e-9, e, 1)
    # t fora de [0, 1]: prende e recalcula s
    t_lo, t_hi = t < 0, t > 1
    t = np.clip(t, 0, 1)
    s = np.where(t_lo, np.clip(-c / np.where(a > 1e-9, a, 1), 0, 1), s)
    s = np.where(t_hi, np.clip((b - c) / np.where(a > 1e-9, a, 1), 0, 1), s)
    c1 = p1 + d1 * s[..., None]
    c2 = p2 + d2 * t[..., None]
    return np.linalg.norm(c1 - c2, axis=-1)


class LimitChecker:
    """Confere curso, cardãs e folga para uma ou muitas poses de uma vez."""

    def __init__(self, B: np.ndarray, P0: np.ndarray, limits: JointLimits):
        self.B = np.asarray(B, dtype=float)
        self.P0 = np.asarray(P0, dtype=float)
        self.set_limits(limits)

    def set_limits(self, limits: JointLimits):
        limits.validate()
        self.limits = limits
        self.normals = seat_normals(self.B)
        self.op = limits.operational()
        self.phys = limits.physical()

    def measure(self, P: np.ndarray, Rm: np.ndarray) -> Dict[str, np.ndarray]:
        """P: (..., 6, 3) juntas do tampo; Rm: (..., 3, 3). Medidas brutas de cada pose."""
        s = P - self.B
        L = np.linalg.norm(s, axis=-1)
        u = s / L[..., None]
        base = np.degrees(np.arccos(np.clip(np.sum(u * self.normals, axis=-1), -1, 1)))
        top_n = Rm[..., :, 2]                                   # normal do tampo
        top = np.degrees(np.arccos(np.clip(np.sum(u * top_n[..., None, :], axis=-1), -1, 1)))
        z = float(self.limits.joint_zone_mm)
        a = self.B + u * z                                      # começo do trecho checado
        b = P - u * z                                           # fim do trecho
        i, j = np.array(PAIRS).T
        dist = segment_distance(a[..., i, :], b[..., i, :], a[..., j, :], b[..., j, :])  # (..., 15)
        return {"L": L, "base": base, "top": top, "dist": dist}

    def flags(self, m: Dict[str, np.ndarray], lim: Dict[str, float]) -> Dict[str, np.ndarray]:
        """Falhas por perna para um conjunto de limites (operação ou físico)."""
        stroke = (m["L"] < lim["stroke_min"]) | (m["L"] > lim["stroke_max"])
        base = m["base"] > lim["cardan_base_max_deg"]
        top = m["top"] > lim["cardan_top_max_deg"]
        close_pair = m["dist"] < lim["min_axis_distance_mm"]     # (..., 15)
        folga = np.zeros_like(stroke)
        for k, (i, j) in enumerate(PAIRS):
            folga[..., i] |= close_pair[..., k]
            folga[..., j] |= close_pair[..., k]
        return {"curso": stroke, "cardan_base": base, "cardan_topo": top, "folga": folga}

    def valid(self, P: np.ndarray, Rm: np.ndarray, physical: bool = False) -> np.ndarray:
        """Máscara de poses aceitas (operação, ou só o físico)."""
        f = self.flags(self.measure(P, Rm), self.phys if physical else self.op)
        bad = f["curso"] | f["cardan_base"] | f["cardan_topo"] | f["folga"]
        return ~np.any(bad, axis=-1)

    def detail(self, P: np.ndarray, Rm: np.ndarray) -> dict:
        """Uma pose: medidas, folgas até cada limite e os motivos de cada perna."""
        m = self.measure(P, Rm)
        op = self.flags(m, self.op)
        ph = self.flags(m, self.phys)
        legs: List[dict] = []
        for i in range(6):
            reasons = [k for k in REASONS if op[k][i]]
            legs.append({
                "length": float(m["L"][i]),
                "cardan_base_deg": float(m["base"][i]),
                "cardan_top_deg": float(m["top"][i]),
                "reasons": reasons,
                "physical_ok": not any(ph[k][i] for k in REASONS),
            })
        k = int(np.argmin(m["dist"]))
        return {
            "valid": all(not leg["reasons"] for leg in legs),
            "physical_ok": all(leg["physical_ok"] for leg in legs),
            "legs": legs,
            "closest_pair": [PAIRS[k][0] + 1, PAIRS[k][1] + 1],
            "closest_distance_mm": float(m["dist"][k]),
            # quanto falta até o limite de operação mais próximo (negativo = passou)
            "margins": {
                "stroke_mm": float(min(np.min(m["L"] - self.op["stroke_min"]), np.min(self.op["stroke_max"] - m["L"]))),
                "cardan_base_deg": float(self.op["cardan_base_max_deg"] - np.max(m["base"])),
                "cardan_top_deg": float(self.op["cardan_top_max_deg"] - np.max(m["top"])),
                "distance_mm": float(np.min(m["dist"]) - self.op["min_axis_distance_mm"]),
            },
        }


def reason_text(detail: dict) -> Optional[str]:
    """Frase curta com o primeiro motivo de recusa (para mensagens de erro)."""
    for i, leg in enumerate(detail["legs"]):
        if leg["reasons"]:
            k = leg["reasons"][0]
            if k == "folga":
                a, b = detail["closest_pair"]
                return f"pernas {a} e {b} perto de encostar"
            return f"pistão {i + 1}: {REASONS[k]}"
    return None


# ---------------------------------------------------------------- home e envelope
def _level_lengths(B, P0, z):
    return np.linalg.norm(P0 + [0, 0, z] - B, axis=1)


def balanced_home_z(B: np.ndarray, P0: np.ndarray, limits: JointLimits) -> float:
    """Altura com o tampo nivelado em que as pernas ficam no meio do curso de operação
    (mesma folga para subir e para descer), arredondada a 5 mm."""
    op = limits.operational()
    lo, hi = 200.0, 900.0
    for _ in range(60):
        z = (lo + hi) / 2
        L = _level_lengths(B, P0, z)
        down, up = np.min(L) - op["stroke_min"], op["stroke_max"] - np.max(L)
        if down < up:
            lo = z
        else:
            hi = z
    return float(round(((lo + hi) / 2) / 5.0) * 5.0)


AXES = ("x", "y", "z", "roll", "pitch", "yaw")


def compute_envelope(valid, home: dict, max_trans: float = 400.0, max_angle: float = 60.0) -> dict:
    """Alcance de operação de cada eixo a partir do home (bisseção) e a inclinação máxima
    em qualquer direção (o menor alcance combinado de roll e pitch). `valid(pose) -> bool`."""
    def reach(axis: str, sign: int) -> float:
        lo, hi = 0.0, (max_trans if axis in ("x", "y", "z") else max_angle)
        for _ in range(32):
            m = (lo + hi) / 2
            p = dict(home)
            p[axis] = home[axis] + sign * m
            if valid(p):
                lo = m
            else:
                hi = m
        return lo

    out = {a: [-reach(a, -1), reach(a, 1)] for a in AXES}
    tilt = max_angle
    for k in range(16):
        d = 2 * math.pi * k / 16
        lo, hi = 0.0, max_angle
        for _ in range(28):
            m = (lo + hi) / 2
            p = dict(home, roll=m * math.cos(d), pitch=m * math.sin(d))
            if valid(p):
                lo = m
            else:
                hi = m
        tilt = min(tilt, lo)
    return {"home": home, "reach": out, "tilt_deg": tilt}
