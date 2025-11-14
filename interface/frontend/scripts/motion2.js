/*
 * CONTROLE POR ACELERÔMETRO MPU-6050 (VERSÃO LEVE - SEM 3D)
 */

const API_BASE = "http://localhost:8001";
const WS_URL = "ws://localhost:8001/ws/telemetry";

// Altura padrão para modo MPU (530 para posição neutra)
const DEFAULT_Z_HEIGHT = 530;

// OTIMIZAÇÃO: Variáveis globais para throttle
const WS_UPDATE_INTERVAL = 33; // ~30 FPS
const CONTROL_UPDATE_INTERVAL = 100; // ~10 Hz para comandos
let lastWSUpdate = 0;
let lastControlUpdate = 0;

let ws = null;
let wsTimer = null;
let controlEnabled = false;
let scale = 1.0; // Escala de sensibilidade (0.0 a 2.0)
let lastMPUData = null;
let updateCount = 0;
let lastRateCheck = Date.now();
let serialConnected = false;
let currentPlatformData = null;

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

// ========== Conexão Serial ==========
async function loadSerialPorts() {
  const sel = document.getElementById("serial-port-select");
  try {
    const resp = await fetch(`${API_BASE}/serial/ports`);
    if (!resp.ok) throw new Error(`Erro ${resp.status}: ${resp.statusText}`);
    const data = await resp.json();
    const ports = Array.isArray(data.ports) ? data.ports : [];
    sel.innerHTML = '<option value="">Selecione uma porta...</option>';
    ports.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      sel.appendChild(opt);
    });
  } catch (e) {
    console.error("Erro ao listar portas:", e);
    sel.innerHTML = '<option value="">Erro ao carregar</option>';
  }
}

async function updateConnectionStatus() {
  try {
    const res = await fetch(`${API_BASE}/serial/status`);
    const status = await res.json();

    const indicator = document.getElementById("status-indicator");
    const text = document.getElementById("status-text");
    const portSpan = document.getElementById("status-port");

    serialConnected = status.connected;

    if (status.connected) {
      indicator.className = "w-3 h-3 rounded-full bg-green-500 pulse-dot";
      text.textContent = "Conectado";
      text.className = "text-green-500 font-medium";
      portSpan.textContent = status.port || "--";
    } else {
      indicator.className = "w-3 h-3 rounded-full bg-gray-500";
      text.textContent = "Desconectado";
      text.className = "text-gray-400 font-medium";
      portSpan.textContent = "--";
    }
  } catch (err) {
    console.error("Erro ao verificar status:", err);
  }
}

async function openSerial() {
  const port = document.getElementById("serial-port-select").value;
  if (!port) {
    showToast("Selecione uma porta serial", "warning");
    return;
  }
  try {
    const resp = await fetch(`${API_BASE}/serial/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port, baud: 115200 }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.detail || `Erro ${resp.status}`);

    serialConnected = true;
    document.getElementById("status-indicator").className =
      "w-3 h-3 rounded-full bg-green-500 pulse-dot";
    document.getElementById("status-text").textContent = "Conectado";
    document.getElementById("status-text").className =
      "text-green-500 font-medium";
    document.getElementById("status-port").textContent = port;
    document.getElementById("btn-open-serial").classList.add("hidden");
    document.getElementById("btn-close-serial").classList.remove("hidden");

    showToast("Conexão estabelecida!", "success");

    // Conecta ao WebSocket
    initTelemetryWS();

    // Aplicar posição inicial neutra (530mm) ao conectar
    console.log("🚀 Aplicando posição inicial neutra (Z=530mm)...");
    try {
      const res = await fetch(`${API_BASE}/mpu/control`, {
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

      if (res.ok) {
        const data = await res.json();
        console.log("✅ Posição inicial aplicada:", data);
        showToast("✅ Plataforma em posição neutra (530mm)", "success");

        // Atualizar visualização com os dados retornados
        if (data.lengths_abs) {
          const actuators = data.lengths_abs.map((len, i) => ({
            length_abs: len,
            setpoint_mm: data.setpoints_mm[i],
            valid: true,
          }));
          updatePistonMeasures(actuators);
        }
      } else {
        console.error("❌ Erro ao aplicar posição inicial:", res.status);
      }
    } catch (e) {
      console.error("❌ Erro ao enviar posição inicial:", e);
    }
  } catch (e) {
    showToast(`Erro ao conectar: ${e.message}`, "error");
  }
}

async function closeSerial() {
  try {
    const resp = await fetch(`${API_BASE}/serial/close`, {
      method: "POST",
    });
    if (!resp.ok) throw new Error("Erro ao desconectar");

    serialConnected = false;
    document.getElementById("status-indicator").className =
      "w-3 h-3 rounded-full bg-gray-500";
    document.getElementById("status-text").textContent = "Desconectado";
    document.getElementById("status-text").className =
      "text-gray-400 font-medium";
    document.getElementById("status-port").textContent = "---";
    document.getElementById("btn-open-serial").classList.remove("hidden");
    document.getElementById("btn-close-serial").classList.add("hidden");

    showToast("Conexão encerrada", "info");

    // Fecha o WebSocket e cancela reconexão
    if (wsTimer) {
      clearTimeout(wsTimer);
      wsTimer = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
  } catch (e) {
    showToast(`Erro ao desconectar: ${e.message}`, "error");
  }
}

// ========== Atualização de Medidas dos Pistões ==========
function updatePistonMeasures(actuators) {
  console.log("📏 Atualizando medidas:", actuators);
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

// ========== Cálculo de Cinemática (sem visualização 3D) ==========
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

    // Criar pose a partir dos ângulos FINAIS (limitados após escala)
    const pose = {
      x: 0,
      y: 0,
      z: DEFAULT_Z_HEIGHT, // 530mm - altura padrão para modo MPU
      roll: finalAngles.roll,
      pitch: finalAngles.pitch,
      yaw: finalAngles.yaw,
    };

    // Chamar backend para calcular comprimentos
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

    // Validar dados recebidos
    if (!data.actuators) {
      console.error("❌ Dados incompletos da API");
      throw new Error("Dados incompletos da API");
    }

    currentPlatformData = data;

    // Atualizar medidas dos pistões
    updatePistonMeasures(data.actuators);

    return data;
  } catch (e) {
    console.error("Erro ao calcular cinemática:", e);
    return null;
  }
}

async function sendMPUControl(mpu) {
  console.log(
    "🔧 sendMPUControl chamado - controlEnabled:",
    controlEnabled,
    "mpu:",
    mpu,
    "serialConnected:",
    serialConnected
  );

  if (!controlEnabled || !mpu) {
    console.warn(
      "⏸️ Saindo early - controlEnabled:",
      controlEnabled,
      "mpu:",
      !!mpu
    );
    return;
  }

  // Verificar se está conectado à serial
  if (!serialConnected) {
    console.warn(
      "⚠️ Controle MPU ativo mas serial NÃO conectada - comandos não serão aplicados"
    );
    return;
  }

  const now = performance.now();
  if (now - lastControlUpdate < CONTROL_UPDATE_INTERVAL) {
    console.log("⏱️ Throttle ativo - aguardando intervalo");
    return;
  }
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

      if (data.applied && data.lengths_abs) {
        // Atualizar medidas com os dados retornados
        const actuators = data.lengths_abs.map((len, i) => ({
          length_abs: len,
          setpoint_mm: data.setpoints_mm[i],
          valid: true,
        }));
        updatePistonMeasures(actuators);
      }
    }
  } catch (e) {
    console.error("Erro ao enviar controle MPU:", e);
  }
}

// ========== WebSocket ==========
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

      console.log("📨 WebSocket recebeu mensagem:", msg.type);

      // Detectar mensagens com dados MPU
      if (msg.type === "telemetry_mpu" && msg.mpu) {
        lastMPUData = msg.mpu;

        console.log(
          "🎯 Dados MPU:",
          msg.mpu,
          "Controle ativo:",
          controlEnabled
        );

        // Atualizar display sempre (é rápido)
        updateMPUDisplay(msg.mpu);

        // Calcular cinemática (sem 3D, apenas medidas)
        calculateKinematicsFromMPU(msg.mpu);

        // Se controle ativo, enviar comandos para ESP32
        if (controlEnabled) {
          console.log("🚀 Controle ATIVO - enviando comando para hardware");
          sendMPUControl(msg.mpu);
        } else {
          console.log("⏸️ Controle INATIVO - apenas preview");
        }
        return;
      } else {
        console.log("⚠️ Mensagem não é telemetry_mpu:", msg.type);
      }
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
          if (data.lengths_abs) {
            const actuators = data.lengths_abs.map((len, i) => ({
              length_abs: len,
              setpoint_mm: data.setpoints_mm[i],
              valid: true,
            }));
            updatePistonMeasures(actuators);
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
  console.log("🚀 Iniciando aplicação MPU-6050 (versão leve)...");

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

  // Atualizar status periodicamente
  setInterval(updateConnectionStatus, 2000);

  // Botões de serial
  document
    .getElementById("btn-refresh-ports")
    .addEventListener("click", loadSerialPorts);
  document
    .getElementById("btn-open-serial")
    .addEventListener("click", openSerial);
  document
    .getElementById("btn-close-serial")
    .addEventListener("click", closeSerial);

  // Botão de recalibração
  document
    .getElementById("btn-recalibrate")
    .addEventListener("click", recalibrateMPU);

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

  showToast("🚀 Sistema MPU-6050 pronto (versão leve)", "success");
});
