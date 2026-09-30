import * as THREE from 'three';

// Materiais compartilhados (criados uma vez; nada é recriado por frame).
export const MAT = {
  aluminum: new THREE.MeshStandardMaterial({ color: '#d9dde2', metalness: 0.35, roughness: 0.42 }),
  aluminumDark: new THREE.MeshStandardMaterial({ color: '#c4c9cf', metalness: 0.35, roughness: 0.5 }),
  chrome: new THREE.MeshStandardMaterial({ color: '#e8ebef', metalness: 0.6, roughness: 0.22 }),
  blackPlate: new THREE.MeshStandardMaterial({ color: '#17191b', metalness: 0.15, roughness: 0.55 }),
  blackRubber: new THREE.MeshStandardMaterial({ color: '#0d0e0f', metalness: 0, roughness: 0.85 }),
  bluePrint: new THREE.MeshStandardMaterial({ color: '#1f46c8', metalness: 0.05, roughness: 0.6 }),
  profile: new THREE.MeshStandardMaterial({ color: '#cfd3d8', metalness: 0.4, roughness: 0.45 }),
  greyDuct: new THREE.MeshStandardMaterial({ color: '#8d9399', metalness: 0.1, roughness: 0.7 }),
  psu: new THREE.MeshStandardMaterial({ color: '#d5d9de', metalness: 0.5, roughness: 0.35 }),
  estopYellow: new THREE.MeshStandardMaterial({ color: '#f2c500', roughness: 0.5 }),
  estopRed: new THREE.MeshStandardMaterial({ color: '#cd191e', roughness: 0.4 }),
};

export const STATUS_EMISSIVE = {
  ok: new THREE.Color('#000000'),
  near: new THREE.Color('#b86b00'),
  invalid: new THREE.Color('#d0181e'),
} as const;

export const STATUS_LINE = {
  ok: '#2f9e41',
  near: '#f59e0b',
  invalid: '#ef4444',
} as const;
