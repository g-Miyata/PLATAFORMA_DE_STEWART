const API_BASE = 'http://localhost:8001';
function showToast(message, type = 'info') {
  const backgrounds = {
    success: 'linear-gradient(to right, #10b981, #059669)',
    error: 'linear-gradient(to right, #ef4444, #dc2626)',
    warning: 'linear-gradient(to right, #f59e0b, #d97706)',
    info: 'linear-gradient(to right, #3b82f6, #2563eb)',
  };

  Toastify({
    text: message,
    duration: 3000,
    gravity: 'top',
    position: 'right',
    stopOnFocus: true,
    style: {
      background: backgrounds[type] || backgrounds.info,
      borderRadius: '8px',
      fontFamily: 'Inter, sans-serif',
      fontWeight: '500',
    },
  }).showToast();
}

// ========== Compartilhar status de conexão via localStorage ==========
async function updateConnectionStatus() {
  try {
    // Verifica o status real no backend
    const res = await fetch(`${API_BASE}/serial/status`);
    const status = await res.json();

    const indicator = document.getElementById('status-indicator');
    const text = document.getElementById('status-text');
    const portSpan = document.getElementById('status-port');

    if (status.connected && status.port) {
      indicator.className = 'w-3 h-3 rounded-full bg-green-500/30 pulse-dot';
      text.textContent = 'Conectado';
      portSpan.textContent = status.port;

      // Atualiza localStorage
      localStorage.setItem('serial_connected', 'true');
      localStorage.setItem('serial_port', status.port);
    } else {
      indicator.className = 'w-3 h-3 rounded-full bg-red-500';
      text.textContent = 'Desconectado';
      portSpan.textContent = '--';

      // Limpa localStorage
      localStorage.setItem('serial_connected', 'false');
      localStorage.removeItem('serial_port');
    }
  } catch (err) {
    console.error('Erro ao verificar status:', err);
    const indicator = document.getElementById('status-indicator');
    const text = document.getElementById('status-text');
    const portSpan = document.getElementById('status-port');

    indicator.className = 'w-3 h-3 rounded-full bg-red-500';
    text.textContent = 'Desconectado';
    portSpan.textContent = '--';
  }
}

// Atualiza status ao carregar e periodicamente
window.addEventListener('DOMContentLoaded', () => {
  updateConnectionStatus();
  loadPIDGains();
  loadPIDSettings();
});
setInterval(updateConnectionStatus, 2000);

// ========== Carregar Valores do Cache ==========
async function loadPIDGains() {
  try {
    const response = await fetch(`${API_BASE}/pid/gains`);
    if (!response.ok) {
      console.error('Erro na resposta:', response.status);
      return;
    }

    const gains = await response.json();

    // Preenche os campos individuais de cada pistão
    for (let piston = 1; piston <= 6; piston++) {
      if (gains[piston]) {
        document.getElementById(`kp-${piston}`).value = gains[piston].kp;
        document.getElementById(`ki-${piston}`).value = gains[piston].ki;
        document.getElementById(`kd-${piston}`).value = gains[piston].kd;
      }
    }

    // Preenche os campos "Todos os Pistões" com valores do pistão 1
    if (gains[1]) {
      document.getElementById('kp-all').value = gains[1].kp;
      document.getElementById('ki-all').value = gains[1].ki;
      document.getElementById('kd-all').value = gains[1].kd;
    }
  } catch (error) {
    console.error('Erro ao carregar ganhos PID:', error);
  }
}

async function loadPIDSettings() {
  try {
    const response = await fetch(`${API_BASE}/pid/settings`);
    if (!response.ok) {
      console.error('Erro na resposta:', response.status);
      return;
    }

    const settings = await response.json();

    if (settings.dbmm !== undefined) {
      document.getElementById('dbmm').value = settings.dbmm;
    }
    if (settings.minpwm !== undefined) {
      document.getElementById('minpwm').value = settings.minpwm;
    }
  } catch (error) {
    console.error('Erro ao carregar configurações PID:', error);
  }
}

// ========== Funções de Envio ==========
async function sendGainsInd(piston) {
  const kp = parseFloat(document.getElementById(`kp-${piston}`).value);
  const ki = parseFloat(document.getElementById(`ki-${piston}`).value);
  const kd = parseFloat(document.getElementById(`kd-${piston}`).value);

  try {
    const res = await fetch(`${API_BASE}/pid/gains`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ piston, kp, ki, kd }),
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Ganhos aplicados no pistão ${piston}: Kp=${kp}, Ki=${ki}, Kd=${kd}`, 'success');
    } else {
      throw new Error(data.detail || 'Erro ao aplicar ganhos');
    }
  } catch (err) {
    showToast(`Erro: ${err.message}`, 'error');
  }
}

async function sendGainsAll() {
  const kp = parseFloat(document.getElementById('kp-all').value);
  const ki = parseFloat(document.getElementById('ki-all').value);
  const kd = parseFloat(document.getElementById('kd-all').value);

  try {
    const res = await fetch(`${API_BASE}/pid/gains/all?kp=${kp}&ki=${ki}&kd=${kd}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Ganhos aplicados em TODOS os pistões: Kp=${kp}, Ki=${ki}, Kd=${kd}`, 'success');
    } else {
      throw new Error(data.detail || 'Erro ao aplicar ganhos');
    }
  } catch (err) {
    showToast(`Erro: ${err.message}`, 'error');
  }
}

async function sendSettings() {
  const dbmm = parseFloat(document.getElementById('dbmm').value);
  const minpwm = parseInt(document.getElementById('minpwm').value);

  try {
    const res = await fetch(`${API_BASE}/pid/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dbmm, minpwm }),
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Ajustes aplicados: dbmm=${dbmm}, minpwm=${minpwm}`, 'success');
    } else {
      throw new Error(data.detail || 'Erro ao aplicar ajustes');
    }
  } catch (err) {
    showToast(`Erro: ${err.message}`, 'error');
  }
}
