// Materiais, texturas (geradas em canvas, sem arquivos) e perfis 2D do modelo
// premium da Bancada 3D. Tudo é criado uma vez e compartilhado.
import * as THREE from 'three';

// ---------------- texturas em canvas ----------------
export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx) draw(ctx);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

const numberTextures = new Map<number, THREE.CanvasTexture>();
/** Adesivo preto com o número do pistão (como nos motores da bancada). */
export function pistonNumberTexture(n: number) {
  let t = numberTextures.get(n);
  if (!t) {
    t = canvasTexture(128, 128, (ctx) => {
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.roundRect(4, 4, 120, 120, 14);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 92px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(n), 64, 70);
    });
    numberTextures.set(n, t);
  }
  return t;
}

let motorLabel: THREE.CanvasTexture | null = null;
/** Etiqueta de papel em volta do motor (texto pequeno, como a do fabricante). */
export function motorLabelTexture() {
  motorLabel ??= canvasTexture(512, 128, (ctx) => {
    ctx.fillStyle = '#e9ebee';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#2a2d31';
    ctx.font = '600 22px Inter, Arial, sans-serif';
    ctx.fillText('XINHUANGDUO LINEAR ACTUATOR', 18, 40);
    ctx.font = '16px Inter, Arial, sans-serif';
    ctx.fillText('DC 24V   STROKE 250mm   60mm/s   80N', 18, 70);
    ctx.fillText('MODEL BHTGA-DW-250-24-60   CE', 18, 96);
    ctx.fillStyle = '#c8cbd0';
    ctx.fillRect(0, 118, 512, 10);
  });
  return motorLabel;
}

let ductTex: THREE.CanvasTexture | null = null;
/** Lateral da canaleta cinza: ranhuras verticais. */
export function ductTexture() {
  ductTex ??= canvasTexture(
    256,
    64,
    (ctx) => {
      ctx.fillStyle = '#9aa0a6';
      ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = '#55595e';
      for (let x = 6; x < 256; x += 16) ctx.fillRect(x, 10, 6, 54);
    },
    [4, 1],
  );
  return ductTex;
}

let grilleTex: THREE.CanvasTexture | null = null;
/** Tampa perfurada da fonte chaveada. */
export function grilleTexture() {
  grilleTex ??= canvasTexture(
    256,
    256,
    (ctx) => {
      ctx.fillStyle = '#cfd3d8';
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#3a3e43';
      for (let y = 12; y < 256; y += 20) for (let x = (y / 20) % 2 ? 12 : 22; x < 256; x += 20) {
        ctx.beginPath();
        ctx.ellipse(x, y, 7, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    [2, 1],
  );
  return grilleTex;
}

let warnTex: THREE.CanvasTexture | null = null;
export function warningLabelTexture() {
  warnTex ??= canvasTexture(256, 96, (ctx) => {
    ctx.fillStyle = '#f5d000';
    ctx.fillRect(0, 0, 256, 96);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 15px Arial, sans-serif';
    ctx.fillText('AC INPUT VOLTAGE CAN BE', 12, 30);
    ctx.fillText('SELECTED BY SWITCH. CHECK', 12, 52);
    ctx.fillText('INPUT VOLTAGE BEFORE POWER ON', 12, 74);
  });
  return warnTex;
}

let pcbTex: THREE.CanvasTexture | null = null;
/** Placa de driver vermelha com trilhas. */
export function pcbTexture() {
  pcbTex ??= canvasTexture(256, 200, (ctx) => {
    ctx.fillStyle = '#c3272b';
    ctx.fillRect(0, 0, 256, 200);
    ctx.strokeStyle = '#e0575a';
    ctx.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.moveTo(20 + i * 24, 20);
      ctx.lineTo(20 + i * 24, 110);
      ctx.lineTo(60 + i * 18, 180);
      ctx.stroke();
    }
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(96, 70, 64, 40); // CI de potência
    ctx.fillStyle = '#f2f2f2';
    ctx.font = '12px Arial, sans-serif';
    ctx.fillText('BTS7960  43A', 90, 135);
  });
  return pcbTex;
}

// ---------------- materiais ----------------
export const PM = {
  aluminum: new THREE.MeshPhysicalMaterial({ color: '#d7dbe0', metalness: 0.6, roughness: 0.32, clearcoat: 0.15, clearcoatRoughness: 0.4 }),
  aluminumMatte: new THREE.MeshStandardMaterial({ color: '#c6cad0', metalness: 0.45, roughness: 0.5 }),
  anodized: new THREE.MeshStandardMaterial({ color: '#bfc4ca', metalness: 0.5, roughness: 0.42 }),
  chrome: new THREE.MeshPhysicalMaterial({ color: '#f5f7fa', metalness: 0.82, roughness: 0.14, clearcoat: 0.6, envMapIntensity: 1.4 }),
  darkSteel: new THREE.MeshStandardMaterial({ color: '#43474d', metalness: 0.8, roughness: 0.35 }),
  powderBlack: new THREE.MeshPhysicalMaterial({ color: '#121417', metalness: 0.2, roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.5 }),
  plateUnderside: new THREE.MeshStandardMaterial({ color: '#6c7178', metalness: 0.35, roughness: 0.55, side: THREE.DoubleSide }),
  rubber: new THREE.MeshStandardMaterial({ color: '#0c0d0e', roughness: 0.9 }),
  gasket: new THREE.MeshStandardMaterial({ color: '#7a1010', roughness: 0.6 }),
  bluePla: new THREE.MeshPhysicalMaterial({ color: '#1f46c8', roughness: 0.5, clearcoat: 0.3, sheen: 0.3 }),
  motorCap: new THREE.MeshStandardMaterial({ color: '#8e949b', metalness: 0.7, roughness: 0.3 }),
  cableBlack: new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.6 }),
  cableRed: new THREE.MeshStandardMaterial({ color: '#d42a2a', roughness: 0.5 }),
  cableBlue: new THREE.MeshStandardMaterial({ color: '#2a63d4', roughness: 0.5 }),
  cableGreen: new THREE.MeshStandardMaterial({ color: '#2aa24a', roughness: 0.5 }),
  greyPlastic: new THREE.MeshStandardMaterial({ color: '#8f959b', roughness: 0.7 }),
  whitePlastic: new THREE.MeshStandardMaterial({ color: '#eceef0', roughness: 0.55 }),
  terminalGreen: new THREE.MeshStandardMaterial({ color: '#1e9e45', roughness: 0.5 }),
  terminalOrange: new THREE.MeshStandardMaterial({ color: '#ee8a12', roughness: 0.5 }),
  capacitor: new THREE.MeshStandardMaterial({ color: '#1e6b3a', roughness: 0.35, metalness: 0.2 }),
  estopYellow: new THREE.MeshStandardMaterial({ color: '#f2c500', roughness: 0.45 }),
  estopRed: new THREE.MeshPhysicalMaterial({ color: '#cd191e', roughness: 0.3, clearcoat: 0.8 }),
  handle: new THREE.MeshPhysicalMaterial({ color: '#2f9e41', roughness: 0.15, metalness: 0.1, transmission: 0.35, thickness: 20, clearcoat: 1 }),
};

export function lazyMaterials() {
  return {
    duct: new THREE.MeshStandardMaterial({ map: ductTexture(), roughness: 0.75 }),
    grille: new THREE.MeshStandardMaterial({ map: grilleTexture(), metalness: 0.6, roughness: 0.35 }),
    warning: new THREE.MeshStandardMaterial({ map: warningLabelTexture(), roughness: 0.6 }),
    pcb: new THREE.MeshStandardMaterial({ map: pcbTexture(), roughness: 0.55 }),
    motorLabel: new THREE.MeshStandardMaterial({ map: motorLabelTexture(), roughness: 0.7 }),
  };
}

// ---------------- perfis 2D ----------------
/** Retângulo de cantos arredondados centrado na origem. */
export function roundedRectShape(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Perfil de alumínio 40×40 com um canal em T em cada face e furo central. */
export function tSlotShape(size = 40, slot = 8.2, depth = 6) {
  const h = size / 2;
  const o = slot / 2;
  const c = 1.2; // chanfro dos cantos
  const pts: [number, number][] = [];
  // percorre as 4 faces no sentido anti-horário, abrindo o canal no meio de cada uma
  const face = (rot: number) => {
    const local: [number, number][] = [
      [h - c, -h],
      [o, -h],
      [o, -h + depth * 0.45],
      [o + 3.2, -h + depth * 0.45],
      [o + 3.2, -h + depth],
      [-o - 3.2, -h + depth],
      [-o - 3.2, -h + depth * 0.45],
      [-o, -h + depth * 0.45],
      [-o, -h],
      [-h + c, -h],
    ];
    // a face inferior foi escrita da direita para a esquerda: inverte para anti-horário
    for (const [x, y] of local.reverse()) {
      const cs = Math.cos(rot);
      const sn = Math.sin(rot);
      pts.push([x * cs - y * sn, x * sn + y * cs]);
    }
  };
  [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].forEach(face);
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const hole = new THREE.Path();
  hole.absarc(0, 0, 3.4, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return s;
}

/** Extrusão ao longo de +Y (em vez do +Z padrão do three). */
export function extrudeAlongY(shape: THREE.Shape, length: number, bevel = 0) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 3,
    curveSegments: 10,
  });
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}
