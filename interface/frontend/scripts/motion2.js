/*
 * CONTROLE POR ACELERÔMETRO MPU-6050 (VERSÃO LEVE - SEM 3D)
 *
 * Variáveis globais importadas de common.js:
 * - API_BASE, WS_URL, serialConnected, ws, wsTimer
 */

// Altura padrão para modo MPU (530 para posição neutra)
const DEFAULT_Z_HEIGHT = 530;

// OTIMIZAÇÃO: Variáveis globais para throttle
const WS_UPDATE_INTERVAL = 33; // ~30 FPS
const CONTROL_UPDATE_INTERVAL = 100; // ~10 Hz para comandos
let lastWSUpdate = 0;
let lastControlUpdate = 0;

// Variáveis específicas desta página
let controlEnabled = false;
let scale = 1.0; // Escala de sensibilidade (0.0 a 2.0)
let lastMPUData = null;
let updateCount = 0;
let lastRateCheck = Date.now();
let currentPlatformData = null;

// ========== Funções Compartilhadas ==========
// As seguintes funções/variáveis vêm de common.js:
// - API_BASE, WS_URL, serialConnected, ws, wsTimer
// - showToast(), loadSerialPorts(), openSerial(), closeSerial()
// - initCommonSerialControls(), setSerialStatus()

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

  // Clampar valores entre -10 e +10 (tanto para display quanto para barras)
  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
  const formattedRoll = clamp(mpu.roll, -5, 5);
  const formattedPitch = clamp(mpu.pitch, -5, 5);
  const formattedYaw = clamp(mpu.yaw, -5, 5);

  // Atualizar valores numéricos (mostra valores LIMITADOS para ±10°)
  document.getElementById("mpu-roll").textContent = `${formattedRoll.toFixed(
    1
  )}°`;
  document.getElementById("mpu-pitch").textContent = `${formattedPitch.toFixed(
    1
  )}°`;
  document.getElementById("mpu-yaw").textContent = `${formattedYaw.toFixed(
    1
  )}°`;

  // Atualizar barras de progresso (-5 a +5 graus = 0% a 100%)
  const rollPercent = ((formattedRoll + 5) / 10) * 100;
  const pitchPercent = ((formattedPitch + 5) / 10) * 100;
  const yawPercent = ((formattedYaw + 5) / 10) * 100;

  document.getElementById("mpu-roll-bar").style.width = `${rollPercent}%`;
  document.getElementById("mpu-pitch-bar").style.width = `${pitchPercent}%`;
  document.getElementById("mpu-yaw-bar").style.width = `${yawPercent}%`;
}

function updateQuaternionDisplay(quaternions) {
  if (!quaternions) {
    // Ocultar seção se não houver quaternions
    document.getElementById("quaternion-section").classList.add("hidden");
    return;
  }

  // Mostrar seção de quaternions
  document.getElementById("quaternion-section").classList.remove("hidden");

  // Atualizar valores
  document.getElementById("quat-w").textContent = quaternions.w.toFixed(4);
  document.getElementById("quat-x").textContent = quaternions.x.toFixed(4);
  document.getElementById("quat-y").textContent = quaternions.y.toFixed(4);
  document.getElementById("quat-z").textContent = quaternions.z.toFixed(4);
}

// ========== Limitação de Ângulos ==========
function limitAngles(roll, pitch, yaw) {
  const original = { roll, pitch, yaw };

  // Limitar roll entre -5 e +5
  if (roll > 5) roll = 5;
  else if (roll < -5) roll = -5;

  // Limitar pitch entre -5 e +5
  if (pitch > 5) pitch = 5;
  else if (pitch < -5) pitch = -5;

  // Limitar yaw entre -5° e +5°
  if (yaw > 5) yaw = 5;
  else if (yaw < -5) yaw = -5;
  const limited = { roll, pitch, yaw };

  // Log apenas se houver limitação
  if (
    original.roll !== roll ||
    original.pitch !== pitch ||
    original.yaw !== yaw
  ) {
    console.log("⚠️ ÂNGULOS LIMITADOS:");
    console.log(
      `   Original: R=${original.roll.toFixed(1)}° P=${original.pitch.toFixed(
        1
      )}° Y=${original.yaw.toFixed(1)}°`
    );
    console.log(
      `   Limitado: R=${limited.roll.toFixed(1)}° P=${limited.pitch.toFixed(
        1
      )}° Y=${limited.yaw.toFixed(1)}°`
    );
  }

  return limited;
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
    console.log(
      `🔢 Ângulos originais do MPU: R=${mpu.roll.toFixed(
        1
      )}° P=${mpu.pitch.toFixed(1)}° Y=${mpu.yaw.toFixed(1)}°`
    );
    const limitedMPU = limitAngles(mpu.roll, mpu.pitch, mpu.yaw);

    // SEGUNDO: Aplicar escala
    let scaledAngles = {
      roll: limitedMPU.roll * scale,
      pitch: limitedMPU.pitch * scale,
      yaw: limitedMPU.yaw * scale,
    };
    console.log(
      `📏 Após aplicar escala ${(scale * 100).toFixed(
        0
      )}%: R=${scaledAngles.roll.toFixed(1)}° P=${scaledAngles.pitch.toFixed(
        1
      )}° Y=${scaledAngles.yaw.toFixed(1)}°`
    );

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
let heartbeatTimer = null;
let lastMessageTime = 0;

function initTelemetryWS() {
  // Limpar timers anteriores
  if (wsTimer) clearTimeout(wsTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);

  if (ws) {
    try {
      ws.onclose = null; // Remover handler para evitar reconexão duplicada
      ws.close();
    } catch (_) {}
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
    console.log("✅ WebSocket conectado (motion2)");
    if (wsTimer) clearTimeout(wsTimer);
    lastMessageTime = Date.now();

    // ✅ Heartbeat: verifica se está recebendo mensagens
    heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const timeSinceLastMessage = now - lastMessageTime;

      if (timeSinceLastMessage > 5000 && serialConnected) {
        console.warn(
          "⚠️ WebSocket sem mensagens há",
          Math.round(timeSinceLastMessage / 1000),
          "s - reconectando..."
        );
        initTelemetryWS();
      }
    }, 3000);
  };

  ws.onclose = () => {
    console.log("❌ WebSocket desconectado");
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    scheduleReconnect();
  };

  ws.onerror = (e) => {
    console.error("Erro no WebSocket:", e);
  };

  ws.onmessage = (evt) => {
    lastMessageTime = Date.now();

    try {
      const msg = JSON.parse(evt.data);

      console.log("📨 WebSocket recebeu:", {
        type: msg.type,
        hasMPU: !!msg.mpu,
        hasQuaternions: !!msg.quaternions,
        format: msg.format,
      });

      // Detectar mensagens com dados MPU ou BNO085
      if (
        (msg.type === "telemetry_mpu" || msg.type === "telemetry_bno085") &&
        msg.mpu
      ) {
        lastMPUData = msg.mpu;

        console.log("🎯 Dados de orientação:", {
          roll: msg.mpu.roll,
          pitch: msg.mpu.pitch,
          yaw: msg.mpu.yaw,
          format: msg.format,
          hasQuaternions: !!msg.quaternions,
        });

        // Atualizar display sempre (é rápido)
        updateMPUDisplay(msg.mpu);

        // Atualizar quaternions se disponíveis (BNO085)
        if (msg.quaternions) {
          console.log("🔄 Quaternions:", msg.quaternions);
          updateQuaternionDisplay(msg.quaternions);
        } else {
          console.log("⚪ Sem quaternions - ocultando seção");
          updateQuaternionDisplay(null); // Oculta seção
        }

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
        console.log("⚠️ Mensagem não é telemetria de orientação:", msg.type);
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

  // Inicializa controles seriais comuns (event listeners + CSS da fonte)
  initCommonSerialControls();

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

  // ✅ IMPORTANTE: Sobrescrever função global para usar a versão local desta página
  window.initTelemetryWS = initTelemetryWS;
  console.log("🔧 initTelemetryWS sobrescrito com versão local de motion2.js");

  showToast("Sistema Acelerômetro pronto", "success");
});
