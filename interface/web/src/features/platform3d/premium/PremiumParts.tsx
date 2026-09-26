import { Outlines } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { PISTON_COLORS } from '@/lib/pistons';
import { ModelSlot } from '../ModelSlot';
import { extrudeAlongY, lazyMaterials, PM, pistonNumberTexture, roundedRectShape } from './assets';

// ---------------- dimensões do atuador (mm), sistema local: +Y ao longo da perna ----------------
// Medidas do XINHUANGDUO BHTGA-DW-250 da bancada (fotos); as mesmas do actuator-housing.glb.
export const ACT = {
  joint: 22, // centro da junta até o início do atuador
  tubeStart: 36,
  tubeLength: 300,
  // perfil do tubo em "D" (vista de cima): curvo do lado do motor, quase reto do lado de fora
  tubeDepth: 44, // ao longo de X (direção do motor)
  tubeW: 42, // ao longo de Z
  tubeRNear: 16,
  tubeRFar: 4,
  houseX0: -24, // base retangular sob o tubo e o motor
  houseX1: 69,
  houseD: 46,
  houseR: 6,
  houseZ0: 20,
  houseLowTop: 48, // primeira junta vermelha (a metade de baixo leva o número)
  houseTop: 98,
  motorR: 21,
  motorX: 46,
  motorStart: 102,
  motorLen: 86,
  rodR: 10,
  rodLength: 400,
} as const;

function Yoke({ flip }: { flip: boolean }) {
  return (
    <group rotation={[0, flip ? Math.PI / 2 : 0, flip ? Math.PI : 0]}>
      <mesh material={PM.chrome} position={[0, -15, 0]} castShadow>
        <cylinderGeometry args={[9, 10, 10, 20]} />
      </mesh>
      {[-11, 11].map((x) => (
        <mesh key={x} material={PM.chrome} position={[x, -6, 0]} castShadow>
          <boxGeometry args={[5, 20, 15]} />
        </mesh>
      ))}
    </group>
  );
}

/** Junta universal (cardã) cromada: dois garfos a 90° e a cruzeta (kardan-top.glb, se houver). */
export function UJoint({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale}>
      <ModelSlot name="kardan-top">
        <group>
          <Yoke flip={false} />
          <Yoke flip />
          <mesh material={PM.darkSteel}>
            <boxGeometry args={[8, 8, 8]} />
          </mesh>
          <mesh material={PM.chrome} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[3.2, 3.2, 30, 12]} />
          </mesh>
          <mesh material={PM.chrome} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[3.2, 3.2, 30, 12]} />
          </mesh>
        </group>
      </ModelSlot>
    </group>
  );
}

/** Perfil do tubo (vista de cima), igual ao do actuator-housing.glb; inflate aumenta por igual. */
export function tubeProfileShape(inflate = 0) {
  const x0 = -ACT.tubeDepth / 2 - inflate;
  const x1 = ACT.tubeDepth / 2 + inflate;
  const h = ACT.tubeW / 2 + inflate;
  const rn = ACT.tubeRNear + inflate;
  const rf = ACT.tubeRFar + inflate;
  const s = new THREE.Shape();
  s.moveTo(x0 + rf, -h);
  s.lineTo(x1 - rn, -h);
  s.absarc(x1 - rn, -h + rn, rn, -Math.PI / 2, 0, false);
  s.lineTo(x1, h - rn);
  s.absarc(x1 - rn, h - rn, rn, 0, Math.PI / 2, false);
  s.lineTo(x0 + rf, h);
  s.absarc(x0 + rf, h - rf, rf, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, -h + rf);
  s.absarc(x0 + rf, -h + rf, rf, Math.PI, Math.PI * 1.5, false);
  return s;
}

let sharedGeo: ReturnType<typeof buildActuatorGeometry> | null = null;
/** Material que não pinta nada: só serve de base para o <Outlines> das cascas. */
const OUTLINE_PROXY = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
function buildActuatorGeometry() {
  return {
    tube: extrudeAlongY(tubeProfileShape(), ACT.tubeLength - 8, 0.5),
    tubeCap: extrudeAlongY(tubeProfileShape(1.5), 18, 1.5),
    band: extrudeAlongY(tubeProfileShape(0.7), 10),
    house: extrudeAlongY(roundedRectShape(ACT.houseX1 - ACT.houseX0, ACT.houseD, ACT.houseR), ACT.houseTop - ACT.houseZ0, 2),
  };
}

interface ActuatorBodyProps {
  index: number;
  highlighted: boolean;
  selected: boolean;
  /** material do tubo (o dono controla o brilho de estado do curso) */
  tubeMaterial: THREE.Material;
}

/**
 * Corpo fixo do atuador (tudo menos a haste). A carcaça vem do
 * actuator-housing.glb (modelado no Blender a partir das fotos) ou, sem ele, da
 * versão procedural; faixa colorida, etiqueta, número e cabo ficam por cima.
 */
export function ActuatorBody({ index, highlighted, selected, tubeMaterial }: ActuatorBodyProps) {
  sharedGeo ??= buildActuatorGeometry();
  const mats = useMemo(() => lazyMaterials(), []);
  const numberMat = useMemo(
    () => new THREE.MeshStandardMaterial({ map: pistonNumberTexture(index + 1), roughness: 0.6 }),
    [index],
  );
  const bandMat = useMemo(() => new THREE.MeshStandardMaterial({ color: PISTON_COLORS[index], roughness: 0.4 }), [index]);
  const cable = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(ACT.houseX1 + 6, ACT.houseZ0 + 12, -6),
      new THREE.Vector3(ACT.houseX1 + 26, ACT.houseZ0 - 4, -22),
      new THREE.Vector3(ACT.houseX1 + 6, -40, -64),
      new THREE.Vector3(ACT.motorX - 26, -62, -62),
    ]);
    return new THREE.TubeGeometry(curve, 32, 3.5, 8, false);
  }, []);
  // o tubo do .glb usa o material do dono (brilho de estado e pisca de limite)
  const overrides = useMemo(() => ({ Alu_Tubo: tubeMaterial }), [tubeMaterial]);
  const outline = highlighted || selected;
  const outlineColor = selected ? PISTON_COLORS[index] : '#ffffff';
  const houseCx = (ACT.houseX0 + ACT.houseX1) / 2;
  const motorCy = ACT.motorStart + ACT.motorLen / 2;

  return (
    <group>
      <ModelSlot name="actuator-housing" materials={overrides}>
        <ActuatorHousingProcedural tubeMaterial={tubeMaterial} />
      </ModelSlot>

      {/* contorno de hover/seleção: cascas invisíveis com as formas principais */}
      {outline && (
        <group>
          <mesh geometry={sharedGeo.tube} material={OUTLINE_PROXY} position={[0, ACT.tubeStart, 0]}>
            <Outlines thickness={2.5} color={outlineColor} />
          </mesh>
          <mesh geometry={sharedGeo.house} material={OUTLINE_PROXY} position={[houseCx, ACT.houseZ0, 0]}>
            <Outlines thickness={2.5} color={outlineColor} />
          </mesh>
          <mesh material={OUTLINE_PROXY} position={[ACT.motorX, motorCy, 0]}>
            <cylinderGeometry args={[ACT.motorR, ACT.motorR, ACT.motorLen, 40]} />
            <Outlines thickness={2.5} color={outlineColor} />
          </mesh>
        </group>
      )}

      {/* faixa com a cor do pistão, perto do topo do tubo */}
      <mesh geometry={sharedGeo.band} material={bandMat} position={[0, ACT.tubeStart + ACT.tubeLength - 44, 0]} />
      {/* etiqueta do fabricante em volta do motor */}
      <mesh material={mats.motorLabel} position={[ACT.motorX, motorCy + 4, 0]}>
        <cylinderGeometry args={[ACT.motorR + 0.3, ACT.motorR + 0.3, 36, 40, 1, true]} />
      </mesh>
      {/* adesivo preto com o número na metade de baixo da caixa (lado do motor) */}
      <mesh material={numberMat} position={[ACT.motorX, (ACT.houseZ0 + ACT.houseLowTop) / 2, ACT.houseD / 2 + 0.3]}>
        <planeGeometry args={[18, 18]} />
      </mesh>
      {/* cabo saindo da caixa */}
      <mesh geometry={cable} material={PM.cableBlack} castShadow />
    </group>
  );
}

/** Carcaça procedural (usada enquanto o .glb não carrega ou se ele faltar). */
function ActuatorHousingProcedural({ tubeMaterial }: { tubeMaterial: THREE.Material }) {
  const houseCx = (ACT.houseX0 + ACT.houseX1) / 2;
  return (
    <group>
      <mesh geometry={sharedGeo!.house} material={PM.aluminumMatte} position={[houseCx, ACT.houseZ0, 0]} castShadow />
      {[ACT.houseLowTop, ACT.houseLowTop + 9].map((y) => (
        <mesh key={y} material={PM.gasket} position={[houseCx, y + 0.6, 0]}>
          <boxGeometry args={[ACT.houseX1 - ACT.houseX0 + 0.4, 1.2, ACT.houseD + 0.4]} />
        </mesh>
      ))}
      <mesh geometry={sharedGeo!.tube} material={tubeMaterial} position={[0, ACT.tubeStart, 0]} castShadow receiveShadow />
      <mesh geometry={sharedGeo!.tubeCap} material={PM.rubber} position={[0, ACT.tubeStart + ACT.tubeLength - 12, 0]} />
      <mesh material={PM.aluminum} position={[ACT.motorX, ACT.motorStart + ACT.motorLen / 2, 0]} castShadow>
        <cylinderGeometry args={[ACT.motorR, ACT.motorR, ACT.motorLen, 40]} />
      </mesh>
      <mesh material={PM.motorCap} position={[ACT.motorX, ACT.motorStart + ACT.motorLen + 3, 0]}>
        <cylinderGeometry args={[ACT.motorR - 1.5, ACT.motorR, 6, 40]} />
      </mesh>
    </group>
  );
}

/** Haste cromada com ponteira; o dono posiciona o grupo ao longo de +Y. */
export function ActuatorRod() {
  return (
    <group>
      <mesh material={PM.chrome} castShadow>
        <cylinderGeometry args={[ACT.rodR, ACT.rodR, ACT.rodLength, 32]} />
      </mesh>
      <mesh material={PM.chrome} position={[0, ACT.rodLength / 2 - 6, 0]}>
        <cylinderGeometry args={[ACT.rodR + 2, ACT.rodR, 12, 32]} />
      </mesh>
    </group>
  );
}
