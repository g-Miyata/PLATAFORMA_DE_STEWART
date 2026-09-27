"""Gera interface/web/src/lib/limits.fixture.json: poses aleatórias com o veredito do backend
(válida?, motivos de cada perna, ângulos dos cardãs), para o teste de paridade do frontend.

    python tools/make_limits_fixture.py
"""
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "web" / "src" / "lib" / "limits.fixture.json"


def main():
    p = app.platform
    h = app.HOME_Z_MM
    rng = np.random.default_rng(2026)
    cases = []
    for _ in range(300):
        pose = {
            "x": float(rng.uniform(-100, 100)), "y": float(rng.uniform(-100, 100)), "z": float(rng.uniform(h - 90, h + 90)),
            "roll": float(rng.uniform(-11, 11)), "pitch": float(rng.uniform(-11, 11)), "yaw": float(rng.uniform(-30, 30)),
        }
        d = p.check_pose(**pose)
        cases.append({
            "pose": {k: round(v, 3) for k, v in pose.items()},
            "valid": d["valid"],
            "reasons": [leg["reasons"] for leg in d["legs"]],
            "base_deg": [round(leg["cardan_base_deg"], 4) for leg in d["legs"]],
            "top_deg": [round(leg["cardan_top_deg"], 4) for leg in d["legs"]],
            "closest_distance_mm": round(d["closest_distance_mm"], 4),
        })
    # o arredondamento da pose muda pouco: recalcula com a pose gravada
    for c in cases:
        d = p.check_pose(**c["pose"])
        c.update(valid=d["valid"], reasons=[leg["reasons"] for leg in d["legs"]],
                 base_deg=[round(leg["cardan_base_deg"], 4) for leg in d["legs"]],
                 top_deg=[round(leg["cardan_top_deg"], 4) for leg in d["legs"]],
                 closest_distance_mm=round(d["closest_distance_mm"], 4))
    OUT.write_text(json.dumps({"limits": p.limits_info(), "cases": cases}, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{OUT}: {len(cases)} poses, {sum(c['valid'] for c in cases)} válidas")


if __name__ == "__main__":
    main()
