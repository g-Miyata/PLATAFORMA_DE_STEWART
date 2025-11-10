/**
 * three-utils.js - Utilitários Three.js compartilhados
 * Plataforma de Stewart - IFSP
 */

// ========== Cores da Plataforma ==========
const COLORS = {
  base: 0xcd191e,
  platform: 0x2f9e41,
  actuatorValid: 0x50c878,
  actuatorInvalid: 0xff4444,
  background: 0x0f172a,
  grid: 0x475569,
};

// ========== Cache de Cenas 3D ==========
// Armazena referências para cenas, câmeras, etc por containerId
if (!window.__threeScenes) {
  window.__threeScenes = {};
}

// ========== Inicialização de Cena 3D ==========
/**
 * Inicializa uma cena Three.js em um container
 * @param {string} containerId - ID do elemento HTML container
 * @returns {Object} Referência à cena criada
 */
function init3D(containerId) {
  console.log(`🎬 Inicializando 3D para ${containerId}`);

  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`❌ Container ${containerId} não encontrado`);
    return null;
  }

  // Limpa container anterior
  container.innerHTML = '';

  const width = container.offsetWidth || 600;
  const height = container.offsetHeight || 420;

  console.log(`📐 Dimensões: ${width}x${height}`);

  // Configurar câmera
  const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 2000);
  camera.position.set(500, 500, 500);

  // Configurar renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  console.log('✅ Renderer criado e anexado ao DOM');

  // Configurar controles de órbita
  let controls = null;
  if (typeof THREE.OrbitControls !== 'undefined') {
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 200, 0);
    console.log('✅ OrbitControls inicializado');
  } else {
    console.warn('⚠️ OrbitControls não disponível');
  }

  // Criar cena
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.background);

  // Iluminação
  scene.add(new THREE.AmbientLight(0x404040, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(200, 300, 200);
  dir.castShadow = true;
  scene.add(dir);

  // Grade de referência
  const grid = new THREE.GridHelper(600, 30, COLORS.grid, COLORS.grid);
  grid.position.y = -50;
  scene.add(grid);

  // Grupos para organização (importante!)
  const baseGroup = new THREE.Group();
  const platformGroup = new THREE.Group();
  const actuatorGroup = new THREE.Group();
  scene.add(baseGroup, platformGroup, actuatorGroup);

  // Salvar referência no cache global
  window.__threeScenes[containerId] = {
    scene,
    camera,
    renderer,
    controls,
    baseGroup,
    platformGroup,
    actuatorGroup,
  };

  // Loop de renderização
  function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    renderer.render(scene, camera);
  }
  animate();

  console.log(`✅ Cena 3D ${containerId} inicializada`);
  return window.__threeScenes[containerId];
}

// ========== Criação de Geometrias ==========

/**
 * Cria um ponto da base (vermelho)
 * @param {Array} position - [x, y, z]
 * @returns {THREE.Group}
 */
function createBasePoint(position) {
  const g = new THREE.Group();
  const sph = new THREE.Mesh(new THREE.SphereGeometry(8, 16, 16), new THREE.MeshPhongMaterial({ color: COLORS.base }));
  sph.castShadow = true;
  g.add(sph);
  g.position.set(position[0], position[2] || 0, position[1]);
  return g;
}

/**
 * Cria um ponto da plataforma (verde)
 * @param {Array} position - [x, y, z]
 * @returns {THREE.Group}
 */
function createPlatformPoint(position) {
  const g = new THREE.Group();
  const sph = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 16), new THREE.MeshPhongMaterial({ color: COLORS.platform }));
  sph.castShadow = true;
  g.add(sph);
  g.position.set(position[0], position[2], position[1]);
  return g;
}

/**
 * Cria um atuador (cilindro conectando base e plataforma)
 * @param {Array} startPos - [x, y, z] posição inicial
 * @param {Array} endPos - [x, y, z] posição final
 * @param {Object} actuator - { valid: boolean, length: number }
 * @returns {THREE.Group}
 */
function createActuator(startPos, endPos, actuator) {
  const g = new THREE.Group();
  const start = new THREE.Vector3(startPos[0], startPos[2] || 0, startPos[1]);
  const end = new THREE.Vector3(endPos[0], endPos[2], endPos[1]);
  const length = start.distanceTo(end);
  const cyl = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, length, 8),
    new THREE.MeshPhongMaterial({
      color: actuator.valid ? COLORS.actuatorValid : COLORS.actuatorInvalid,
    })
  );
  const mid = start.clone().add(end).multiplyScalar(0.5);
  cyl.position.copy(mid);
  cyl.lookAt(end);
  cyl.rotateX(Math.PI / 2);
  cyl.castShadow = true;
  g.add(cyl);
  return g;
}

// ========== Renderização da Plataforma ==========

/**
 * Desenha a plataforma completa no container especificado
 * @param {string} containerId - ID do container
 * @param {Object} data - Dados da plataforma { base_points, platform_points, actuators, valid }
 */
function draw3DPlatform(containerId, data) {
  const ctx = window.__threeScenes[containerId];
  if (!ctx) return;
  const { baseGroup, platformGroup, actuatorGroup } = ctx;

  baseGroup.clear();
  platformGroup.clear();
  actuatorGroup.clear();

  const bs = data.base_points;
  const baseShape = new THREE.Shape();
  baseShape.moveTo(bs[0][0], bs[0][1]);
  for (let i = 1; i < bs.length; i++) baseShape.lineTo(bs[i][0], bs[i][1]);
  baseShape.closePath();
  const baseGeo = new THREE.ShapeGeometry(baseShape);
  const baseMat = new THREE.MeshPhongMaterial({
    color: COLORS.base,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
  });
  const baseSurf = new THREE.Mesh(baseGeo, baseMat);
  baseSurf.rotation.x = -Math.PI / 2;
  baseSurf.position.y = -5;
  baseSurf.receiveShadow = true;
  baseGroup.add(baseSurf);

  const baseEdges = new THREE.EdgesGeometry(baseGeo);
  const baseWire = new THREE.LineSegments(baseEdges, new THREE.LineBasicMaterial({ color: COLORS.base }));
  baseWire.rotation.x = -Math.PI / 2;
  baseWire.position.y = -4;
  baseGroup.add(baseWire);

  bs.forEach((p) => baseGroup.add(createBasePoint(p)));

  const verts = [],
    idx = [];
  const ps = data.platform_points;
  ps.forEach((p) => verts.push(p[0], p[2], p[1]));
  let cx = 0,
    cy = 0,
    cz = 0;
  ps.forEach((p) => {
    cx += p[0];
    cy += p[2];
    cz += p[1];
  });
  cx /= ps.length;
  cy /= ps.length;
  cz /= ps.length;
  verts.push(cx, cy, cz);
  const cIndex = ps.length;
  for (let i = 0; i < ps.length; i++) {
    const n = (i + 1) % ps.length;
    idx.push(i, n, cIndex);
  }

  const platGeo = new THREE.BufferGeometry();
  platGeo.setIndex(idx);
  platGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  platGeo.computeVertexNormals();
  const platMat = new THREE.MeshPhongMaterial({
    color: COLORS.platform,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
  });
  const platSurf = new THREE.Mesh(platGeo, platMat);
  platSurf.castShadow = true;
  platSurf.receiveShadow = true;
  platformGroup.add(platSurf);

  const edgeVerts = [];
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    edgeVerts.push(p[0], p[2], p[1]);
  }
  const p0 = ps[0];
  edgeVerts.push(p0[0], p0[2], p0[1]);
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgeVerts, 3));
  const edgeLine = new THREE.Line(edgeGeo, new THREE.LineBasicMaterial({ color: 0x1a6b2d }));
  platformGroup.add(edgeLine);

  ps.forEach((p) => platformGroup.add(createPlatformPoint(p)));

  for (let i = 0; i < bs.length; i++) {
    const actuator = data.actuators && data.actuators[i] ? data.actuators[i] : { valid: true, length: 0 };
    const act = createActuator(bs[i], ps[i], actuator);
    actuatorGroup.add(act);
  }
}

// ========== Reset de Câmera ==========

/**
 * Reseta a câmera para a posição padrão
 * @param {string} containerId - ID do container
 */
function resetCamera(containerId) {
  const sceneRef = window.__threeScenes[containerId];
  if (!sceneRef) return;

  const { camera, controls } = sceneRef;

  camera.position.set(500, 500, 500);

  if (controls) {
    controls.target.set(0, 200, 0);
    controls.update();
  }
}

// ========== Atualização de Medidas dos Pistões ==========

/**
 * Atualiza as medidas dos pistões no DOM
 * @param {string} prefix - Prefixo do ID ('piston' ou 'piston-live')
 * @param {Array} actuators - Array de atuadores com { length: number }
 */
function updatePistonMeasures(prefix, actuators) {
  if (!actuators || actuators.length !== 6) {
    console.warn('⚠️ Dados de atuadores inválidos');
    return;
  }

  for (let i = 0; i < 6; i++) {
    const elem = document.getElementById(`${prefix}-${i + 1}-length`);
    if (elem && actuators[i] && typeof actuators[i].length === 'number') {
      elem.textContent = actuators[i].length.toFixed(1);
    }
  }
}

// ========== Exportar para uso global ==========
window.COLORS = COLORS;
window.init3D = init3D;
window.createBasePoint = createBasePoint;
window.createPlatformPoint = createPlatformPoint;
window.createActuator = createActuator;
window.draw3DPlatform = draw3DPlatform;
window.resetCamera = resetCamera;
window.updatePistonMeasures = updatePistonMeasures;
