// ========== Variáveis Locais ==========
let reconnectTimer = null;

// ========== WebSocket ==========
function initLocalTelemetryWS() {
  if (ws) {
    ws.close();
  }

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    logConsole('WebSocket conectado', 'info');
    clearTimeout(reconnectTimer);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleTelemetry(data);
    } catch (err) {
      console.error('Erro ao processar mensagem WS:', err, event.data);
    }
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
  };

  ws.onclose = () => {
    logConsole('WebSocket desconectado', 'info');
    if (serialConnected) {
      reconnectTimer = setTimeout(initLocalTelemetryWS, 2000);
    }
  };
}

function handleTelemetry(data) {
  if (data.type === 'raw') {
    logConsole(data.raw, 'rx');
  } else if ((data.type === 'telemetry' || data.type === 'telemetry_mpu') && data.Y) {
    // Atualiza telemetria UI
    document.getElementById('telem-sp').textContent = data.sp_mm?.toFixed(2) || '--';
    for (let i = 0; i < 6; i++) {
      document.getElementById(`telem-y${i + 1}`).textContent = data.Y[i]?.toFixed(2) || '--';
      document.getElementById(`telem-pwm${i + 1}`).textContent = data.PWM[i]?.toFixed(0) || '--';
    }

    // Atualiza gráfico (função de chart-utils.js)
    updateChart(data);
  }
}

// ========== Serial Functions (adaptadas de common.js) ==========
async function refreshPorts() {
  try {
    const res = await fetch(`${API_BASE}/serial/ports`);
    const data = await res.json();
    const select = document.getElementById('serial-port');
    select.innerHTML = '<option value="">Selecione...</option>';
    data.ports.forEach((port) => {
      const opt = document.createElement('option');
      opt.value = port;
      opt.textContent = port;
      select.appendChild(opt);
    });
    logConsole('Portas atualizadas', 'info');
  } catch (err) {
    logConsole(`Erro ao listar portas: ${err.message}`, 'info');
  }
}

async function connectSerial() {
  const port = document.getElementById('serial-port').value;
  if (!port) {
    showToast('Selecione uma porta serial', 'warning');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/serial/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port, baud: 115200 }),
    });
    const data = await res.json();

    if (res.ok) {
      serialConnected = true;
      document.getElementById('btn-connect').classList.add('hidden');
      document.getElementById('btn-disconnect').classList.remove('hidden');

      setSerialStatus(true, port);
      logConsole(`Conectado em ${port}`, 'info');
      showToast(`Conectado em ${port}`, 'success');

      localStorage.setItem('serial_connected', 'true');
      localStorage.setItem('serial_port', port);

      initLocalTelemetryWS();
    } else {
      throw new Error(data.detail || 'Erro ao conectar');
    }
  } catch (err) {
    logConsole(`Erro: ${err.message}`, 'info');
    showToast(`Erro: ${err.message}`, 'error');
  }
}

async function disconnectSerial() {
  try {
    await fetch(`${API_BASE}/serial/close`, { method: 'POST' });
    serialConnected = false;
    document.getElementById('btn-connect').classList.remove('hidden');
    document.getElementById('btn-disconnect').classList.add('hidden');

    setSerialStatus(false);
    logConsole('Desconectado', 'info');
    showToast('Desconectado da porta serial', 'info');

    localStorage.setItem('serial_connected', 'false');
    localStorage.removeItem('serial_port');

    if (ws) {
      ws.close();
      ws = null;
    }
  } catch (err) {
    logConsole(`Erro ao desconectar: ${err.message}`, 'info');
  }
}

function setSerialStatus(connected, port = '') {
  const indicator = document.getElementById('status-indicator');
  const text = document.getElementById('status-text');
  const portSpan = document.getElementById('status-port');

  if (connected) {
    indicator.className = 'w-3 h-3 rounded-full bg-green-500 pulse-dot';
    text.textContent = 'Conectado';
    portSpan.textContent = port;
  } else {
    indicator.className = 'w-3 h-3 rounded-full bg-red-500';
    text.textContent = 'Desconectado';
    portSpan.textContent = '--';
  }
}

// ========== Commands ==========
async function sendCommand(cmd) {
  if (!serialConnected) {
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
      serialConnected = true;
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

  await refreshPorts();
  await checkExistingConnection();
  logConsole('Interface PID carregada.', 'info');

  // Atualiza status periodicamente
  setInterval(updateConnectionStatus, 2000);
});
