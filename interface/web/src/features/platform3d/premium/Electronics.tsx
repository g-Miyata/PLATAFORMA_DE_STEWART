import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ModelSlot } from '../ModelSlot';
import { Instances } from './Instances';
import { canvasTexture, lazyMaterials, PM } from './assets';

/*
 * Parte elétrica da bandeja, montada como nas fotos da bancada.
 * Sistema local (mm): u = x ao longo da caixa, v = y, z para cima a partir da bandeja.
 *
 * Vista de cima com u para cima (v para a esquerda), como na foto da bandeja:
 *
 *                     régua azul  → aponta para a ponta das juntas 5-6
 *         ┌──────────── canaleta ────────────┐
 *  régua  │  driver ×4    │c.   driver ×2    │
 *  cinza  │ (bornes p/ +v)│    (bornes p/ -v)│
 *  (+v)   │               │                  │
 *         └── canaleta ───┴── canaleta ──────┘
 * disjuntor       fonte 24 V (atravessada, rente ao lado longo)
 *
 * Os fios da régua cinza seguem para o DB37 entre os perfis sob os pistões 1 e 2.
 * As peças vêm dos .glb do Blender (driver-board, power-supply, breaker,
 * terminal-strip, terminal-strip-blue); sem eles ficam caixas simples.
 */

// o conjunto todo fica recuado U_SHIFT mm para a fonte caber dentro do lado longo
const U_SHIFT = 30;
const BOARD_ROWS = [130, 54, -22, -98];
const COL_A = 62; // 4 drivers, bornes virados para a canaleta de fora (+v)
const COL_B = -62; // 2 drivers
const DUCT_H = 58;
const DUCT_WALL = 2;
const OUTER = 115; // centro das canaletas laterais
const TOP_U = 182; // canaleta do fundo (lado oposto à fonte)
const PSU_U = -211.5;
const PSU_V = -24; // deslocada para a canaleta passar entre a fonte e o disjuntor
const STRIP_V = 168;
const STRIP_N = 52;
const STRIP_PITCH = 5.2;
const STRIP_START = -155; // primeira via, logo depois do disjuntor
const STRIP_U = STRIP_START + (STRIP_N * STRIP_PITCH) / 2;
// disjuntor logo acima da régua (mesma linha), polos atravessados; interruptor ao lado, no metalon
const BREAKER: [number, number] = [STRIP_START - 12 - 4 - 42.5, STRIP_V];
const SWITCH: [number, number] = [BREAKER[0], BREAKER[1] + 64];
// botoeira de emergência no chão, fora da base (lado da fonte), deitada com o botão para fora
const ESTOP: [number, number] = [-470, 90];

interface Duct {
  u: number;
  v: number;
  len: number;
  width: number;
  along: 'u' | 'v';
}

const DUCTS: Duct[] = [
  { u: 23.5, v: -OUTER, len: 347, width: 30, along: 'u' },
  // a canaleta do lado do disjuntor passa entre ele e a fonte e vai até a borda da base
  { u: -44, v: OUTER, len: 482, width: 30, along: 'u' },
  { u: 13.5, v: 0, len: 307, width: 25, along: 'u' },
  { u: TOP_U, v: 0, len: 260, width: 30, along: 'v' },
];

const WIRE_COLORS = ['#f2c318', '#2aa24a', '#f07a1a', '#8a4fd0', '#2a63d4', '#e8559a', '#8a5a2b', '#f1f1ee', '#d42a2a', '#1fb5b0'];
const wireMats = new Map<string, THREE.MeshStandardMaterial>();
function wireMat(color: string) {
  let m = wireMats.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.45 });
    wireMats.set(color, m);
  }
  return m;
}

type P3 = [number, number, number];
type P2 = [number, number];
interface Wire {
  pts: P3[];
  color: string;
  r?: number;
}

/** Junta os fios por cor: dezenas de tubos viram poucos draw calls. */
function mergeWires(wires: Wire[]) {
  const byColor = new Map<string, THREE.BufferGeometry[]>();
  for (const w of wires) {
    const curve = new THREE.CatmullRomCurve3(w.pts.map((p) => new THREE.Vector3(...p)));
    const g = new THREE.TubeGeometry(curve, Math.max(8, w.pts.length * 6), w.r ?? 0.9, 5, false);
    const list = byColor.get(w.color) ?? [];
    list.push(g);
    byColor.set(w.color, list);
  }
  return [...byColor].map(([color, list]) => {
    const merged = mergeGeometries(list) ?? list[0];
    if (merged !== list[0]) list.forEach((g) => g.dispose());
    return { geometry: merged, material: wireMat(color) };
  });
}

/** Ponto local do driver (x = bornes → saída, y como na foto do produto) → bandeja. */
function boardToTray(u: number, v: number, rot: number, [x, y, z]: P3): P3 {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [u + x * c - y * s, v + x * s + y * c, z];
}

let noticeTex: THREE.CanvasTexture | null = null;
/** Etiqueta prateada "NOTICE" da tampa da fonte. */
function noticeTexture() {
  noticeTex ??= canvasTexture(256, 112, (ctx) => {
    ctx.fillStyle = '#c9ccd0';
    ctx.fillRect(0, 0, 256, 112);
    ctx.fillStyle = '#d0201c';
    ctx.font = 'bold 30px Arial, sans-serif';
    ctx.fillText('NOTICE:', 14, 38);
    ctx.fillStyle = '#26282b';
    ctx.font = '15px Arial, sans-serif';
    ctx.fillText('This power supply is built-in', 14, 62);
    ctx.fillText('fan on/off control circuit.', 14, 82);
    ctx.fillText('Fan works according to temp.', 14, 102);
  });
  return noticeTex;
}

function DriverFallback() {
  const mats = useMemo(() => lazyMaterials(), []);
  return (
    <group>
      <mesh material={mats.pcb} position={[0, 0, 0.8]} castShadow>
        <boxGeometry args={[63, 58, 1.6]} />
      </mesh>
      <mesh material={PM.terminalOrange} position={[-29, 16, 8]}>
        <boxGeometry args={[12, 26, 13]} />
      </mesh>
      <mesh material={PM.terminalGreen} position={[-29, -15, 8]}>
        <boxGeometry args={[12, 10, 13]} />
      </mesh>
      <mesh material={PM.capacitor} position={[-11, -16.5, 8]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[6.3, 6.3, 25, 20]} />
      </mesh>
      <mesh material={PM.rubber} position={[29, 10, 8]}>
        <boxGeometry args={[12, 20, 13]} />
      </mesh>
    </group>
  );
}

/**
 * @param angle direção (rad) do eixo u — da fonte para a régua azul
 * @param db37Rear ponto dos copos de solda do DB37, em coordenadas do mundo
 * @param floor altura do chão em relação à bandeja (negativa)
 */
export function Electronics({ z, floor, angle, db37Rear }: { z: number; floor: number; angle: number; db37Rear: P3 }) {
  const noticeMat = useMemo(() => new THREE.MeshStandardMaterial({ map: noticeTexture(), roughness: 0.5, metalness: 0.3 }), []);
  const ductMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.7 }), []);
  const lidMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#a7adb3', roughness: 0.6 }), []);
  const slotMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4a4e53', roughness: 0.9 }), []);

  const drivers = useMemo(
    () => [
      ...BOARD_ROWS.map((u) => ({ u, v: COL_A, rot: -Math.PI / 2 })),
      ...BOARD_ROWS.slice(0, 2).map((u) => ({ u, v: COL_B, rot: Math.PI / 2 })),
    ],
    [],
  );

  // ranhuras das canaletas: caixas escuras nas duas paredes, a cada 8 mm
  const slots = useMemo(() => {
    const u: P3[] = [];
    const v: P3[] = [];
    for (const d of DUCTS) {
      const n = Math.floor(d.len / 8);
      for (let i = 0; i < n; i++) {
        const t = -d.len / 2 + 4 + i * 8;
        for (const s of [-1, 1]) {
          if (d.along === 'u') u.push([d.u + t, d.v + s * (d.width / 2 - DUCT_WALL / 2), 34]);
          else v.push([d.u + s * (d.width / 2 - DUCT_WALL / 2), d.v + t, 34]);
        }
      }
    }
    return { u, v, geoU: new THREE.BoxGeometry(3.6, DUCT_WALL + 0.6, 40), geoV: new THREE.BoxGeometry(DUCT_WALL + 0.6, 3.6, 40) };
  }, []);

  const wires = useMemo(() => {
    // copos de solda do DB37 no sistema da bandeja (o grupo gira `angle` em Z)
    const c = Math.cos(-angle);
    const sn = Math.sin(-angle);
    const toLocal = ([x, y, zz]: P3): P3 => [x * c - y * sn - U_SHIFT, x * sn + y * c, zz - z];
    const db = toLocal(db37Rear);
    // direção do comprimento do conector (paralela ao lado curto) no sistema local
    const along: P2 = [db[1], -db[0]];
    const al = Math.hypot(...along) || 1;
    const list: Wire[] = [];
    // todos os fios do lado de fora da régua cinza vão para os copos do DB37
    const x0 = STRIP_U - (STRIP_N * STRIP_PITCH) / 2;
    const knee: P3 = [x0 - 20, STRIP_V + 70, 14];
    for (let i = 0; i < 37; i++) {
      const u = x0 + STRIP_PITCH * (i + 0.5);
      const k = (i < 19 ? i - 9 : i - 19 - 8.5) * 2.77;
      const cup: P3 = [db[0] + (along[0] / al) * k, db[1] + (along[1] / al) * k, db[2] + (i < 19 ? 1.4 : -1.4)];
      list.push({
        pts: [
          [u, STRIP_V + 31, 21],
          [u, STRIP_V + 40, 15],
          [(u + knee[0]) / 2, STRIP_V + 55, 10 + (i % 5)],
          [knee[0] + (i % 7) - 3, knee[1] + (i % 5), knee[2] + (i % 3) * 2],
          [cup[0] - (db[0] - knee[0]) * 0.15, cup[1] - (db[1] - knee[1]) * 0.15, cup[2] - 6],
          cup,
        ],
        color: WIRE_COLORS[i % WIRE_COLORS.length],
        r: 0.7,
      });
    }
    // régua → canaleta de fora (lado de dentro da régua)
    for (let i = 0; i < 16; i++) {
      const u = x0 + STRIP_PITCH * (i * 2 + 1.5);
      list.push({ pts: [[u, STRIP_V - 31, 21], [u, STRIP_V - 38, 26], [u, OUTER + 15, 52]], color: ['#f1f1ee', '#2a63d4', '#141516'][i % 3] });
    }
    // drivers: fios dos bornes laranja/verde até a canaleta de fora e da saída até a do meio
    for (const d of drivers) {
      const outerWall = d.v < 0 ? -OUTER + 15 : OUTER - 15;
      const pins: [number, string][] = [[5.5, '#f1f1ee'], [10.6, '#141516'], [15.7, '#2a63d4'], [20.8, '#f1f1ee'], [-18, '#d42a2a'], [-12.9, '#141516']];
      for (const [y, color] of pins) {
        const a = boardToTray(d.u, d.v, d.rot, [-35, y, 7]);
        const b = boardToTray(d.u, d.v, d.rot, [-40, y, 10]);
        list.push({ pts: [a, b, [b[0], (b[1] + outerWall) / 2, 22], [b[0], outerWall, 44]], color });
      }
      for (const [y, color] of [[5, '#2a63d4'], [15, '#2aa24a']] as [number, string][]) {
        const a = boardToTray(d.u, d.v, d.rot, [35.6, y, 6]);
        const inner = d.v < 0 ? -12.5 : 12.5;
        list.push({ pts: [a, [a[0], (a[1] + inner) / 2, 14], [a[0], inner, 40]], color, r: 1.2 });
      }
    }
    // fonte (bornes do lado +v): entrada vinda do disjuntor e saídas 24 V para a canaleta
    for (let j = 0; j < 9; j++) {
      const y = -38 + 9.5 * j;
      const p: P3 = [PSU_U + y, PSU_V + 99, 34];
      const color = j < 3 ? (j === 0 ? '#8a5a2b' : j === 1 ? '#2a63d4' : '#2aa24a') : j < 6 ? '#141516' : '#d42a2a';
      const to: P3 = j < 3 ? [BREAKER[0] - 44, BREAKER[1] - 9 + j * 9, 30] : [PSU_U + 70, OUTER - 15, 40];
      const up = PSU_V + 112;
      list.push({ pts: [p, [p[0], up, 30], [(p[0] + to[0]) / 2, (up + to[1]) / 2, 62], to], color, r: 1.3 });
    }
    // disjuntor → régua (fase e neutro)
    // disjuntor → primeiras vias da régua (saída embaixo, entrando pela ponta)
    list.push({ pts: [[BREAKER[0] + 43, BREAKER[1] - 9, 22], [BREAKER[0] + 50, BREAKER[1] - 20, 14], [x0 + 2.6, STRIP_V - 38, 18], [x0 + 2.6, STRIP_V - 31, 21]], color: '#2a63d4', r: 1.3 });
    list.push({ pts: [[BREAKER[0] + 43, BREAKER[1] + 9, 22], [BREAKER[0] + 50, BREAKER[1] + 20, 14], [x0 + 7.8, STRIP_V + 38, 18], [x0 + 7.8, STRIP_V + 31, 21]], color: '#d42a2a', r: 1.3 });
    // interruptor → entrada do disjuntor
    for (const [y, color] of [[-8, '#2a63d4'], [8, '#f1f1ee']] as [number, string][]) {
      list.push({ pts: [[SWITCH[0] - 28.5, SWITCH[1] + y, 81], [SWITCH[0] - 40, SWITCH[1] + y - 20, 90], [BREAKER[0] - 55, BREAKER[1] + y, 40], [BREAKER[0] - 44, BREAKER[1] + y / 2, 30]], color, r: 1.2 });
    }
    // botoeira de emergência: dois fios vermelhos longos saem de baixo dela, correm pelo chão,
    // sobem a borda da bandeja e entram na canaleta ao lado do disjuntor
    for (const dv of [-2.2, 2.2]) {
      const e: P3 = [ESTOP[0], ESTOP[1] - 10 + dv, floor + 15];
      list.push({
        pts: [
          e,
          [e[0] + 14, e[1], floor + 4],
          [e[0] + 70, e[1] + 30 + dv, floor + 2.2],
          [-360, 150 + dv, floor + 2.2],
          [-305, 158 + dv, floor + 10],
          [-305, 140 + dv, 34],
          [-298, OUTER + dv, 30],
          [-280, OUTER + dv, 26],
          [-190, OUTER + dv, 24],
        ],
        color: '#d0302b',
        r: 1.9,
      });
    }
    return mergeWires(list);
  }, [angle, db37Rear, z, floor, drivers]);

  return (
    <group position={[0, 0, z]} rotation={[0, 0, angle]}>
      <group position={[U_SHIFT, 0, 0]}>
      {/* canaletas vazadas (fundo + duas paredes ranhuradas + tampa), pontas abertas como um túnel */}
      {DUCTS.map((d, i) => {
        // monta no sistema da canaleta (x ao longo dela) e gira 90° as que correm em v
        const lid: P3 = [d.len + 1, d.width + 3, 4];
        return (
          <group key={i} position={[d.u, d.v, 0]} rotation={[0, 0, d.along === 'u' ? 0 : Math.PI / 2]}>
            <mesh material={ductMat} position={[0, 0, DUCT_WALL / 2]} receiveShadow>
              <boxGeometry args={[d.len, d.width, DUCT_WALL]} />
            </mesh>
            {[-1, 1].map((sd) => (
              <mesh key={sd} material={ductMat} position={[0, sd * (d.width / 2 - DUCT_WALL / 2), DUCT_H / 2]} castShadow receiveShadow>
                <boxGeometry args={[d.len, DUCT_WALL, DUCT_H]} />
              </mesh>
            ))}
            <mesh material={lidMat} position={[0, 0, DUCT_H + 2]} castShadow>
              <boxGeometry args={lid} />
            </mesh>
          </group>
        );
      })}
      <Instances geometry={slots.geoU} material={slotMat} positions={slots.u} />
      <Instances geometry={slots.geoV} material={slotMat} positions={slots.v} />

      {/* drivers ponte H JZ-3615-A */}
      {drivers.map((d, i) => (
        <group key={i} position={[d.u, d.v, 3]} rotation={[0, 0, d.rot]}>
          <ModelSlot name="driver-board" zUp>
            <DriverFallback />
          </ModelSlot>
          {/* espaçadores */}
          {[[-28, -25.5], [28, -25.5], [-28, 25.5], [28, 25.5]].map(([x, y]) => (
            <mesh key={`${x}${y}`} material={PM.darkSteel} position={[x, y, -1.5]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[2.6, 2.6, 3, 6]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* fonte 24 V atravessada na ponta, bornes do lado da coluna de 4 drivers */}
      <group position={[PSU_U, PSU_V, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <ModelSlot name="power-supply" zUp>
          <mesh material={PM.aluminum} position={[0, 0, 25]} castShadow>
            <boxGeometry args={[215, 115, 50]} />
          </mesh>
        </ModelSlot>
        <mesh material={noticeMat} position={[17, 0, 50.15]} rotation={[0, 0, Math.PI / 2]}>
          <planeGeometry args={[62, 27]} />
        </mesh>
      </group>

      {/* régua de bornes cinza, disjuntor e régua azul */}
      <group position={[STRIP_U, STRIP_V, 0]}>
        <ModelSlot name="terminal-strip" zUp>
          <mesh material={PM.greyPlastic} position={[0, 0, 27]} castShadow>
            <boxGeometry args={[STRIP_N * STRIP_PITCH, 62, 46]} />
          </mesh>
        </ModelSlot>
      </group>
      <group position={[BREAKER[0], BREAKER[1], 0]} rotation={[0, 0, Math.PI / 2]}>
        <ModelSlot name="breaker" zUp>
          <mesh material={PM.whitePlastic} position={[0, 0, 35]} castShadow>
            <boxGeometry args={[36, 85, 70]} />
          </mesh>
        </ModelSlot>
        {/* trilho DIN curto sob o disjuntor */}
        <mesh material={PM.aluminum} position={[0, 0, 3.5]}>
          <boxGeometry args={[60, 35, 7]} />
        </mesh>
      </group>

      {/* interruptor: bloco de contato NO preto num suporte de chapa preso ao metalon, botão para fora */}
      <group position={[SWITCH[0], SWITCH[1], 0]}>
        <mesh material={PM.aluminumMatte} position={[-44, 0, 50]} castShadow>
          <boxGeometry args={[3, 58, 84]} />
        </mesh>
        <mesh material={PM.aluminumMatte} position={[-30, 0, 1.5]} castShadow>
          <boxGeometry args={[30, 58, 3]} />
        </mesh>
        {[-18, 18].map((y) => (
          <mesh key={y} material={PM.darkSteel} position={[-30, y, 3.6]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[3.4, 3.4, 1.2, 12]} />
          </mesh>
        ))}
        <mesh material={PM.rubber} position={[-28.5, 0, 58]} castShadow>
          <boxGeometry args={[28, 34, 44]} />
        </mesh>
        <mesh material={PM.rubber} position={[-19, 0, 58]} castShadow>
          <boxGeometry args={[9, 26, 36]} />
        </mesh>
        {[-8, 8].map((y) => (
          <mesh key={y} material={PM.darkSteel} position={[-28.5, y, 80.6]}>
            <cylinderGeometry args={[3, 3, 1.2, 12]} />
          </mesh>
        ))}
        {/* botão rotativo do lado de fora do suporte */}
        <mesh material={PM.rubber} position={[-52, 0, 58]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[15, 16, 12, 32]} />
        </mesh>
        <mesh material={PM.rubber} position={[-62, 0, 58]} rotation={[Math.PI / 4, 0, 0]} castShadow>
          <boxGeometry args={[8, 28, 7]} />
        </mesh>
      </group>
      <group position={[TOP_U + 48, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <ModelSlot name="terminal-strip-blue" zUp>
          <mesh material={PM.bluePla} position={[0, 0, 27]} castShadow>
            <boxGeometry args={[74, 62, 46]} />
          </mesh>
        </ModelSlot>
      </group>

      {/* botoeira de emergência (deitada, botão virado para fora da base) */}
      <group position={[ESTOP[0], ESTOP[1], floor + 35]} rotation={[0, 0, -Math.PI / 2]}>
        <group rotation={[Math.PI / 2, 0, 0]}>
          <ModelSlot name="estop" zUp>
            <group>
              <mesh material={PM.rubber} position={[0, 0, 20]} castShadow>
                <boxGeometry args={[68, 68, 40]} />
              </mesh>
              <mesh material={PM.estopYellow} position={[0, 0, 50]} castShadow>
                <boxGeometry args={[71, 71, 22]} />
              </mesh>
              <mesh material={PM.estopRed} position={[0, 0, 77]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[20, 20, 12, 40]} />
              </mesh>
            </group>
          </ModelSlot>
        </group>
      </group>

      {wires.map((w, i) => (
        <mesh key={i} geometry={w.geometry} material={w.material} castShadow />
      ))}
      </group>
    </group>
  );
}
