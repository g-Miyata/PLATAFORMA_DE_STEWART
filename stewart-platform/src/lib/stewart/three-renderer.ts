import { PlatformData } from './types';

// Declarações de tipo para THREE.js global
declare global {
  interface Window {
    THREE: any;
  }
}

// Tipos para o contexto 3D
interface ThreeContext {
  scene: any;
  camera: any;
  renderer: any;
  controls: any | null;
  baseGroup: any;
  platformGroup: any;
  actuatorGroup: any;
}

export function init3DScene(container: HTMLElement): ThreeContext | null {
  if (!window.THREE) return null;

  const THREE = window.THREE;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);

  const width = container.offsetWidth || 600;
  const height = container.offsetHeight || 400;
  const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 2000);
  camera.position.set(500, 500, 500);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  let controls: any = null;
  if (THREE.OrbitControls) {
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 200, 0);
  }

  scene.add(new THREE.AmbientLight(0x404040, 0.6));
  const light = new THREE.DirectionalLight(0xffffff, 0.8);
  light.position.set(200, 300, 200);
  scene.add(light);

  const grid = new THREE.GridHelper(600, 30, 0x475569, 0x475569);
  grid.position.y = -50;
  scene.add(grid);

  const baseGroup = new THREE.Group();
  const platformGroup = new THREE.Group();
  const actuatorGroup = new THREE.Group();
  scene.add(baseGroup, platformGroup, actuatorGroup);

  function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    renderer.render(scene, camera);
  }
  animate();

  return { scene, camera, renderer, controls, baseGroup, platformGroup, actuatorGroup };
}

export function draw3DPlatform(ctx: ThreeContext | null, data: PlatformData): void {
  if (!ctx || !window.THREE) return;

  const THREE = window.THREE;
  const { baseGroup, platformGroup, actuatorGroup } = ctx;

  baseGroup.clear();
  platformGroup.clear();
  actuatorGroup.clear();

  const COLORS = {
    base: 0xcd191e,
    platform: 0x2f9e41,
    actuatorValid: 0x50c878,
    actuatorInvalid: 0xff4444,
  };

  // Draw base
  data.base_points.forEach((p) => {
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(8, 16, 16), new THREE.MeshPhongMaterial({ color: COLORS.base }));
    sphere.position.set(p[0], p[2] || 0, p[1]);
    baseGroup.add(sphere);
  });

  // Draw platform
  data.platform_points.forEach((p) => {
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 16), new THREE.MeshPhongMaterial({ color: COLORS.platform }));
    sphere.position.set(p[0], p[2], p[1]);
    platformGroup.add(sphere);
  });

  // Draw actuators
  data.actuators.forEach((a, i) => {
    const start = new THREE.Vector3(data.base_points[i][0], data.base_points[i][2] || 0, data.base_points[i][1]);
    const end = new THREE.Vector3(data.platform_points[i][0], data.platform_points[i][2], data.platform_points[i][1]);
    const length = start.distanceTo(end);

    const cylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, length, 8),
      new THREE.MeshPhongMaterial({
        color: a.valid ? COLORS.actuatorValid : COLORS.actuatorInvalid,
      })
    );

    const mid = start.clone().add(end).multiplyScalar(0.5);
    cylinder.position.copy(mid);
    cylinder.lookAt(end);
    cylinder.rotateX(Math.PI / 2);
    actuatorGroup.add(cylinder);
  });
}

export function resetCamera(ctx: ThreeContext | null, data: PlatformData | null): void {
  if (!ctx) return;
  const { camera, controls } = ctx;
  const h = data?.platform_points?.[0]?.[2] || 432;
  camera.position.set(500, h + 200, 500);
  if (controls) {
    controls.target.set(0, h / 2, 0);
    controls.update();
  }
}
