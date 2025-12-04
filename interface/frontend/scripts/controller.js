/**
 * controller.js - Script principal da página de controle por joystick
 * Plataforma de Stewart - IFSP
 */

import { initJoystickControl } from './joystick-control.js';

// ========== Configurações ==========
const API_BASE = 'http://localhost:8001';

// ========== Estado Global ==========
let joystickController = null;
let sceneRef = null;

// ========== Inicialização ==========
document.addEventListener('DOMContentLoaded', async () => {
  // Carregar navegação usando nav-menu.js
  if (typeof insertNavMenu === 'function') {
    insertNavMenu('nav-container', 'controller.html');
  }

  // Carregar portas seriais
  await loadSerialPorts();

  // Verificar conexão existente
  await checkExistingConnection();

  // Inicializar preview 3D
  initPreview3D();

  // Inicializar controle por joystick
  initJoystick();

  // Registrar event listeners
  registerEventListeners();

  // Polling de status da conexão serial
  setInterval(updateConnectionStatus, 2000);
});

// ========== Preview 3D ==========
function initPreview3D() {
  // Inicializar cena 3D usando three-utils.js
  sceneRef = init3D('preview-3d');

  if (!sceneRef) {
    console.error('❌ Falha ao inicializar cena 3D');
    showToast('Erro ao inicializar preview 3D', 'error');
    return;
  }

  updatePreview({ x: 0, y: 0, z: 500, roll: 0, pitch: 0, yaw: 0 });
}

async function updatePreview(pose) {
  if (!sceneRef) return;

  try {
    // Calcular cinemática inversa via API
    const response = await fetch(`${API_BASE}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pose),
    });

    if (!response.ok) {
      console.warn('⚠️ Erro ao calcular cinemática para preview');
      return;
    }

    const data = await response.json();

    // Atualizar cena 3D
    draw3DPlatform('preview-3d', data);
  } catch (error) {
    console.error('❌ Erro ao atualizar preview:', error);
  }
}

// ========== Joystick ==========
function initJoystick() {
  joystickController = initJoystickControl({
    apiBaseUrl: API_BASE,
    zBase: 500, // Z elevado: h0=432 + 68mm = 500mm (segurança)

    // Callback quando a pose muda
    onPoseChange: (pose) => {
      // Atualizar valores na UI
      updatePoseUI(pose);

      // Atualizar preview 3D
      updatePreview(pose);
    },

    // Callback de erro
    onError: (message) => {
      console.error('❌ Erro no joystick:', message);
    },
  });

  // Verificar gamepads conectados
  checkGamepads();
}

function updatePoseUI(pose) {
  // Atualizar valores
  document.getElementById('x-value').textContent = pose.x.toFixed(2);
  document.getElementById('y-value').textContent = pose.y.toFixed(2);
  document.getElementById('z-value').textContent = (pose.z || 500).toFixed(2);
  document.getElementById('roll-value').textContent = pose.roll.toFixed(2);
  document.getElementById('pitch-value').textContent = pose.pitch.toFixed(2);
  document.getElementById('yaw-value').textContent = pose.yaw.toFixed(2);

  // Atualizar sliders
  document.getElementById('x-slider').value = pose.x;
  document.getElementById('y-slider').value = pose.y;
  document.getElementById('z-slider').value = pose.z || 500;
  document.getElementById('roll-slider').value = pose.roll;
  document.getElementById('pitch-slider').value = pose.pitch;
  document.getElementById('yaw-slider').value = pose.yaw;
}

function checkGamepads() {
  const gamepads = navigator.getGamepads();
  let found = false;

  for (let i = 0; i < gamepads.length; i++) {
    if (gamepads[i]) {
      found = true;
      updateJoystickStatus(true, gamepads[i].id);
      break;
    }
  }

  if (!found) {
    updateJoystickStatus(false);
  }
}

function updateJoystickStatus(connected, name = '') {
  const statusEl = document.getElementById('joystick-status');
  const statusTextEl = document.getElementById('joystick-status-text');

  if (connected) {
    statusEl.className = 'joystick-indicator active';
    statusTextEl.textContent = `Conectado: ${name}`;
  } else {
    statusEl.className = 'joystick-indicator inactive';
    statusTextEl.textContent = 'Nenhum gamepad detectado';
  }
}

// ========== Event Listeners ==========
function registerEventListeners() {
  // Toggle joystick
  const joystickModeCheckbox = document.getElementById('joystick-mode');
  joystickModeCheckbox?.addEventListener('change', (e) => {
    const enabled = e.target.checked;

    if (joystickController) {
      const success = joystickController.setEnabled(enabled);

      // Se falhou (nenhum gamepad), desmarcar checkbox
      if (!success) {
        e.target.checked = false;
      }
    }
  });

  // Toggle aplicar no hardware
  const applyToHardwareCheckbox = document.getElementById('apply-to-hardware');
  applyToHardwareCheckbox?.addEventListener('change', (e) => {
    if (joystickController) {
      joystickController.setApplyToHardware(e.target.checked);

      if (e.target.checked) {
        showToast('⚠️ Comandos serão aplicados no hardware!', 'warning');
      }
    }
  });

  // Eventos de gamepad (conectar/desconectar)
  window.addEventListener('gamepadconnected', (e) => {
    updateJoystickStatus(true, e.gamepad.id);
    showToast(`Gamepad conectado: ${e.gamepad.id}`, 'success');
  });

  window.addEventListener('gamepaddisconnected', (e) => {
    updateJoystickStatus(false);
    showToast('Gamepad desconectado', 'warning');

    // Desmarcar checkbox se estava ativo
    const checkbox = document.getElementById('joystick-mode');
    if (checkbox && checkbox.checked) {
      checkbox.checked = false;
      if (joystickController) {
        joystickController.setEnabled(false);
      }
    }
  });

  initCommonSerialControls();
}

// ========== Cleanup ==========
window.addEventListener('beforeunload', () => {
  if (joystickController) {
    joystickController.destroy();
  }
});
