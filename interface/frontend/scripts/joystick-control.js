/**
 * joystick-control.js - Controle por Gamepad/Joystick
 * Plataforma de Stewart - IFSP
 *
 * Sistema de controle em tempo real usando Gamepad API.
 * Mapeia eixos do joystick para translação/rotação da plataforma.
 */

// ========== Configurações ==========
const JOYSTICK_CONFIG = {
  DEADZONE: 0.1, // Zona morta para eixos (ignora valores < 0.1)
  UPDATE_RATE_MS: 50, // Taxa de atualização (50ms = 20Hz)
  PREVIEW_RATE_MS: 16, // Taxa de atualização do preview 3D (16ms ≈ 60fps)
  MAX_TRANS_MM: 30.0, // Limite de translação ±30mm
  MAX_ANGLE_DEG: 8.0, // Limite de rotação ±8°
  Z_BASE: 500, // Z base elevado (h0=432 + 68mm = 500mm)
};

// Mapeamento de eixos do gamepad padrão (Xbox/PlayStation)
const AXIS_MAPPING = {
  LX: 0, // Stick esquerdo X (horizontal)
  LY: 1, // Stick esquerdo Y (vertical)
  RX: 2, // Stick direito X (horizontal)
  RY: 3, // Stick direito Y (vertical)
  // Nota: LT e RT podem variar dependendo do navegador/driver
};

// ========== Estado do Joystick ==========
class JoystickController {
  constructor(config) {
    this.config = config;
    this.enabled = false;
    this.gamepadIndex = null;
    this.lastAxes = [0, 0, 0, 0];
    this.lastPose = { x: 0, y: 0, z: config.Z_BASE, roll: 0, pitch: 0, yaw: 0 };
    this.animationFrameId = null;
    this.updateTimerId = null;

    // Callbacks
    this.onPoseChange = null;
    this.onUpdate = null;
    this.onError = null;

    // Configuração da API
    this.apiBaseUrl = config.apiBaseUrl || 'http://localhost:8001';

    // Flag de aplicação
    this.applyToHardware = false;

    // Bind de métodos
    this._loop = this._loop.bind(this);
    this._update = this._update.bind(this);
    this._onGamepadConnected = this._onGamepadConnected.bind(this);
    this._onGamepadDisconnected = this._onGamepadDisconnected.bind(this);

    // Registrar eventos de gamepad
    window.addEventListener('gamepadconnected', this._onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this._onGamepadDisconnected);

    console.log('🎮 JoystickController inicializado');
  }

  // ========== Gerenciamento de Gamepad ==========

  _onGamepadConnected(e) {
    console.log(`🎮 Gamepad conectado: ${e.gamepad.id} (índice ${e.gamepad.index})`);

    // Se nenhum gamepad ativo, usar este
    if (this.gamepadIndex === null) {
      this.gamepadIndex = e.gamepad.index;
      this._showToast(`Gamepad conectado: ${e.gamepad.id}`, 'success');
    }
  }

  _onGamepadDisconnected(e) {
    console.log(`🎮 Gamepad desconectado: índice ${e.gamepad.index}`);

    if (this.gamepadIndex === e.gamepad.index) {
      this.gamepadIndex = null;
      this._showToast('Gamepad desconectado', 'warning');

      // Desabilitar se estava ativo
      if (this.enabled) {
        this.setEnabled(false);
      }
    }
  }

  _getGamepad() {
    if (this.gamepadIndex === null) return null;

    const gamepads = navigator.getGamepads();
    return gamepads[this.gamepadIndex] || null;
  }

  // ========== Processamento de Eixos ==========

  _applyDeadzone(value) {
    return Math.abs(value) < this.config.DEADZONE ? 0 : value;
  }

  _readAxes(gamepad) {
    if (!gamepad || !gamepad.axes) return [0, 0, 0, 0];

    return [this._applyDeadzone(gamepad.axes[AXIS_MAPPING.LX] || 0), this._applyDeadzone(gamepad.axes[AXIS_MAPPING.LY] || 0), this._applyDeadzone(gamepad.axes[AXIS_MAPPING.RX] || 0), this._applyDeadzone(gamepad.axes[AXIS_MAPPING.RY] || 0)];
  }

  _axesToPose(axes) {
    const [lx, ly, rx, ry] = axes;

    // Mapear para valores físicos
    const x = lx * this.config.MAX_TRANS_MM;
    const y = -ly * this.config.MAX_TRANS_MM; // Inverter Y (frente = negativo)
    const z = this.config.Z_BASE; // Z fixo por enquanto

    const roll = -ry * this.config.MAX_ANGLE_DEG; // Inverter roll
    const pitch = rx * this.config.MAX_ANGLE_DEG;
    const yaw = 0; // Yaw = 0 por enquanto

    return { x, y, z, roll, pitch, yaw };
  }

  // ========== Loop de Atualização ==========

  _loop() {
    if (!this.enabled) return;

    const gamepad = this._getGamepad();

    if (gamepad) {
      // Ler eixos
      const axes = this._readAxes(gamepad);

      // Converter para pose
      const pose = this._axesToPose(axes);

      // Atualizar estado
      this.lastAxes = axes;
      this.lastPose = pose;

      // Callback de pose change (para atualizar UI)
      if (this.onPoseChange) {
        this.onPoseChange(pose);
      }

      // Callback genérico de update
      if (this.onUpdate) {
        this.onUpdate({ axes, pose });
      }
    }

    // Continuar loop
    this.animationFrameId = requestAnimationFrame(this._loop);
  }

  async _update() {
    if (!this.enabled) return;

    const gamepad = this._getGamepad();

    if (!gamepad) {
      console.warn('⚠️ Nenhum gamepad disponível');
      return;
    }

    // Ler eixos e converter para pose
    const axes = this._readAxes(gamepad);
    const pose = this._axesToPose(axes);

    // Enviar para backend
    try {
      const response = await fetch(`${this.apiBaseUrl}/joystick/pose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lx: axes[0],
          ly: axes[1],
          rx: axes[2],
          ry: axes[3],
          apply: this.applyToHardware,
          z_base: this.config.Z_BASE,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Erro ao processar pose');
      }

      // Se pose inválida, notificar
      if (!data.valid) {
        console.warn('⚠️ Pose inválida:', data.message);
        if (this.onError) {
          this.onError(data.message);
        }
      }
    } catch (error) {
      console.error('❌ Erro ao enviar pose:', error);
      if (this.onError) {
        this.onError(error.message);
      }
    }
  }

  // ========== API Pública ==========

  /**
   * Habilita/desabilita o controle por joystick
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    if (this.enabled === enabled) return;

    this.enabled = enabled;

    if (enabled) {
      // Verificar se há gamepad conectado
      const gamepad = this._getGamepad();

      if (!gamepad) {
        console.warn('⚠️ Nenhum gamepad conectado');
        this._showToast('Nenhum gamepad conectado', 'warning');
        this.enabled = false;
        return false;
      }

      console.log('🎮 Controle por joystick ATIVADO');
      this._showToast('Controle por joystick ativado', 'success');

      // Iniciar loops
      this._loop();
      this.updateTimerId = setInterval(this._update, this.config.UPDATE_RATE_MS);
    } else {
      console.log('🎮 Controle por joystick DESATIVADO');
      this._showToast('Controle por joystick desativado', 'info');

      // Parar loops
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }

      if (this.updateTimerId) {
        clearInterval(this.updateTimerId);
        this.updateTimerId = null;
      }
    }

    return this.enabled;
  }

  /**
   * Define se os comandos devem ser aplicados no hardware
   * @param {boolean} apply
   */
  setApplyToHardware(apply) {
    this.applyToHardware = apply;
    console.log(`🎮 Aplicação no hardware: ${apply ? 'ATIVADA' : 'DESATIVADA'}`);
  }

  /**
   * Obtém o estado atual
   * @returns {Object}
   */
  getState() {
    return {
      enabled: this.enabled,
      gamepadConnected: this._getGamepad() !== null,
      gamepadIndex: this.gamepadIndex,
      axes: this.lastAxes,
      pose: this.lastPose,
      applyToHardware: this.applyToHardware,
    };
  }

  /**
   * Libera recursos
   */
  destroy() {
    this.setEnabled(false);
    window.removeEventListener('gamepadconnected', this._onGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this._onGamepadDisconnected);
    console.log('🎮 JoystickController destruído');
  }

  // ========== Helpers ==========

  _showToast(message, type = 'info') {
    // Usar showToast do common.js se disponível
    if (typeof showToast === 'function') {
      showToast(message, type);
    } else {
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }
}

// ========== Função de Inicialização ==========

/**
 * Inicializa o controle por joystick
 * @param {Object} options - Opções de configuração
 * @param {string} options.apiBaseUrl - URL base da API
 * @param {Function} options.onPoseChange - Callback quando a pose muda
 * @param {Function} options.onUpdate - Callback genérico de atualização
 * @param {Function} options.onError - Callback de erro
 * @param {number} options.zBase - Z base (opcional)
 * @returns {JoystickController}
 */
export function initJoystickControl(options = {}) {
  const config = {
    ...JOYSTICK_CONFIG,
    apiBaseUrl: options.apiBaseUrl || 'http://localhost:8001',
    Z_BASE: options.zBase || null,
  };

  const controller = new JoystickController(config);

  // Registrar callbacks
  if (options.onPoseChange) controller.onPoseChange = options.onPoseChange;
  if (options.onUpdate) controller.onUpdate = options.onUpdate;
  if (options.onError) controller.onError = options.onError;

  return controller;
}

// ========== Exportação ==========
export default JoystickController;
