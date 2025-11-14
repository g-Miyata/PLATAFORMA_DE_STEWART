/*
 * CONTROLE POR ACELERÔMETRO MPU-6050
 */

const API_BASE = "http://localhost:8001";
const WS_URL = "ws://localhost:8001/ws/telemetry";

// Altura padrão para modo MPU (530 para posição neutra)
const DEFAULT_Z_HEIGHT = 530;

// OTIMIZAÇÃO: Variáveis globais para throttle
const WS_UPDATE_INTERVAL = 33; // ~30 FPS
const CONTROL_UPDATE_INTERVAL = 100; // ~10 Hz para comandos
const KINEMATICS_CALC_INTERVAL = 100; // ~10 Hz para cálculo de cinemática
let lastWSUpdate = 0;
let lastControlUpdate = 0;
let lastKinematicsCalc = 0;
let lastWSMessage = null;

let ws = null;
let wsTimer = null;
let controlEnabled = false;
let scale = 1.0; // Escala de sensibilidade (0.0 a 2.0)
let lastMPUData = null;
let updateCount = 0;
let lastRateCheck = Date.now();
let serialConnected = false;
let currentPlatformData = null;

window.__threeScenes = {};

// OTIMIZAÇÃO: Cache de objetos 3D
const objectCache = {};
let update3DPending = false;
let last3DData = null;

// ========== Toast Helper ==========
function showToast(message, type = "info") {
  const backgrounds = {
    success: "linear-gradient(to right, #10b981, #059669)",
    error: "linear-gradient(to right, #ef4444, #dc2626)",
    warning: "linear-gradient(to right, #f59e0b, #d97706)",
    info: "linear-gradient(to right, #3b82f6, #2563eb)",
  };

  Toastify({
    text: message,
    duration: 3000,
    gravity: "top",
    position: "right",
    stopOnFocus: true,
    style: {
      background: backgrounds[type] || backgrounds.info,
      borderRadius: "8px",
      fontFamily: "Inter, sans-serif",
      fontWeight: "500",
    },
  }).showToast();
}

// ========== Funções Serial (usam common.js) ==========
// loadSerialPorts(), openSerial(), closeSerial() vêm de common.js

// ========== Three.js Setup ==========
const COLORS = {
  base: 0xcd191e,
  platform: 0x2f9e41,
  actuatorValid: 0x50c878,
  actuatorInvalid: 0xff4444,
  background: 0x0f172a,
  grid: 0x475569,
};

function init3D(containerId) {
  console.log(`🎬 Inicializando 3D para ${containerId}`);

  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`❌ Container não encontrado: ${containerId}`);
    return;
  }

  container.innerHTML = "";

  const width = container.offsetWidth || 600;
  const height = container.offsetHeight || 420;

  console.log(`📐 Dimensões: ${width}x${height}`);

  const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 2000);
  camera.position.set(500, 500, 500);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  console.log("✅ Renderer criado e anexado ao DOM");

  let controls = null;
  if (typeof THREE.OrbitControls !== "undefined") {
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 200, 0);
    console.log("✅ OrbitControls inicializado");
  } else {
    console.warn("⚠️ OrbitControls não disponível");
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.background);

  scene.add(new THREE.AmbientLight(0x404040, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(200, 300, 200);
  dir.castShadow = true;
  scene.add(dir);

  const grid = new THREE.GridHelper(600, 30, COLORS.grid, COLORS.grid);
  grid.position.y = -50;
  scene.add(grid);

  const baseGroup = new THREE.Group();
  const platformGroup = new THREE.Group();
  const actuatorGroup = new THREE.Group();
  scene.add(baseGroup, platformGroup, actuatorGroup);

  console.log("✅ Grupos criados e adicionados à cena");

  function onResize() {
    const w = container.offsetWidth || 600;
    const h = container.offsetHeight || 420;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener("resize", onResize);

  function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    renderer.render(scene, camera);
  }
  animate();

  console.log("✅ Loop de animação iniciado");

  window.__threeScenes[containerId] = {
    scene,
    camera,
    renderer,
    controls,
    baseGroup,
    platformGroup,
    actuatorGroup,
  };

  console.log(`✅ Contexto 3D salvo em window.__threeScenes['${containerId}']`);
}

function createBasePoint(position) {
  const g = new THREE.Group();
  const sph = new THREE.Mesh(
    new THREE.SphereGeometry(8, 16, 16),
    new THREE.MeshPhongMaterial({ color: COLORS.base })
  );
  sph.castShadow = true;
  g.add(sph);
  g.position.set(position[0], position[2] || 0, position[1]);
  return g;
}

function createPlatformPoint(position) {
  const g = new THREE.Group();
  const sph = new THREE.Mesh(
    new THREE.SphereGeometry(6, 16, 16),
    new THREE.MeshPhongMaterial({ color: COLORS.platform })
  );
  sph.castShadow = true;
  g.add(sph);
  g.position.set(position[0], position[2], position[1]);
  return g;
}

function createActuator(startPos, endPos, actuator) {
  const g = new THREE.Group();
  const start = new THREE.Vector3(startPos[0], startPos[2] || 0, startPos[1]);
  const end = new THREE.Vector3(endPos[0], endPos[2], endPos[1]);
  const length = start.distanceTo(end);

  console.log(
    `  🔧 Criando atuador: start=${JSON.stringify(
      startPos
    )}, end=${JSON.stringify(endPos)}, length=${length.toFixed(1)}, valid=${
      actuator.valid
    }`
  );

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

function draw3DPlatform(containerId, data) {
  console.log(`🎨 draw3DPlatform chamado para ${containerId}`, data);

  const ctx = window.__threeScenes[containerId];
  if (!ctx) {
    console.error(`❌ Contexto 3D não encontrado para ${containerId}`);
    console.log("Contextos disponíveis:", Object.keys(window.__threeScenes));
    return;
  }

  console.log("✅ Contexto 3D encontrado:", ctx);

  const { scene, controls, baseGroup, platformGroup, actuatorGroup } = ctx;

  // Limpar grupos e recriar (método simples e estável)
  baseGroup.clear();
  platformGroup.clear();
  actuatorGroup.clear();

  console.log("🧹 Grupos limpos");

  const bs = data.base_points;
  console.log("📍 Base points:", bs);
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
  const baseWire = new THREE.LineSegments(
    baseEdges,
    new THREE.LineBasicMaterial({ color: COLORS.base })
  );
  baseWire.rotation.x = -Math.PI / 2;
  baseWire.position.y = -4;
  baseGroup.add(baseWire);

  bs.forEach((p) => baseGroup.add(createBasePoint(p)));

  const verts = [],
    idx = [];
  const ps = data.platform_points;
  console.log("📍 Platform points:", ps);
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
  platGeo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
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
  edgeGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(edgeVerts, 3)
  );
  const edgeLine = new THREE.Line(
    edgeGeo,
    new THREE.LineBasicMaterial({ color: 0x1a6b2d })
  );
  platformGroup.add(edgeLine);

  ps.forEach((p) => platformGroup.add(createPlatformPoint(p)));

  (data.actuators || []).forEach((a, i) => {
    actuatorGroup.add(createActuator(bs[i], ps[i], a));
  });

  console.log("✅ Atuadores desenhados:", data.actuators.length);

  if (controls) {
    const h = ps[0][2] || 432;
    controls.target.set(0, h / 2, 0);
    controls.update();
    console.log(
      "📷 Câmera atualizada - target:",
      controls.target,
      "position:",
      ctx.camera.position
    );
  }

  console.log("✅ draw3DPlatform concluído com sucesso");
}

function resetCamera(containerId) {
  console.log(`🔄 Resetando câmera de ${containerId}`);
  const ctx = window.__threeScenes[containerId];
  if (!ctx) {
    console.error(`❌ Contexto não encontrado para ${containerId}`);
    return;
  }
  const { camera, controls } = ctx;
  camera.position.set(500, 500, 500);
  if (controls) {
    controls.target.set(0, 200, 0);
    controls.update();
  }
  console.log(
    "✅ Câmera resetada - position:",
    camera.position,
    "target:",
    controls?.target
  );
}

// Atualiza medidas dos pistões
function updatePreviewMeasures(actuators) {
  console.log("📏 Atualizando medidas Preview:", actuators);
  (actuators || []).forEach((a, index) => {
    const el = document.getElementById(`preview-piston-${index + 1}`);
    const card = el?.parentElement;
    if (el && card) {
      const length = a.length ?? a.length_abs ?? 0;
      const isValid = a.valid !== undefined ? a.valid : true;

      console.log(
        `  P${index + 1}: length=${length.toFixed(1)}mm, valid=${isValid}`
      );

      el.textContent = `${length.toFixed(1)} mm`;
      card.style.borderColor = isValid ? "#10b981" : "#ef4444";
      el.style.color = isValid ? "#10b981" : "#ef4444";
    } else {
      console.warn(`⚠️ Elemento não encontrado para pistão ${index + 1}`);
    }
  });
}

function updateLiveMeasures(actuators) {
  (actuators || []).forEach((a, index) => {
    const el = document.getElementById(`live-piston-${index + 1}`);
    const card = el?.parentElement;
    if (el && card) {
      el.textContent = `${a.length_abs.toFixed(1)} mm`;
      card.style.borderColor = a.valid ? "#10b981" : "#ef4444";
      el.style.color = a.valid ? "#10b981" : "#ef4444";
    }
  });
}

// ========== MPU Control ==========

async function recalibrateMPU() {
  if (!serialConnected) {
    showToast("Conecte-se primeiro à porta serial", "warning");
    return;
  }

  try {
    showToast("📡 Enviando comando de recalibração...", "info");

    const resp = await fetch(`${API_BASE}/serial/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "recalibra" }),
    });

    if (!resp.ok) {
      const error = await resp.json();
      throw new Error(error?.detail || `Erro ${resp.status}`);
    }

    const result = await resp.json();
    console.log("✅ Comando de recalibração enviado:", result);
    showToast('✅ Comando "recalibra" enviado ao ESP32!', "success");
  } catch (e) {
    console.error("❌ Erro ao recalibrar MPU:", e);
    showToast(`Erro ao recalibrar: ${e.message}`, "error");
  }
}

function updateMPUDisplay(mpu) {
  if (!mpu) return;
  const formattedRoll =
    mpu.roll.toFixed(1) > 10
      ? 10
      : mpu.roll.toFixed(1) < -10
      ? -10
      : mpu.roll.toFixed(1);
  const formattedPitch =
    mpu.pitch.toFixed(1) > 10
      ? 10
      : mpu.pitch.toFixed(1) < -10
      ? -10
      : mpu.pitch.toFixed(1);
  const formattedYaw =
    mpu.yaw.toFixed(1) > 10
      ? 10
      : mpu.yaw.toFixed(1) < -10
      ? -10
      : mpu.yaw.toFixed(1);

  document.getElementById("mpu-roll").textContent = `${formattedRoll}°`;
  document.getElementById("mpu-pitch").textContent = `${formattedPitch}°`;
  document.getElementById("mpu-yaw").textContent = `${formattedYaw}°`;

  // Barras de progresso baseadas nos limites corretos
  // Roll: -10° a +10° -> 0% a 100%
  const rollPercent = ((parseFloat(formattedRoll) + 10) / 20) * 100;
  // Pitch: -10° a +10° -> 0% a 100%
  const pitchPercent = ((parseFloat(formattedPitch) + 10) / 20) * 100;
  // Yaw: -10° a +10° -> 0% a 100%
  const yawPercent = ((parseFloat(formattedYaw) + 10) / 20) * 100;

  document.getElementById("mpu-roll-bar").style.width = `${Math.max(
    0,
    Math.min(100, rollPercent)
  )}%`;
  document.getElementById("mpu-pitch-bar").style.width = `${Math.max(
    0,
    Math.min(100, pitchPercent)
  )}%`;
  document.getElementById("mpu-yaw-bar").style.width = `${Math.max(
    0,
    Math.min(100, yawPercent)
  )}%`;

  updateCount++;
  const now = Date.now();
  if (now - lastRateCheck >= 1000) {
    const rate = updateCount / ((now - lastRateCheck) / 1000);
    document.getElementById("update-rate").textContent = `${rate.toFixed(
      1
    )} Hz`;
    updateCount = 0;
    lastRateCheck = now;
  }
}

// ========== Limitação de Ângulos ==========

function limitAngles(roll, pitch, yaw) {
  // Limitar roll entre -10 e +10
  if (roll > 10) roll = 10;
  else if (roll < -10) roll = -10;

  // Limitar pitch entre -10 e +10
  if (pitch > 10) pitch = 10;
  else if (pitch < -10) pitch = -10;

  // Limitar yaw entre -10° e +10°
  if (yaw > 10) yaw = 10;
  else if (yaw < -10) yaw = -10;

  return { roll, pitch, yaw };
}

// ========== Cálculo de Cinemática (igual kinematics) ==========

async function calculateKinematicsFromMPU(mpu) {
  try {
    // PRIMEIRO: Limitar os ângulos recebidos do MPU (segurança)
    const limitedMPU = limitAngles(mpu.roll, mpu.pitch, mpu.yaw);

    // DEPOIS: Aplicar escala aos ângulos JÁ LIMITADOS
    let scaledAngles = {
      roll: limitedMPU.roll * scale,
      pitch: limitedMPU.pitch * scale,
      yaw: limitedMPU.yaw * scale,
    };

    // TERCEIRO: Limitar novamente após escala (caso escala > 1.0)
    const finalAngles = limitAngles(
      scaledAngles.roll,
      scaledAngles.pitch,
      scaledAngles.yaw
    );

    console.log("🎯 MPU Original:", {
      roll: mpu.roll.toFixed(2),
      pitch: mpu.pitch.toFixed(2),
      yaw: mpu.yaw.toFixed(2),
    });
    console.log("🔒 Limitado (pré-escala):", limitedMPU);
    console.log("📊 Escalado:", scaledAngles);
    console.log("✅ Final (pós-escala):", finalAngles);

    // Criar pose a partir dos ângulos FINAIS (limitados após escala)
    const pose = {
      x: 0,
      y: 0,
      z: DEFAULT_Z_HEIGHT, // 530mm - altura padrão para modo MPU
      roll: finalAngles.roll,
      pitch: finalAngles.pitch,
      yaw: finalAngles.yaw,
      _source: "motion.html-calculateKinematicsFromMPU", // DEBUG: identificar origem
    };

    console.log("📤 [MOTION.HTML] Enviando para /calculate:", pose);

    // Chamar backend (IGUAL ao kinematics)
    const resp = await fetch(`${API_BASE}/calculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pose),
    });

    if (!resp.ok) {
      console.error("❌ Erro na resposta:", resp.status, resp.statusText);
      throw new Error(`Erro ${resp.status}: ${resp.statusText}`);
    }

    const data = await resp.json();
    console.log("📥 Dados recebidos da API:", data);

    // Validar dados recebidos
    if (!data.base_points || !data.platform_points || !data.actuators) {
      console.error("❌ Dados incompletos da API:", {
        hasBasePoints: !!data.base_points,
        hasPlatformPoints: !!data.platform_points,
        hasActuators: !!data.actuators,
      });
      throw new Error("Dados incompletos da API");
    }

    console.log(
      "✅ Validação OK - Base:",
      data.base_points.length,
      "Platform:",
      data.platform_points.length,
      "Actuators:",
      data.actuators.length
    );

    currentPlatformData = data;

    // Atualizar UI (IGUAL ao kinematics)
    updatePreviewMeasures(data.actuators);
    console.log("🎨 Chamando draw3DPlatform...");
    draw3DPlatform("canvas-preview", data);
    console.log("✅ draw3DPlatform concluído");

    return data;
  } catch (e) {
    console.error("Erro ao calcular cinemática:", e);
    return null;
  }
}

async function sendMPUControl(mpu) {
  if (!controlEnabled || !mpu) return;

  // Verificar se está conectado à serial
  if (!serialConnected) {
    console.warn(
      "⚠️ Controle MPU ativo mas serial NÃO conectada - comandos não serão aplicados"
    );
    return;
  }

  const now = performance.now();
  if (now - lastControlUpdate < CONTROL_UPDATE_INTERVAL) return;
  lastControlUpdate = now;

  try {
    // PRIMEIRO: Limitar os ângulos recebidos do MPU (segurança)
    const limitedMPU = limitAngles(mpu.roll, mpu.pitch, mpu.yaw);

    // SEGUNDO: Aplicar escala
    let scaledAngles = {
      roll: limitedMPU.roll * scale,
      pitch: limitedMPU.pitch * scale,
      yaw: limitedMPU.yaw * scale,
    };

    // TERCEIRO: Limitar novamente após escala (caso escala > 1.0)
    const finalAngles = limitAngles(
      scaledAngles.roll,
      scaledAngles.pitch,
      scaledAngles.yaw
    );

    // 🐛 DEBUG: Log do que está sendo enviado
    console.log(`📤 Enviando para /mpu/control:`, finalAngles);

    const res = await fetch(`${API_BASE}/mpu/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roll: finalAngles.roll,
        pitch: finalAngles.pitch,
        yaw: finalAngles.yaw,
        x: 0,
        y: 0,
        z: DEFAULT_Z_HEIGHT, // IMPORTANTE: Enviar Z=530mm explicitamente
        scale: 1.0, // Escala já foi aplicada, enviar 1.0 para não duplicar
      }),
    });

    if (res.ok) {
      const data = await res.json();

      // 🐛 DEBUG: Log da resposta
      console.log(`📥 Resposta de /mpu/control:`, data);

      if (data.applied) {
        // Atualizar preview com a simulação
        currentPlatformData = {
          pose: data.pose,
          actuators: data.lengths_abs.map((len, i) => ({
            length_abs: len,
            setpoint_mm: data.setpoints_mm[i],
            valid: true,
          })),
          base_points: data.base_points || getDefaultBasePoints(),
          platform_points: data.platform_points || [],
        };

        updatePreviewMeasures(currentPlatformData.actuators);
        if (currentPlatformData.platform_points.length > 0) {
          draw3DPlatform("canvas-preview", currentPlatformData);
        }
      }
    }
  } catch (e) {
    console.error("Erro ao enviar controle MPU:", e);
  }
}

function getDefaultBasePoints() {
  return [
    [305.5, -17, 0],
    [305.5, 17, 0],
    [-137.7, 273.23, 0],
    [-168, 255.7, 0],
    [-167.2, -256.2, 0],
    [-136.8, -273.6, 0],
  ];
}

// ========== WebSocket ==========

// Pontos fixos da base (mesmos do backend)
const BASE_POINTS_FIXED = [
  [305.5, -17, 0],
  [305.5, 17, 0],
  [-137.7, 273.23, 0],
  [-168, 255.7, 0],
  [-167.2, -256.2, 0],
  [-136.8, -273.6, 0],
];

function normalizeTelemetry(msg) {
  const out = {};
  if (msg.pose) out.pose = msg.pose;

  // Base points - usa os fixos se não vier no WebSocket
  if (msg.base_points) {
    out.base_points = msg.base_points;
  } else if (msg.base_points_live) {
    out.base_points = msg.base_points_live;
  } else {
    out.base_points = BASE_POINTS_FIXED;
  }

  // Platform points - PRIORIZA platform_points_live (do backend)
  if (msg.platform_points_live) {
    out.platform_points = msg.platform_points_live;
  } else if (msg.platform_points) {
    out.platform_points = msg.platform_points;
  }

  if (typeof msg.valid === "boolean") out.valid = msg.valid;

  // Processa os atuadores
  if (msg.actuators) {
    out.actuators = msg.actuators.map((a) => ({
      length_abs: a.length_abs || a.length || 0,
      valid: a.valid !== undefined ? a.valid : true,
    }));
  } else if (Array.isArray(msg.actuator_lengths_abs)) {
    out.actuators = msg.actuator_lengths_abs.map((len, i) => ({
      length_abs: len,
      valid: true,
    }));
  } else if (Array.isArray(msg.lengths)) {
    out.actuators = msg.lengths.map((len, i) => ({
      length_abs: len,
      valid: true,
    }));
  }

  return out;
}

function initTelemetryWS() {
  if (ws) {
    ws.close();
    ws = null;
  }

  try {
    ws = new WebSocket(WS_URL);
  } catch (e) {
    console.error("Erro ao criar WebSocket:", e);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log("WebSocket conectado");
  };

  ws.onclose = () => {
    console.log("WebSocket desconectado");
    scheduleReconnect();
  };

  ws.onerror = (e) => {
    console.error("Erro no WebSocket:", e);
  };

  ws.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);

      // Detectar mensagens com dados MPU ou BNO085 - SEM THROTTLE
      if ((msg.type === "telemetry_mpu" || msg.type === "telemetry_bno085") && msg.mpu) {
        lastMPUData = msg.mpu;

        // Atualizar display sempre (é rápido)
        updateMPUDisplay(msg.mpu);

        // Calcular cinemática com fila (evita sobrecarga)
        calculateKinematicsFromMPU(msg.mpu);

        // Se controle ativo, enviar comandos para ESP32
        if (controlEnabled) {
          sendMPUControl(msg.mpu);
        }
        return; // Não aplica throttle para MPU/BNO085
      }

      // Ignorar outras mensagens por enquanto (Live desabilitado)
      // TODO: Reativar Live depois que Preview estiver funcionando
      /*
            // Throttle apenas para telemetria de atuadores (Live)
            const now = performance.now();
            if (now - lastWSUpdate < WS_UPDATE_INTERVAL) {
              lastWSMessage = evt;
              return;
            }
            lastWSUpdate = now;
            
            // Atualizar visualização Live - normalizar dados primeiro
            const normalized = normalizeTelemetry(msg);
            
            if (normalized.base_points && normalized.platform_points && normalized.actuators) {
              console.log('📡 Telemetria Live recebida:', 
                normalized.actuators.map((a, i) => 
                  `P${i+1}: ${a.length_abs.toFixed(1)}mm`
                ).join(', ')
              );
              
              updateLiveMeasures(normalized.actuators);
              
              last3DData = normalized;
              if (!update3DPending) {
                update3DPending = true;
                requestAnimationFrame(() => {
                  if (last3DData) {
                    draw3DPlatform('canvas-live', last3DData);
                  }
                  update3DPending = false;
                });
              }
            }
            */
    } catch (e) {
      console.error("Erro ao processar mensagem WebSocket:", e);
    }
  };
}

function scheduleReconnect() {
  if (wsTimer) clearTimeout(wsTimer);
  wsTimer = setTimeout(() => {
    if (serialConnected) initTelemetryWS();
  }, 1000);
}

async function checkExistingConnection() {
  try {
    // Verifica o status real no backend
    const res = await fetch(`${API_BASE}/serial/status`);
    const status = await res.json();

    if (status.connected && status.port) {
      // Backend está conectado
      serialConnected = true;

      // Atualiza a UI
      document.getElementById("status-indicator").className =
        "w-3 h-3 rounded-full bg-green-500 pulse-dot";
      document.getElementById("status-text").textContent = "Conectado";
      document.getElementById("status-text").className =
        "text-green-500 font-medium";
      document.getElementById("status-port").textContent = status.port;
      document.getElementById("btn-open-serial").classList.add("hidden");
      document.getElementById("btn-close-serial").classList.remove("hidden");

      // Preenche o select com a porta conectada
      const select = document.getElementById("serial-port-select");
      if (![...select.options].some((opt) => opt.value === status.port)) {
        const opt = document.createElement("option");
        opt.value = status.port;
        opt.textContent = status.port;
        opt.selected = true;
        select.appendChild(opt);
      } else {
        select.value = status.port;
      }

      // Reconecta ao WebSocket
      initTelemetryWS();
      showToast("Conectado à porta " + status.port, "success");

      // Aplicar posição inicial neutra (530mm) quando já conectado ao carregar
      console.log("🚀 Aplicando posição inicial neutra (Z=530mm)...");
      try {
        const initRes = await fetch(`${API_BASE}/mpu/control`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roll: 0,
            pitch: 0,
            yaw: 0,
            x: 0,
            y: 0,
            z: DEFAULT_Z_HEIGHT, // 530mm
            scale: 1.0,
          }),
        });

        if (initRes.ok) {
          const data = await initRes.json();
          console.log("✅ Posição inicial aplicada:", data);

          // Atualizar visualização com os dados retornados
          if (data.platform_points && data.platform_points.length > 0) {
            currentPlatformData = {
              pose: data.pose,
              actuators: data.lengths_abs.map((len, i) => ({
                length_abs: len,
                setpoint_mm: data.setpoints_mm[i],
                valid: true,
              })),
              base_points: data.base_points,
              platform_points: data.platform_points,
            };
            updatePreviewMeasures(currentPlatformData.actuators);
            draw3DPlatform("canvas-preview", currentPlatformData);
          }
        }
      } catch (e) {
        console.error("❌ Erro ao enviar posição inicial:", e);
      }
    } else {
      console.log("❌ Backend não está conectado");
    }
  } catch (err) {
    console.error("⚠️ Erro ao verificar status:", err);
  }
}

// ========== Event Listeners ==========
document.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 Iniciando aplicação MPU-6050...");

  // Verificar se Three.js carregou
  if (typeof THREE === "undefined") {
    console.error("❌ Three.js não carregou!");
    showToast("Erro: Three.js não carregou", "error");
    return;
  }
  console.log("✅ Three.js versão:", THREE.REVISION);

  // Verificar se OrbitControls carregou
  if (typeof THREE.OrbitControls === "undefined") {
    console.warn("⚠️ OrbitControls não carregou");
  } else {
    console.log("✅ OrbitControls disponível");
  }

  // Verificar backend
  try {
    const pingResp = await fetch(`${API_BASE}/serial/ports`);
    if (pingResp.ok) {
      console.log("✅ Backend online em", API_BASE);
    } else {
      console.error("⚠️ Backend respondeu com erro:", pingResp.status);
    }
  } catch (e) {
    console.error("❌ Backend offline em", API_BASE, "- Erro:", e.message);
    showToast(
      "⚠️ Backend offline - verifique se FastAPI está rodando",
      "warning"
    );
  }

  // Inicializar 3D
  console.log("🎬 Inicializando canvas 3D...");
  init3D("canvas-preview");

  // Verificar se inicialização funcionou
  if (!window.__threeScenes["canvas-preview"]) {
    console.error("❌ Falha ao inicializar contexto 3D");
    showToast("Erro ao inicializar visualização 3D", "error");
  } else {
    console.log("✅ Contexto 3D inicializado com sucesso");
  }

  // Carregar portas
  console.log("🔌 Carregando portas seriais...");
  await loadSerialPorts();

  // Verificar se já existe conexão (e aplicar posição inicial se conectado)
  console.log("🔍 Verificando conexão existente...");
  await checkExistingConnection();

  // Calcular visualização inicial (não aplica no hardware, só preview)
  console.log("📐 Calculando visualização inicial neutra (Z=530mm)...");
  const initialData = await calculateKinematicsFromMPU({
    roll: 0,
    pitch: 0,
    yaw: 0,
  });

  if (initialData) {
    console.log("✅ Visualização inicial calculada");
  } else {
    console.error("❌ Falha ao calcular visualização inicial");
  }

  // Inicializa controles seriais comuns (event listeners + CSS da fonte)
  initCommonSerialControls();

  // Botão de recalibração
  document
    .getElementById("btn-recalibrate")
    .addEventListener("click", recalibrateMPU);

  // Adicionar botão de teste da API
  console.log("🧪 Para testar manualmente a API, use:");
  console.log("  window.testAPI()");
  window.testAPI = async () => {
    console.log("🧪 Testando API /calculate...");
    const testPose = {
      x: 0,
      y: 0,
      z: DEFAULT_Z_HEIGHT,
      roll: 0,
      pitch: 0,
      yaw: 0,
    };
    try {
      const resp = await fetch(`${API_BASE}/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testPose),
      });
      const data = await resp.json();
      console.log("✅ Resposta da API:", data);
      draw3DPlatform("canvas-preview", data);
      return data;
    } catch (e) {
      console.error("❌ Erro no teste:", e);
      return null;
    }
  };

  // Adicionar função de reset manual
  window.resetPreviewCamera = () => resetCamera("canvas-preview");

  // Controle ativo
  document.getElementById("control-enabled").addEventListener("change", (e) => {
    controlEnabled = e.target.checked;

    if (controlEnabled) {
      if (!serialConnected) {
        showToast(
          "⚠️ Controle ativado mas serial NÃO conectada! Conecte primeiro.",
          "warning"
        );
        console.warn("⚠️ Tentativa de ativar controle sem conexão serial");
      } else {
        showToast(
          "✅ Controle MPU ativado - comandos serão aplicados no hardware",
          "success"
        );
        console.log("✅ Controle MPU ativado");
      }
    } else {
      showToast("Controle MPU desativado", "info");
      console.log("❌ Controle MPU desativado");
    }
  });

  // Scale slider
  document.getElementById("scale-slider").addEventListener("input", (e) => {
    scale = parseFloat(e.target.value) / 100;
    document.getElementById("scale-value").textContent = `${e.target.value}%`;
  });

  showToast('🚀 Sistema Acelerometro Pronto', 'success');
});
