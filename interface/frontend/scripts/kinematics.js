// ========== Variáveis Globais ==========
// API_BASE, WS_URL, serialConnected, ws, wsTimer vêm de common.js
// BASE_POINTS_FIXED vem de telemetry-utils.js
let currentPlatformData = null;

// ========== Sincronização de Inputs ==========
function setupInputSync() {
  const pairs = [
    ["x-pos", "x-slider"],
    ["y-pos", "y-slider"],
    ["z-pos", "z-slider"],
    ["roll", "roll-slider"],
    ["pitch", "pitch-slider"],
    ["yaw", "yaw-slider"],
  ];

  pairs.forEach(([inputId, sliderId]) => {
    const input = document.getElementById(inputId);
    const slider = document.getElementById(sliderId);

    // Apenas sincroniza valores, NÃO calcula automaticamente
    input.addEventListener("input", () => {
      slider.value = input.value;
    });

    slider.addEventListener("input", () => {
      input.value = slider.value;
    });
  });
}

// ========== Obter Pose da UI ==========
function getPoseFromUI() {
  return {
    x: parseFloat(document.getElementById("x-pos").value),
    y: parseFloat(document.getElementById("y-pos").value),
    z: parseFloat(document.getElementById("z-pos").value),
    roll: parseFloat(document.getElementById("roll").value),
    pitch: parseFloat(document.getElementById("pitch").value),
    yaw: parseFloat(document.getElementById("yaw").value),
  };
}

// ========== Atualizar Medidas Preview (específico desta página) ==========
function updatePreviewMeasures(actuators) {
  (actuators || []).forEach((a, index) => {
    const el = document.getElementById(`preview-piston-${index + 1}`);
    if (el) {
      el.textContent = Number(a.length).toFixed(1) + " mm";
      el.style.color = a.valid ? "#10b981" : "#ef4444";
    }
  });
}

// ========== Atualizar Medidas Live (específico desta página) ==========
function updateLiveMeasures(actuators) {
  (actuators || []).forEach((a, index) => {
    const el = document.getElementById(`live-piston-${index + 1}`);
    if (el) {
      el.textContent = Number(a.length).toFixed(1) + " mm";
      el.style.color = a.valid ? "#10b981" : "#ef4444";
    }
  });
}

// ========== Atualizar Dados do MPU-6050 ==========
function updateMPUData(mpuData, quaternions) {
  if (!mpuData) return;

  const mpuSection = document.getElementById('mpu-data-section');
  const rollEl = document.getElementById('mpu-roll');
  const pitchEl = document.getElementById('mpu-pitch');
  const yawEl = document.getElementById('mpu-yaw');
  const quatDisplay = document.getElementById('quaternion-display');
  const quatText = document.getElementById('quat-text');

  if (mpuSection && rollEl && pitchEl && yawEl) {
    // Exibir seção se estava oculta
    mpuSection.classList.remove('hidden');

    // Atualizar valores com 2 casas decimais
    rollEl.textContent = Number(mpuData.roll).toFixed(2);
    pitchEl.textContent = Number(mpuData.pitch).toFixed(2);
    yawEl.textContent = Number(mpuData.yaw).toFixed(2);

    // Atualizar quaternion se disponível (BNO085)
    if (quaternions && quatDisplay && quatText) {
      // Formatar quaternion como: a + bi + cj + dk
      const w = Number(quaternions.w).toFixed(4);
      const x = Number(quaternions.x).toFixed(4);
      const y = Number(quaternions.y).toFixed(4);
      const z = Number(quaternions.z).toFixed(4);

      // Formatar com sinais corretos
      const formatComponent = (value, symbol) => {
        const num = parseFloat(value);
        if (num >= 0) return `+ ${value}${symbol}`;
        return `${value}${symbol}`; // Já tem o sinal negativo
      };

      const quatStr = `q = ${w} ${formatComponent(x, 'i')} ${formatComponent(y, 'j')} ${formatComponent(z, 'k')}`;
      quatText.textContent = quatStr;
      quatDisplay.style.display = 'flex';
    } else if (quatDisplay) {
      quatDisplay.style.display = 'none';
    }
  }
}

// ========== Recalibrar MPU-6050 ==========
async function recalibrateMPU() {
  if (!serialConnected) {
    showToast('Conecte-se primeiro à porta serial', 'warning');
    return;
  }

  const btn = document.getElementById('btn-mpu-recalibrate');
  const originalText = btn.innerHTML;

  try {
    // Feedback visual
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons animate-spin" style="font-size: 0.875rem">refresh</span><span>Calibrando...</span>';

    showToast('📡 Enviando comando de recalibração...', 'info');

    // Envia comando "recalibra" via serial (envia comando ESP-NOW para o MPU)
    const response = await fetch(`${API_BASE}/serial/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'recalibra' }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error?.detail || `Erro ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ Comando de recalibração enviado:', result);
    showToast('✅ Comando "recalibra" enviado ao ESP32!', 'success');
  } catch (error) {
    console.error('❌ Erro ao recalibrar MPU:', error);
    showToast(`❌ Erro ao recalibrar: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

// ========== Calcular Posição ==========
async function calculatePosition() {
  const loading = document.getElementById('loading');
  const errBox = document.getElementById('error-message');

  try {
    loading.style.display = 'block';
    errBox.style.display = 'none';

    const pose = getPoseFromUI();
    const resp = await fetch(`${API_BASE}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pose),
    });

    if (!resp.ok) throw new Error(`Erro ${resp.status}: ${resp.statusText}`);

    const data = await resp.json();
    currentPlatformData = data;

    // Atualizar preview usando three-utils.js
    updatePreviewMeasures(data.actuators);
    draw3DPlatform('canvas-preview', data);

    // Mostrar/ocultar botão de aplicar
    const applyBtn = document.getElementById('btn-apply');
    const applyErr = document.getElementById('apply-error');
    applyErr.style.display = 'none';

    if (data.valid) {
      applyBtn.style.display = 'block';
      showToast('Posição válida calculada', 'success');
    } else {
      applyBtn.style.display = 'none';
      showToast('Posição inválida para a plataforma', 'error');
    }
  } catch (e) {
    console.error(e);
    errBox.textContent = `Erro: ${e.message}`;
    errBox.style.display = 'block';
  } finally {
    loading.style.display = 'none';
  }
}

// ========== Resetar Posição ==========
function resetPosition() {
  document.getElementById('x-pos').value = 0;
  document.getElementById('y-pos').value = 0;
  document.getElementById('z-pos').value = 500;
  document.getElementById('roll').value = 0;
  document.getElementById('pitch').value = 0;
  document.getElementById('yaw').value = 0;
  document.getElementById('x-slider').value = 0;
  document.getElementById('y-slider').value = 0;
  document.getElementById('z-slider').value = 500;
  document.getElementById('roll-slider').value = 0;
  document.getElementById('pitch-slider').value = 0;
  document.getElementById('yaw-slider').value = 0;
  calculatePosition();
}

// ========== Aplicar na Bancada ==========
async function applyToBench() {
  const applyBtn = document.getElementById('btn-apply');
  const applyErr = document.getElementById('apply-error');
  const originalText = applyBtn.textContent;

  try {
    applyBtn.disabled = true;
    applyBtn.textContent = '⏳ Aplicando...';
    applyErr.style.display = 'none';

    if (!currentPlatformData || !currentPlatformData.valid) {
      throw new Error('Calcule uma posição válida primeiro');
    }

    const pose = currentPlatformData.pose;
    console.log('🚀 Aplicando pose na bancada:', pose);

    const resp = await fetch(`${API_BASE}/apply_pose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pose),
    });

    if (!resp.ok) {
      const errorData = await resp.json();
      throw new Error(errorData.detail || `Erro ${resp.status}`);
    }

    const data = await resp.json();
    console.log('✅ Resposta do backend:', data);

    if (data.applied) {
      console.log('✓ Setpoints aplicados:', data.setpoints_mm);
      applyBtn.textContent = '✓ Aplicado!';
      showToast('Pose aplicada com sucesso!', 'success');
      setTimeout(() => {
        applyBtn.textContent = originalText;
        applyBtn.disabled = false;
      }, 2000);
    } else {
      throw new Error(data.message || 'Falha ao aplicar pose');
    }
  } catch (e) {
    console.error(e);
    applyErr.textContent = `Erro ao aplicar: ${e.message}`;
    applyErr.style.display = 'block';
    applyBtn.textContent = originalText;
    applyBtn.disabled = false;
    showToast(`Erro: ${e.message}`, 'error');
  }
}

// ========== Funções de Controle Serial ==========
async function updateConnectionStatus() {
  try {
    const res = await fetch(`${API_BASE}/serial/status`);
    const status = await res.json();

    const indicator = document.getElementById('status-indicator');
    const text = document.getElementById('status-text');
    const portSpan = document.getElementById('status-port');

    if (status.connected && status.port) {
      indicator.className = 'w-3 h-3 rounded-full bg-green-500 pulse-dot';
      text.textContent = 'Conectado';
      portSpan.textContent = status.port;
    } else {
      indicator.className = 'w-3 h-3 rounded-full bg-red-500';
      text.textContent = 'Desconectado';
      portSpan.textContent = '--';
    }
  } catch (err) {
    console.error('Erro ao verificar status:', err);
  }
}

// ========== Status de Conexão Serial (usa funções do common.js) ==========
function setSerialStatus(connected, port = '') {
  serialConnected = connected;
  const indicator = document.getElementById('status-indicator');
  const text = document.getElementById('status-text');
  const portSpan = document.getElementById('status-port');
  const btnConnect = document.getElementById('btn-open-serial');
  const btnDisconnect = document.getElementById('btn-close-serial');

  if (connected) {
    indicator.className = 'w-3 h-3 rounded-full bg-green-500 pulse-dot';
    text.textContent = 'Conectado';
    portSpan.textContent = port;
    btnConnect.classList.add('hidden');
    btnDisconnect.classList.remove('hidden');
  } else {
    indicator.className = 'w-3 h-3 rounded-full bg-red-500';
    text.textContent = 'Desconectado';
    portSpan.textContent = '--';
    btnConnect.classList.remove('hidden');
    btnDisconnect.classList.add('hidden');
  }
}

// ========== WebSocket para Telemetria Ao Vivo ==========
// normalizeTelemetry(), reconstructPlatformPoints(), applyLiveTelemetry() vêm de telemetry-utils.js
let lastWSUpdate = 0;
let lastWSMessage = null;
const WS_UPDATE_INTERVAL = 33; // ~30 FPS

function initLocalTelemetryWS() {
  console.log('🔌 Inicializando WebSocket local...');

  if (ws) {
    try {
      ws.close();
    } catch (_) {}
    ws = null;
  }

  try {
    ws = new WebSocket(WS_URL);
    console.log('🔌 WebSocket criado:', WS_URL);
  } catch (e) {
    console.error('❌ Erro ao criar WebSocket:', e);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log('✅ WebSocket conectado (kinematics)');
    if (wsTimer) clearTimeout(wsTimer);
  };

  ws.onclose = () => {
    console.log('❌ WebSocket desconectado');
    scheduleReconnect();
  };

  ws.onerror = (e) => {
    console.error('❌ WebSocket error:', e);
  };

  ws.onmessage = (evt) => {
    const now = performance.now();

    if (now - lastWSUpdate < WS_UPDATE_INTERVAL) {
      lastWSMessage = evt.data;
      return;
    }

    lastWSUpdate = now;

    const dataToProcess = lastWSMessage || evt.data;
    lastWSMessage = null;

    try {
      const msg = JSON.parse(dataToProcess);
      console.log('📨 Mensagem WS recebida (kinematics):', {
        type: msg.type,
        hasMPU: !!msg.mpu,
        hasQuaternions: !!msg.quaternions,
        format: msg.format,
      });

      // Se vier motion_tick com pose_cmd, apenas atualiza Preview
      if (msg.type === 'motion_tick' && msg.pose_cmd) {
        updateVisualizationFromMotion(msg.pose_cmd);
        return;
      }

      // Telemetria normal
      const data = normalizeTelemetry(msg);
      console.log('📊 Dados normalizados (kinematics):', {
        type: data.type,
        hasActuators: !!data.actuators,
        hasMPU: !!data.mpu,
      });

      // Atualizar dados do MPU se disponível
      if (data.mpu) {
        console.log('🎯 Atualizando MPU data:', data.mpu, 'Quaternions:', msg.quaternions);
        updateMPUData(data.mpu, msg.quaternions);
      }

      // Usar função do telemetry-utils.js para aplicar no 3D
      applyLiveTelemetry('canvas-live', data, (normalizedData, renderData) => {
        // Callback: atualizar medidas dos pistões
        if (renderData && renderData.actuators) {
          updateLiveMeasures(renderData.actuators);
        }
      });
    } catch (e) {
      console.error('❌ Erro ao processar mensagem WS:', e, dataToProcess);
    }
  };

  window.ws = ws;
}

function scheduleReconnect() {
  if (wsTimer) clearTimeout(wsTimer);
  wsTimer = setTimeout(() => {
    if (serialConnected) {
      initLocalTelemetryWS();
    }
  }, 1000);
}

// Atualiza Preview com pose de rotina (somente visual)
let motionUpdatePending = false;
let lastMotionPose = null;

async function updateVisualizationFromMotion(pose_cmd) {
  lastMotionPose = pose_cmd;
  if (motionUpdatePending) return;
  motionUpdatePending = true;

  try {
    const response = await fetch(`${API_BASE}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lastMotionPose),
    });

    if (!response.ok) {
      motionUpdatePending = false;
      return;
    }

    const calcData = await response.json();

    if (calcData.base_points && calcData.platform_points && calcData.actuators) {
      draw3DPlatform('canvas-preview', calcData);
    }
  } catch (error) {
    console.error('❌ Erro ao atualizar visualização de motion:', error);
  } finally {
    setTimeout(() => {
      motionUpdatePending = false;
    }, 33);
  }
}

async function checkExistingConnection() {
  try {
    const res = await fetch(`${API_BASE}/serial/status`);
    const status = await res.json();

    if (status.connected && status.port) {
      serialConnected = true;
      setSerialStatus(true, status.port);

      const select = document.getElementById('serial-port-select');
      if (![...select.options].some((opt) => opt.value === status.port)) {
        const opt = document.createElement('option');
        opt.value = status.port;
        opt.textContent = status.port;
        opt.selected = true;
        select.appendChild(opt);
      } else {
        select.value = status.port;
      }

      initLocalTelemetryWS();
    }
  } catch (err) {
    console.error('⚠️ Erro ao verificar status:', err);
  }
}

// ========== Inicialização ==========
window.addEventListener('DOMContentLoaded', async () => {
  console.log('🎬 Inicializando Cinemática...');

  // Sincronizar inputs
  setupInputSync();

  // Inicializar cenas 3D (usando three-utils.js)
  init3D('canvas-preview');
  init3D('canvas-live');

  // Inicializa controles seriais comuns (event listeners + CSS da fonte)
  initCommonSerialControls();

  // Conectar botão de aplicar
  document.getElementById('btn-apply').addEventListener('click', applyToBench);

  // Conectar botão de recalibração do MPU
  document.getElementById('btn-mpu-recalibrate').addEventListener('click', recalibrateMPU);

  // Calcular posição inicial
  calculatePosition();

  console.log('✅ Cinemática inicializada');
});
