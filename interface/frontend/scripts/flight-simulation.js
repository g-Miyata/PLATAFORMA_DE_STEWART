const API_BASE_URL = window.API_BASE || 'http://localhost:8001';
const WS_URL = window.WS_URL || 'ws://localhost:8001/ws/telemetry';

const SAFE_POSE = {
  x: 0,
  y: 0,
  z: 500,
  roll: 0,
  pitch: 0,
  yaw: 0,
};
const PREVIEW_URL = `${API_BASE_URL}/flight-simulation/preview`;
const PREVIEW_INTERVAL_MS = 250;

const statusElements = {
  safeButton: document.getElementById('btn-safe-pose'),
  startButton: document.getElementById('btn-start-follow'),
  stopButton: document.getElementById('btn-stop-follow'),
  indicator: document.getElementById('follow-indicator'),
  telemetryChip: document.getElementById('telemetry-status'),
  safeZValue: document.getElementById('safe-z-value'),
  updatedAt: document.getElementById('status-updated-at'),
};

const poseElements = {
  roll: document.getElementById('pose-roll'),
  pitch: document.getElementById('pose-pitch'),
  yaw: document.getElementById('pose-yaw'),
  x: document.getElementById('pose-x'),
  y: document.getElementById('pose-y'),
  z: document.getElementById('pose-z'),
};
const pistonElements = Array.from({ length: 6 }, (_, idx) => document.getElementById(`piston-${idx + 1}`));

let telemetrySocket = null;
let telemetryReconnectTimer = null;
let safePoseApplied = false;
let followingEnabled = false;
let previewTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  if (typeof insertNavMenu === 'function') {
    insertNavMenu('nav-container', 'flight-simulation.html');
  }

  initScene();
  registerListeners();
  setFollowingState(false);
  connectTelemetry();
  startPreviewPolling();
  refreshSimulationStatus();
  setInterval(refreshSimulationStatus, 3000);
});

function initScene() {
  init3D('flight-sim-3d');
  updatePoseCards(SAFE_POSE);
  renderPosePreview(SAFE_POSE);
}

function registerListeners() {
  statusElements.safeButton?.addEventListener('click', sendSafePose);
  statusElements.startButton?.addEventListener('click', startFollowing);
  statusElements.stopButton?.addEventListener('click', stopFollowing);

  document.getElementById('btn-reset-camera')?.addEventListener('click', () => {
    resetCamera('flight-sim-3d');
  });

  window.addEventListener('beforeunload', () => {
    if (previewTimer) clearInterval(previewTimer);
  });
}

async function sendSafePose() {
  disableTemporarily(statusElements.safeButton);
  try {
    const response = await fetch(`${API_BASE_URL}/apply_pose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(SAFE_POSE),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!data.valid) {
      throw new Error('Pose inválida recebida do backend');
    }

    safePoseApplied = true;
    showToast('Posição segura aplicada.', 'success');
    statusElements.startButton.disabled = false;
  } catch (error) {
    console.error('Erro ao aplicar pose segura:', error);
    showToast('Falha ao aplicar posição segura.', 'error');
  }
}

async function startFollowing() {
  if (!safePoseApplied) {
    showToast('Envie a posição segura antes de iniciar.', 'warning');
    return;
  }

  disableTemporarily(statusElements.startButton);
  try {
    const response = await fetch(`${API_BASE_URL}/flight-simulation/start`, { method: 'POST' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    setFollowingState(true);
    showToast('Bridge autorizado a aplicar poses.', 'success');
  } catch (error) {
    console.error('Erro ao iniciar simulação:', error);
    showToast('Não foi possível iniciar a simulação.', 'error');
  }
}

async function stopFollowing() {
  disableTemporarily(statusElements.stopButton);
  try {
    const response = await fetch(`${API_BASE_URL}/flight-simulation/stop`, { method: 'POST' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    setFollowingState(false);
    showToast('Bridge bloqueado.', 'info');
  } catch (error) {
    console.error('Erro ao parar simulação:', error);
    showToast('Não foi possível parar a simulação.', 'error');
  }
}

function setFollowingState(enabled) {
  followingEnabled = enabled;
  statusElements.startButton.disabled = enabled || !safePoseApplied;
  statusElements.stopButton.disabled = !enabled;
  statusElements.indicator.textContent = enabled ? 'Seguindo setpoints' : 'Aguardando autorização';
  statusElements.indicator.className = enabled ? 'text-lg font-semibold text-emerald-300' : 'text-lg font-semibold text-red-300';
}

function disableTemporarily(button) {
  if (!button) return;
  button.disabled = true;
  setTimeout(() => {
    button.disabled = false;
  }, 800);
}

async function refreshSimulationStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/flight-simulation/status`);
    if (!response.ok) {
      throw new Error('HTTP error');
    }
    const data = await response.json();
    statusElements.safeZValue.textContent = Number(data.safe_z ?? SAFE_POSE.z).toFixed(0);
    statusElements.updatedAt.textContent = new Date().toLocaleTimeString();
    setFollowingState(Boolean(data.enabled));
    if (data.enabled) {
      safePoseApplied = true;
    }
  } catch (error) {
    console.warn('Não foi possível atualizar status da simulação:', error);
  }
}

function connectTelemetry() {
  if (telemetrySocket) {
    telemetrySocket.close();
    telemetrySocket = null;
  }

  try {
    telemetrySocket = new WebSocket(WS_URL);
  } catch (error) {
    updateTelemetryChip(false);
    scheduleTelemetryReconnect();
    return;
  }

  telemetrySocket.onopen = () => {
    updateTelemetryChip(true);
  };

  telemetrySocket.onclose = () => {
    updateTelemetryChip(false);
    scheduleTelemetryReconnect();
  };

  telemetrySocket.onerror = () => {
    updateTelemetryChip(false);
  };

  telemetrySocket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      const normalized = normalizeTelemetry(payload);
      handleTelemetry(normalized);
    } catch (error) {
      console.error('Erro ao processar telemetria:', error);
    }
  };
}

function scheduleTelemetryReconnect() {
  if (telemetryReconnectTimer) {
    clearTimeout(telemetryReconnectTimer);
  }
  telemetryReconnectTimer = setTimeout(connectTelemetry, 2000);
}

function updateTelemetryChip(connected) {
  if (!statusElements.telemetryChip) return;
  if (connected) {
    statusElements.telemetryChip.className = 'status-chip bg-emerald-600 text-white';
    statusElements.telemetryChip.innerHTML = `<span class="material-icons text-base">wifi</span>Telemetria ativa`;
  } else {
    statusElements.telemetryChip.className = 'status-chip bg-gray-700 text-gray-200';
    statusElements.telemetryChip.innerHTML = `<span class="material-icons text-base">wifi_off</span>Sem telemetria`;
  }
}

function handleTelemetry(data) {
  if (!data || data.type === 'raw') return;

  if (data.pose_live) {
    updatePoseCards(data.pose_live);
  }

  if (data.actuator_lengths_abs && data.actuator_lengths_abs.length === 6) {
    applyLiveTelemetry('flight-sim-3d', data, (_, renderData) => {
      if (renderData && renderData.actuators) {
        updatePistonCards(renderData.actuators);
      }
    });
  }
}

function updatePoseCards(pose) {
  const normalizedPose = {
    roll: Number(pose.roll ?? 0),
    pitch: Number(pose.pitch ?? 0),
    yaw: Number(pose.yaw ?? 0),
    x: Number(pose.x ?? 0),
    y: Number(pose.y ?? 0),
    z: Number(pose.z ?? SAFE_POSE.z),
  };

  poseElements.roll.textContent = normalizedPose.roll.toFixed(2);
  poseElements.pitch.textContent = normalizedPose.pitch.toFixed(2);
  poseElements.yaw.textContent = normalizedPose.yaw.toFixed(2);
  poseElements.x.textContent = normalizedPose.x.toFixed(2);
  poseElements.y.textContent = normalizedPose.y.toFixed(2);
  poseElements.z.textContent = normalizedPose.z.toFixed(2);
}

function updatePistonCards(actuators) {
  if (!Array.isArray(actuators)) {
    return;
  }
  actuators.forEach((act, idx) => {
    const target = pistonElements[idx];
    if (!target) return;
    if (act && typeof act.length === 'number') {
      target.textContent = `${act.length.toFixed(1)} mm`;
    } else {
      target.textContent = '--';
    }
    target.classList.remove('text-emerald-300', 'text-red-400');
    if (act && act.valid === false) {
      target.classList.add('text-red-400');
    } else {
      target.classList.add('text-emerald-300');
    }
  });
}

function startPreviewPolling() {
  fetchPreviewPose();
  previewTimer = setInterval(fetchPreviewPose, PREVIEW_INTERVAL_MS);
}

async function fetchPreviewPose() {
  try {
    const response = await fetch(PREVIEW_URL, { cache: 'no-store' });
    if (!response.ok) {
      if (response.status === 404) {
        return;
      }
      throw new Error(`Preview HTTP ${response.status}`);
    }
    const preview = await response.json();
    if (!preview) {
      return;
    }

    if (preview.pose) {
      updatePoseCards(preview.pose);
    }

    if (preview.timestamp && statusElements.updatedAt) {
      const date = new Date(preview.timestamp * 1000);
      statusElements.updatedAt.textContent = date.toLocaleTimeString();
    }

    draw3DPlatform('flight-sim-3d', preview);
    if (preview.actuators) {
      updatePistonCards(preview.actuators);
    }
  } catch (error) {
    console.warn('Não foi possível obter preview do flight sim:', error);
  }
}

async function renderPosePreview(pose) {
  try {
    const response = await fetch(`${API_BASE_URL}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pose),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    draw3DPlatform('flight-sim-3d', data);
    if (data.pose) {
      updatePoseCards(data.pose);
    }
    if (data.actuators) {
      updatePistonCards(data.actuators);
    }
  } catch (error) {
    console.error('Erro ao renderizar pose inicial:', error);
  }
}
