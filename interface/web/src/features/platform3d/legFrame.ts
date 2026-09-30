import * as THREE from 'three';
import type { Vec3 } from '@/lib/types';

// vetores de trabalho reaproveitados (nada é alocado por frame)
const vY = new THREE.Vector3();
const vX = new THREE.Vector3();
const vZ = new THREE.Vector3();
const vR = new THREE.Vector3();
const basis = new THREE.Matrix4();

/**
 * Posiciona um objeto no sistema local de uma perna: origem na junta da base (b),
 * +Y apontando para a junta do tampo (p) e +X para fora da plataforma (lado do
 * motor). Retorna o comprimento da perna (mm).
 */
export function applyLegFrame(obj: THREE.Object3D, b: Vec3, p: Vec3): number {
  vY.set(p[0] - b[0], p[1] - b[1], p[2] - b[2]);
  const L = vY.length();
  vY.divideScalar(L || 1);
  vR.set(b[0], b[1], 0).normalize();
  vX.copy(vR).addScaledVector(vY, -vR.dot(vY)).normalize();
  vZ.crossVectors(vX, vY);
  basis.makeBasis(vX, vY, vZ);
  obj.position.set(b[0], b[1], b[2]);
  obj.quaternion.setFromRotationMatrix(basis);
  return L;
}

/** Direção unitária da perna (base → tampo). */
export function legDirection(b: Vec3, p: Vec3, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(p[0] - b[0], p[1] - b[1], p[2] - b[2]).normalize();
}
