/**
 * common.js - Funções compartilhadas entre páginas
 * Plataforma de Stewart - IFSP
 */

const API_BASE = "http://localhost:8001";
const WS_URL = "ws://localhost:8001/ws/telemetry";

// Variáveis globais de conexão
let serialConnected = false;
let ws = null;
let wsTimer = null;

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

// ========== Serial Port Functions ==========
async function loadSerialPorts() {
  try {
    const response = await fetch(`${API_BASE}/serial/ports`);
    const data = await response.json();
    const select = document.getElementById('serial-port-select');
    if (!select) return;

    select.innerHTML = '<option value="">Selecione a porta...</option>';

    data.ports.forEach((port) => {
      const option = document.createElement('option');
      option.value = port.device;

      const displayName = port.display_name || port.description || 'Dispositivo desconhecido';
      const deviceName = port.device || '???';

      let label = '';
      let badgeIcon = '';

      if (port.is_esp32) {
        // Verifica se é ESP32-S3 (nome contém "S3")
        const isS3 = displayName.includes('S3') || displayName.includes('s3');

        if (isS3) {
          // ESP32-S3 em VERDE (confiança >= 90)
          if (port.confidence >= 90) {
            badgeIcon = '✓'; // Check mark verde
            option.style.fontWeight = '600';
            option.style.color = '#10b981'; // verde
          } else {
            badgeIcon = '~'; // Tilde verde claro
            option.style.fontWeight = '500';
            option.style.color = '#34d399'; // verde claro
          }
        } else {
          // ESP32 comum em LARANJA
          if (port.confidence >= 70) {
            badgeIcon = '○'; // Círculo laranja
            option.style.fontWeight = '600';
            option.style.color = '#f97316'; // laranja
          } else {
            badgeIcon = '~'; // Tilde amarelo
            option.style.fontWeight = '500';
            option.style.color = '#f59e0b'; // amarelo
          }
        }

        // Formato padronizado: [✓] COM5 • ESP32-S3 (USB Nativo)
        label = `[${badgeIcon}] ${deviceName} • ${displayName}`;
      } else {
        // Outras portas em cinza
        label = `[X] ${deviceName} • ${displayName}`;
        option.style.color = '#9ca3af'; // cinza
        option.style.fontWeight = '400';
      }

      option.textContent = label;

      // Tooltip padronizado com informações técnicas
      const vidStr = port.vid ? `0x${port.vid.toString(16).toUpperCase().padStart(4, '0')}` : 'N/A';
      const pidStr = port.pid ? `0x${port.pid.toString(16).toUpperCase().padStart(4, '0')}` : 'N/A';
      option.title = `${port.manufacturer || 'Fabricante desconhecido'}\nVID:PID = ${vidStr}:${pidStr}\nConfiança: ${port.confidence}%`;

      select.appendChild(option);
    });

    // Verificar se há conexão ativa e selecionar a porta correspondente
    try {
      const statusRes = await fetch(`${API_BASE}/serial/status`);
      const status = await statusRes.json();

      if (status.connected && status.port) {
        // Porta conectada - selecionar no dropdown
        select.value = status.port;
      } else {
        // Sem conexão ativa - auto-selecionar ESP32 de alta confiança se houver apenas um
        const highConfidencePorts = data.ports.filter((p) => p.is_esp32 && p.confidence >= 80);
        if (highConfidencePorts.length === 1 && select.options.length === 2) {
          const port = highConfidencePorts[0];
          select.value = port.device;
          const displayName = port.display_name || port.description || 'ESP32-S3';
          showToast(`✓ ${displayName} detectado em ${port.device}`, 'success');
        }
      }
    } catch (err) {
      console.warn('⚠️ Não foi possível verificar status da conexão:', err);
    }
  } catch (error) {
    console.error('❌ Erro ao carregar portas:', error);
    showToast('Erro ao carregar portas seriais', 'error');
  }
}

async function openSerial() {
  const select = document.getElementById('serial-port-select');
  const port = select?.value;

  if (!port) {
    showToast('Selecione uma porta serial', 'warning');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/serial/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port }),
    });

    const data = await response.json();

    if (response.ok) {
      serialConnected = true;
      window.serialConnected = true; // Atualiza window também
      setSerialStatus(true, port);
      showToast(`Conectado em ${port}`, 'success');
      initTelemetryWS();
    } else {
      showToast(`Erro: ${data.detail}`, 'error');
    }
  } catch (error) {
    showToast(`Erro ao conectar: ${error.message}`, 'error');
  }
}

async function closeSerial() {
  try {
    const response = await fetch(`${API_BASE}/serial/close`, {
      method: 'POST',
    });

    if (response.ok) {
      serialConnected = false;
      window.serialConnected = false; // Atualiza window também
      setSerialStatus(false);
      showToast('Desconectado', 'info');
      if (ws) {
        ws.close();
        ws = null;
        window.ws = null; // Atualiza window também
      }
    } else {
      showToast('Erro ao desconectar', 'error');
    }
  } catch (error) {
    showToast(`Erro: ${error.message}`, 'error');
  }
}

function setSerialStatus(connected, port = '--') {
  const indicator = document.getElementById('status-indicator');
  const text = document.getElementById('status-text');
  const portEl = document.getElementById('status-port');
  const btnOpen = document.getElementById('btn-open-serial');
  const btnClose = document.getElementById('btn-close-serial');

  if (!indicator || !text) return;

  if (connected) {
    indicator.className = 'w-3 h-3 rounded-full bg-green-500 pulse-dot';
    text.textContent = 'Conectado';
    if (portEl) portEl.textContent = port;
    if (btnOpen) btnOpen.classList.add('hidden');
    if (btnClose) btnClose.classList.remove('hidden');
  } else {
    indicator.className = 'w-3 h-3 rounded-full bg-red-500';
    text.textContent = 'Desconectado';
    if (portEl) portEl.textContent = '--';
    if (btnOpen) btnOpen.classList.remove('hidden');
    if (btnClose) btnClose.classList.add('hidden');
  }
}

async function updateConnectionStatus() {
  try {
    const response = await fetch(`${API_BASE}/serial/status`);
    const status = await response.json();

    if (status.connected !== serialConnected) {
      serialConnected = status.connected;
      setSerialStatus(status.connected, status.port);
    }
  } catch (error) {
    // Silencioso - não incomoda o usuário com erros de polling
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
      if (select && ![...select.options].some((opt) => opt.value === status.port)) {
        const opt = document.createElement('option');
        opt.value = status.port;
        opt.textContent = status.port;
        opt.selected = true;
        select.appendChild(opt);
      } else if (select) {
        select.value = status.port;
      }

      initTelemetryWS();
    }
  } catch (err) {
    console.error('⚠️ Erro ao verificar status:', err);
  }
}

// ========== WebSocket Functions ==========
function initTelemetryWS() {
  if (ws) {
    try {
      ws.close();
    } catch (_) {}
    ws = null;
  }

  try {
    ws = new WebSocket(WS_URL);
    window.ws = ws; // Exportar para window imediatamente
  } catch (e) {
    console.error('❌ Erro ao criar WebSocket:', e);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    if (wsTimer) clearTimeout(wsTimer);
  };

  ws.onclose = () => {
    scheduleReconnect();
  };

  ws.onerror = (e) => {
    console.error('❌ WebSocket error:', e);
  };

  // O onmessage deve ser configurado por cada página específica
  // pois o processamento de mensagens é diferente em cada uma

  // Expor WebSocket globalmente
  window.ws = ws;

  return ws;
}

function scheduleReconnect() {
  if (wsTimer) clearTimeout(wsTimer);
  wsTimer = setTimeout(() => {
    if (serialConnected) {
      initTelemetryWS();
    }
  }, 1000);
}

// ========== Icon Helper (Material Icons) ==========
/**
 * Cria um ícone usando Material Icons
 * @param {string} iconName - Nome do ícone (ex: 'home', 'settings', 'dashboard')
 * @param {string} className - Classes CSS adicionais (opcional)
 * @param {string} style - Estilo inline (opcional)
 * @returns {string} HTML do ícone
 */
function icon(iconName, className = '', style = '') {
  const classes = className ? ` ${className}` : '';
  const styleAttr = style ? ` style="${style}"` : '';
  return `<span class="material-icons${classes}"${styleAttr}>${iconName}</span>`;
}

/**
 * Cria um ícone outlined (contorno)
 */
function iconOutlined(iconName, className = '', style = '') {
  const classes = className ? ` ${className}` : '';
  const styleAttr = style ? ` style="${style}"` : '';
  return `<span class="material-icons-outlined${classes}"${styleAttr}>${iconName}</span>`;
}

/**
 * Carrega os ícones do Material Icons (deve ser chamado no <head>)
 */
function loadMaterialIcons() {
  if (!document.querySelector('link[href*="material-icons"]')) {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/icon?family=Material+Icons';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    const linkOutlined = document.createElement('link');
    linkOutlined.href = 'https://fonts.googleapis.com/icon?family=Material+Icons+Outlined';
    linkOutlined.rel = 'stylesheet';
    document.head.appendChild(linkOutlined);
  }
}

// Mapeamento de emojis para ícones Material Icons
const ICON_MAP = {
  '🏠': 'home',
  '🎮': 'videogame_asset',
  '📐': 'straighten',
  '🔄': 'autorenew',
  '🎯': 'gps_fixed',
  '⚙️': 'settings',
  '📊': 'bar_chart',
  '📈': 'show_chart',
  '📡': 'wifi_tethering',
  '🔌': 'power',
  '✅': 'check_circle',
  '🚀': 'rocket_launch',
  '🎬': 'movie',
  '📟': 'devices',
  '🕹️': 'sports_esports',
  '💾': 'save',
  '🗑️': 'delete',
  '🔍': 'zoom_in',
  '⏸': 'pause',
  '▶': 'play_arrow',
  '⏹': 'stop',
  '↻': 'refresh',
  '←': 'arrow_back',
  '→': 'arrow_forward',
  '▲': 'keyboard_arrow_up',
  '▼': 'keyboard_arrow_down',
  ℹ️: 'info',
  '💡': 'lightbulb',
  '🔧': 'build',
  '🎨': 'palette',
  '⚡': 'bolt',
};

/**
 * Converte emoji para ícone Material Icons
 * @param {string} emoji - Emoji para converter
 * @param {string} className - Classes CSS adicionais
 * @returns {string} HTML do ícone ou emoji original
 */
function emojiToIcon(emoji, className = '') {
  const iconName = ICON_MAP[emoji];
  return iconName ? icon(iconName, className) : emoji;
}

// ========== Inicialização Comum ==========
function initCommonSerialControls() {
  const btnRefresh = document.getElementById('btn-refresh-ports');
  const btnOpen = document.getElementById('btn-open-serial');
  const btnClose = document.getElementById('btn-close-serial');

  if (btnRefresh) btnRefresh.addEventListener('click', loadSerialPorts);
  if (btnOpen) btnOpen.addEventListener('click', openSerial);
  if (btnClose) btnClose.addEventListener('click', closeSerial);

  // Injeta CSS para estilizar o select de portas
  injectSerialPortStyles();

  // Carrega portas disponíveis
  loadSerialPorts();

  // Verifica conexão existente
  checkExistingConnection();

  // Atualiza status periodicamente
  setInterval(updateConnectionStatus, 2000);
}

// ========== CSS Injection ==========
function injectSerialPortStyles() {
  if (document.getElementById('serial-port-styles')) return;

  const style = document.createElement('style');
  style.id = 'serial-port-styles';
  style.textContent = `
    /* Estilização padronizada do select de portas seriais */
    #serial-port-select {
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 0.875rem;
      line-height: 1.6;
      letter-spacing: 0.02em;
    }
    
    #serial-port-select option {
      padding: 10px 8px;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      line-height: 1.8;
    }
    
    /* Primeira opção (placeholder) em itálico */
    #serial-port-select option:first-child {
      font-style: italic;
      color: #9ca3af !important;
      font-weight: 400 !important;
    }
  `;
  document.head.appendChild(style);
}

// Exportar para uso global
window.API_BASE = API_BASE;
window.WS_URL = WS_URL;
window.serialConnected = serialConnected;
window.ws = ws;
window.showToast = showToast;
window.loadSerialPorts = loadSerialPorts;
window.openSerial = openSerial;
window.closeSerial = closeSerial;
window.setSerialStatus = setSerialStatus;
window.updateConnectionStatus = updateConnectionStatus;
window.checkExistingConnection = checkExistingConnection;
window.initTelemetryWS = initTelemetryWS;
window.scheduleReconnect = scheduleReconnect;
window.initCommonSerialControls = initCommonSerialControls;
window.injectSerialPortStyles = injectSerialPortStyles;
window.icon = icon;
window.iconOutlined = iconOutlined;
window.loadMaterialIcons = loadMaterialIcons;
window.emojiToIcon = emojiToIcon;
window.ICON_MAP = ICON_MAP;
