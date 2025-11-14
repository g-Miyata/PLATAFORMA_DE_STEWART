// ========== Variáveis Locais ==========
let reconnectTimer = null;

// ========== WebSocket ==========
function initLocalTelemetryWS() {
  console.log('🔌 Iniciando WebSocket local para telemetria...');
  
  if (window.ws) {
    window.ws.close();
  }

  window.ws = new WebSocket(window.WS_URL);
  console.log('🔌 WebSocket URL:', window.WS_URL);

  window.ws.onopen = () => {
    console.log('✅ WebSocket conectado!');
    logConsole('WebSocket conectado', 'info');
    clearTimeout(reconnectTimer);
  };

  window.ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleTelemetry(data);
    } catch (err) {
      console.error('❌ Erro ao processar mensagem WS:', err, event.data);
    }
  };

  window.ws.onerror = (err) => {
    console.error('❌ WebSocket error:', err);
  };

  window.ws.onclose = () => {
    console.log('🔌 WebSocket desconectado');
    logConsole('WebSocket desconectado', 'info');
    if (window.serialConnected) {
      console.log('🔄 Reconectando WebSocket em 2s...');
      reconnectTimer = setTimeout(initLocalTelemetryWS, 2000);
    }
  };
}

function handleTelemetry(data) {
  console.log('📊 Telemetria recebida:', data.type, data);
  
  if (data.type === 'raw') {
    logConsole(data.raw, 'rx');
  } else if ((data.type === 'telemetry' || data.type === 'telemetry_mpu' || data.type === 'telemetry_bno085') && data.Y) {
    console.log('✅ Processando telemetria com Y:', data.Y);
    
    // Atualiza telemetria UI
    document.getElementById('telem-sp').textContent = data.sp_mm?.toFixed(2) || '--';
    for (let i = 0; i < 6; i++) {
      document.getElementById(`telem-y${i + 1}`).textContent = data.Y[i]?.toFixed(2) || '--';
      document.getElementById(`telem-pwm${i + 1}`).textContent = data.PWM[i]?.toFixed(0) || '--';
    }

    // Atualiza gráfico (função de chart-utils.js)
    updateChart(data);
  } else {
    console.warn('⚠️ Telemetria ignorada - type:', data.type, 'tem Y?', !!data.Y);
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
    showToast('Conecte à porta serial primeiro', 'warning');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/serial/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd }),
    });
    const data = await res.json();
    if (res.ok) {
      logConsole(cmd, 'tx');
    } else {
      throw new Error(data.detail || 'Erro ao enviar');
    }
  } catch (err) {
    logConsole(`Erro: ${err.message}`, 'info');
  }
}

function sendFreeCommand() {
  const cmd = document.getElementById('free-command').value.trim();
  if (!cmd) return;
  sendCommand(cmd);
  document.getElementById('free-command').value = '';
}

// ========== Setpoints ==========
async function sendSetpointGlobal() {
  const value = parseFloat(document.getElementById('sp-global').value);
  try {
    const res = await fetch(`${API_BASE}/pid/setpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ piston: null, value }),
    });
    const data = await res.json();
    if (res.ok) {
      updateSetpoint(null, value); // Atualiza tracking (chart-utils.js)
      logConsole(`Setpoint global: ${value} mm`, 'tx');
      showToast(`Setpoint global aplicado: ${value} mm`, 'success');
    }
  } catch (err) {
    logConsole(`Erro: ${err.message}`, 'info');
  }
}

async function sendSetpointInd(piston) {
  const value = parseFloat(document.getElementById(`sp-${piston}`).value);
  try {
    const res = await fetch(`${API_BASE}/pid/setpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ piston, value }),
    });
    const data = await res.json();
    if (res.ok) {
      updateSetpoint(piston, value); // Atualiza tracking (chart-utils.js)
      logConsole(`Setpoint pistão ${piston}: ${value} mm`, 'tx');
      showToast(`Setpoint pistão ${piston}: ${value} mm`, 'success');
    }
  } catch (err) {
    logConsole(`Erro: ${err.message}`, 'info');
  }
}

// ========== Manual Control ==========
async function selectPiston() {
  const piston = parseInt(document.getElementById('manual-piston').value);
  try {
    const res = await fetch(`${API_BASE}/pid/select/${piston}`, {
      method: 'POST',
    });
    const data = await res.json();
    if (res.ok) {
      logConsole(`Pistão ${piston} selecionado`, 'tx');
    }
  } catch (err) {
    logConsole(`Erro: ${err.message}`, 'info');
  }
}

async function manualAdvance() {
  try {
    const res = await fetch(`${API_BASE}/pid/manual/A`, {
      method: 'POST',
    });
    if (res.ok) {
      logConsole('Manual: Avanço (A)', 'tx');
    }
  } catch (err) {
    logConsole(`Erro: ${err.message}`, 'info');
  }
}

async function manualRetract() {
  try {
    const res = await fetch(`${API_BASE}/pid/manual/R`, {
      method: 'POST',
    });
    if (res.ok) {
      logConsole('Manual: Recuo (R)', 'tx');
    }
  } catch (err) {
    logConsole(`Erro: ${err.message}`, 'info');
  }
}

async function manualStop() {
  try {
    const res = await fetch(`${API_BASE}/pid/manual/ok`, {
      method: 'POST',
    });
    if (res.ok) {
      logConsole('Manual: Parar (ok)', 'tx');
    }
  } catch (err) {
    logConsole(`Erro: ${err.message}`, 'info');
  }
}

// ========== Init ==========
async function checkExistingConnection() {
  try {
    const res = await fetch(`${API_BASE}/serial/status`);
    const status = await res.json();

    if (status.connected && status.port) {
      window.serialConnected = true;
      document.getElementById('btn-connect').classList.add('hidden');
      document.getElementById('btn-disconnect').classList.remove('hidden');

      setSerialStatus(true, status.port);

      const select = document.getElementById('serial-port');
      if (![...select.options].some((opt) => opt.value === status.port)) {
        const opt = document.createElement('option');
        opt.value = status.port;
        opt.textContent = status.port;
        opt.selected = true;
        select.appendChild(opt);
      } else {
        select.value = status.port;
      }

      localStorage.setItem('serial_connected', 'true');
      localStorage.setItem('serial_port', status.port);

      logConsole(`Reconectado à sessão: ${status.port}`, 'info');

      initLocalTelemetryWS();
    } else {
      localStorage.setItem('serial_connected', 'false');
      localStorage.removeItem('serial_port');
    }
  } catch (err) {
    console.error('Erro ao verificar status:', err);
    localStorage.setItem('serial_connected', 'false');
    localStorage.removeItem('serial_port');
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
    console.error('Erro ao verificar status:', err);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  // Inicializa banco de dados e gráfico
  try {
    await initDB();
  } catch (err) {
    console.error('Erro ao inicializar DB:', err);
  }

  initChart();

  // Sobrescreve a função global initTelemetryWS para usar a versão local
  window.initTelemetryWS = initLocalTelemetryWS;

  // Inicializa controles seriais comuns (event listeners + CSS da fonte)
  initCommonSerialControls();

  await checkExistingConnection();
  logConsole('Interface PID carregada.', 'info');
});

// ========== Exporta funções para uso global ==========
window.sendCommand = sendCommand;
window.sendFreeCommand = sendFreeCommand;
window.sendSetpointGlobal = sendSetpointGlobal;
window.sendSetpointIndividual = sendSetpointIndividual;
window.sendPIDParams = sendPIDParams;
window.checkExistingConnection = checkExistingConnection;
