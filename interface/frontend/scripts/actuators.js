// ========== Variáveis Locais ==========
let reconnectTimer = null;
let heartbeatTimer = null;
let lastMessageTime = 0;

// ✅ SOBRESCREVER IMEDIATAMENTE (antes de DOMContentLoaded)
// Isso garante que quando common.js chamar checkExistingConnection(),
// ele usará a versão local do WebSocket
if (typeof window !== "undefined") {
  // A função será definida abaixo, então fazemos um wrapper
  window.initTelemetryWS = function () {
    if (typeof initLocalTelemetryWS === "function") {
      initLocalTelemetryWS();
    }
  };
}

// ========== WebSocket ==========
function initLocalTelemetryWS() {
  console.log("🔌 Iniciando WebSocket local para telemetria...");

  // Limpar timers anteriores
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);

  // Fechar WebSocket anterior se existir
  if (window.ws) {
    try {
      window.ws.onclose = null; // Remover handler para evitar reconexão duplicada
      window.ws.close();
    } catch (e) {
      console.warn("⚠️ Erro ao fechar WebSocket anterior:", e);
    }
  }

  try {
    window.ws = new WebSocket(window.WS_URL);
    console.log("🔌 WebSocket URL:", window.WS_URL);
  } catch (e) {
    console.error("❌ Erro ao criar WebSocket:", e);
    scheduleReconnect();
    return;
  }

  window.ws.onopen = () => {
    console.log("✅ WebSocket conectado!");
    logConsole("WebSocket conectado", "info");
    clearTimeout(reconnectTimer);
    lastMessageTime = Date.now();

    // ✅ Heartbeat: verifica se está recebendo mensagens
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const timeSinceLastMessage = now - lastMessageTime;

      // Se não recebeu mensagem há mais de 5 segundos E está conectado à serial
      if (timeSinceLastMessage > 5000 && window.serialConnected) {
        console.warn(
          "⚠️ WebSocket sem mensagens há",
          Math.round(timeSinceLastMessage / 1000),
          "s - reconectando..."
        );
        initLocalTelemetryWS(); // Reconectar
      }
    }, 3000); // Verifica a cada 3 segundos
  };

  window.ws.onmessage = (event) => {
    lastMessageTime = Date.now();

    try {
      const data = JSON.parse(event.data);
      handleTelemetry(data);
    } catch (err) {
      console.error("❌ Erro ao processar mensagem WS:", err);
      console.error("📝 Dados brutos:", event.data);
      // NÃO reconecta por erro de parse - pode ser mensagem temporária inválida
    }
  };

  window.ws.onerror = (err) => {
    console.error("❌ WebSocket error:", err);
    // Não reconecta aqui - onclose será chamado automaticamente
  };

  window.ws.onclose = (event) => {
    console.log("🔌 WebSocket desconectado", event.code, event.reason);
    logConsole("WebSocket desconectado", "info");

    // Limpar heartbeat
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }

    // Reconectar se serial ainda está conectada
    if (window.serialConnected) {
      scheduleReconnect();
    }
  };
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);

  console.log("🔄 Reconectando WebSocket em 2s...");
  reconnectTimer = setTimeout(() => {
    if (window.serialConnected) {
      initLocalTelemetryWS();
    }
  }, 2000);
}

function handleTelemetry(data) {
  // ✅ CRÍTICO: Sempre processar telemetria, independente do tipo
  // O backend pode alternar entre 'telemetry', 'telemetry_mpu', 'telemetry_bno085'

  if (data.type === "raw") {
    logConsole(data.raw, "rx");
    return; // Raw não tem dados de telemetria
  }

  // ✅ Processar QUALQUER tipo de telemetria que tenha dados Y
  if (data.Y && Array.isArray(data.Y) && data.Y.length === 6) {
    console.log("✅ Processando telemetria:", {
      type: data.type,
      Y: data.Y.map((v) => v.toFixed(1)),
      sp_mm: data.sp_mm?.toFixed(1),
    });

    try {
      // Atualiza telemetria UI
      document.getElementById("telem-sp").textContent =
        data.sp_mm?.toFixed(2) || "--";
      for (let i = 0; i < 6; i++) {
        document.getElementById(`telem-y${i + 1}`).textContent =
          data.Y[i]?.toFixed(2) || "--";
        document.getElementById(`telem-pwm${i + 1}`).textContent =
          data.PWM?.[i]?.toFixed(0) || "--";
      }

      // Atualiza gráfico (função de chart-utils.js)
      if (typeof updateChart === "function") {
        updateChart(data);
      } else {
        console.error("❌ updateChart não está definido!");
      }
    } catch (err) {
      console.error("❌ Erro ao atualizar UI:", err);
    }
  } else {
    // Log apenas se não for mensagem esperada
    if (data.type !== "motion_tick") {
      console.log("ℹ️ Mensagem WebSocket ignorada:", {
        type: data.type,
        hasY: !!data.Y,
        Y_length: data.Y?.length,
      });
    }
  }
}

// ========== Serial Functions (adaptadas de common.js) ==========
// ========== Funções Locais ==========
async function refreshPorts() {
  await loadSerialPorts(); // Usa função do common.js
}

async function connectSerial() {
  await openSerial(); // Usa função do common.js
}

async function disconnectSerial() {
  await closeSerial(); // Usa função do common.js
}

// ========== Commands ==========
async function sendCommand(cmd) {
  if (!window.serialConnected) {
    showToast("Conecte à porta serial primeiro", "warning");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/serial/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: cmd }),
    });
    const data = await res.json();
    if (res.ok) {
      logConsole(cmd, "tx");
    } else {
      throw new Error(data.detail || "Erro ao enviar");
    }
  } catch (err) {
    logConsole(`Erro: ${err.message}`, "info");
  }
}

function sendFreeCommand() {
  const cmd = document.getElementById("free-command").value.trim();
  if (!cmd) return;
  sendCommand(cmd);
  document.getElementById("free-command").value = "";
}

// ========== Setpoints ==========
async function sendSetpointGlobal() {
  const value = parseFloat(document.getElementById("sp-global").value);
  try {
    const res = await fetch(`${API_BASE}/pid/setpoint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ piston: null, value }),
    });
    const data = await res.json();
    if (res.ok) {
      updateSetpoint(null, value); // Atualiza tracking (chart-utils.js)
      logConsole(`Setpoint global: ${value} mm`, "tx");
      showToast(`Setpoint global aplicado: ${value} mm`, "success");
    }
  } catch (err) {
    logConsole(`Erro: ${err.message}`, "info");
  }
}

async function sendSetpointInd(piston) {
  const value = parseFloat(document.getElementById(`sp-${piston}`).value);
  try {
    const res = await fetch(`${API_BASE}/pid/setpoint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ piston, value }),
    });
    const data = await res.json();
    if (res.ok) {
      updateSetpoint(piston, value); // Atualiza tracking (chart-utils.js)
      logConsole(`Setpoint pistão ${piston}: ${value} mm`, "tx");
      showToast(`Setpoint pistão ${piston}: ${value} mm`, "success");
    }
  } catch (err) {
    logConsole(`Erro: ${err.message}`, "info");
  }
}

// ========== Manual Control ==========
async function selectPiston() {
  const piston = parseInt(document.getElementById("manual-piston").value);
  try {
    const res = await fetch(`${API_BASE}/pid/select/${piston}`, {
      method: "POST",
    });
    const data = await res.json();
    if (res.ok) {
      logConsole(`Pistão ${piston} selecionado`, "tx");
    }
  } catch (err) {
    logConsole(`Erro: ${err.message}`, "info");
  }
}

async function manualAdvance() {
  try {
    const res = await fetch(`${API_BASE}/pid/manual/A`, {
      method: "POST",
    });
    if (res.ok) {
      logConsole("Manual: Avanço (A)", "tx");
    }
  } catch (err) {
    logConsole(`Erro: ${err.message}`, "info");
  }
}

async function manualRetract() {
  try {
    const res = await fetch(`${API_BASE}/pid/manual/R`, {
      method: "POST",
    });
    if (res.ok) {
      logConsole("Manual: Recuo (R)", "tx");
    }
  } catch (err) {
    logConsole(`Erro: ${err.message}`, "info");
  }
}

async function manualStop() {
  try {
    const res = await fetch(`${API_BASE}/pid/manual/ok`, {
      method: "POST",
    });
    if (res.ok) {
      logConsole("Manual: Parar (ok)", "tx");
    }
  } catch (err) {
    logConsole(`Erro: ${err.message}`, "info");
  }
}

// ========== Init ==========
async function checkExistingConnection() {
  try {
    const res = await fetch(`${API_BASE}/serial/status`);
    const status = await res.json();

    if (status.connected && status.port) {
      window.serialConnected = true;
      document.getElementById("btn-connect").classList.add("hidden");
      document.getElementById("btn-disconnect").classList.remove("hidden");

      setSerialStatus(true, status.port);

      const select = document.getElementById("serial-port");
      if (![...select.options].some((opt) => opt.value === status.port)) {
        const opt = document.createElement("option");
        opt.value = status.port;
        opt.textContent = status.port;
        opt.selected = true;
        select.appendChild(opt);
      } else {
        select.value = status.port;
      }

      localStorage.setItem("serial_connected", "true");
      localStorage.setItem("serial_port", status.port);

      logConsole(`Reconectado à sessão: ${status.port}`, "info");

      // ✅ Inicializar WebSocket
      initLocalTelemetryWS();

      // ✅ AUTO-INICIAR gravação do gráfico quando reconectar
      console.log(
        "🎯 Conexão existente detectada - iniciando gravação automática do gráfico"
      );
      setTimeout(() => {
        if (typeof startChart === "function") {
          startChart();
          console.log("✅ Gravação do gráfico iniciada automaticamente");
        }
      }, 500); // Pequeno delay para garantir que o chart está inicializado
    } else {
      localStorage.setItem("serial_connected", "false");
      localStorage.removeItem("serial_port");
    }
  } catch (err) {
    console.error("Erro ao verificar status:", err);
    localStorage.setItem("serial_connected", "false");
    localStorage.removeItem("serial_port");
  }
}

async function updateConnectionStatus() {
  try {
    const res = await fetch(`${API_BASE}/serial/status`);
    const status = await res.json();

    if (status.connected && status.port) {
      setSerialStatus(true, status.port);
    } else {
      setSerialStatus(false);
    }
  } catch (err) {
    console.error("Erro ao verificar status:", err);
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  // ✅ CRÍTICO: Sobrescrever ANTES de qualquer inicialização
  window.initTelemetryWS = initLocalTelemetryWS;

  // Inicializa banco de dados e gráfico
  try {
    await initDB();
  } catch (err) {
    console.error("Erro ao inicializar DB:", err);
  }

  initChart();

  // Inicializa controles seriais comuns (event listeners + CSS da fonte)
  initCommonSerialControls();

  await checkExistingConnection();
  logConsole("Interface PID carregada.", "info");
});

// ========== Exporta funções para uso global ==========
window.sendCommand = sendCommand;
window.sendFreeCommand = sendFreeCommand;
window.sendSetpointGlobal = sendSetpointGlobal;
window.sendSetpointIndividual = sendSetpointIndividual;
window.sendPIDParams = sendPIDParams;
window.checkExistingConnection = checkExistingConnection;
