/**
 * telemetry-utils.js - Utilitários de processamento de telemetria
 * Plataforma de Stewart - IFSP
 */

// ========== Constantes ==========

// Pontos fixos da base (coordenadas da geometria real)
const BASE_POINTS_FIXED = [
  [305.5, -17, 0],
  [305.5, 17, 0],
  [-137.7, 273.23, 0],
  [-168, 255.7, 0],
  [-167.2, -256.2, 0],
  [-136.8, -273.6, 0],
];

// ========== Normalização de Telemetria ==========

/**
 * Normaliza mensagens de telemetria do WebSocket
 * Suporta formatos: telemetry, telemetry_mpu, telemetry_bno085, raw
 * @param {Object} msg - Mensagem bruta do WebSocket
 * @returns {Object} Dados normalizados
 */
function normalizeTelemetry(msg) {
  // Mensagem raw (apenas log, sem dados úteis)
  if (msg.type === 'raw') {
    return {
      type: 'raw',
      raw: msg.raw || msg.data || '',
      timestamp: msg.ts || Date.now(),
    };
  }

  // Telemetria padrão, com MPU ou com BNO085
  if (msg.type === 'telemetry' || msg.type === 'telemetry_mpu' || msg.type === 'telemetry_bno085') {
    // Comprimentos absolutos dos atuadores (múltiplos formatos possíveis)
    let actuator_lengths_abs = msg.actuator_lengths_abs || [];

    // Se não tiver actuator_lengths_abs, tentar base_sp_mm (ESP32 envia setpoints em mm)
    if (!actuator_lengths_abs.length && Array.isArray(msg.base_sp_mm)) {
      // Converter de curso (0-180mm) para comprimento absoluto (500-680mm)
      actuator_lengths_abs = msg.base_sp_mm.map((sp) => sp + 500);
    }

    // Se tiver Y (feedback do sensor), usar como comprimento absoluto (PRIORIDADE MÁXIMA)
    if (Array.isArray(msg.Y) && msg.Y.length === 6) {
      // Y já está em mm de curso (0-250), converter para absoluto
      actuator_lengths_abs = msg.Y.map((y) => y + 500);
    }

    const normalized = {
      type: msg.type,
      timestamp: msg.ts || Date.now(),

      // Dados de controle
      sp_mm: msg.sp_mm || 0,
      Y: msg.Y || [0, 0, 0, 0, 0, 0],
      PWM: msg.PWM || [0, 0, 0, 0, 0, 0],

      // Comprimentos absolutos dos atuadores
      actuator_lengths_abs: actuator_lengths_abs,

      // Pose estimada (cinemática direta)
      pose_live: msg.pose_live || null,

      // Pontos da plataforma reconstruídos
      platform_points_live: msg.platform_points_live || null,

      // Pontos da base (fixos)
      base_points: msg.base_points || BASE_POINTS_FIXED,

      // Dados do MPU (se disponível)
      mpu: msg.mpu || null,

      // Formato da mensagem
      format: msg.format || 'standard',
    };

    return normalized;
  }

  // Formato desconhecido
  console.warn('⚠️ Formato de telemetria desconhecido:', msg);
  return {
    type: 'unknown',
    raw: JSON.stringify(msg),
    timestamp: Date.now(),
  };
}

// ========== Reconstrução de Pontos da Plataforma ==========

/**
 * Reconstrói os pontos da plataforma a partir dos comprimentos dos atuadores
 * Usado quando platform_points_live não está disponível
 * @param {Array} basePoints - Pontos da base [[x,y,z], ...]
 * @param {Array} actuators - Comprimentos dos atuadores [L1, L2, ..., L6]
 * @returns {Array} Pontos estimados da plataforma [[x,y,z], ...]
 */
function reconstructPlatformPoints(basePoints, actuators) {
  if (!basePoints || basePoints.length !== 6 || !actuators || actuators.length !== 6) {
    console.warn('⚠️ Dados insuficientes para reconstruir pontos da plataforma');
    return null;
  }

  // Estimativa simplificada: assume que os atuadores apontam verticalmente
  // (aproximação, a cinemática direta real é mais complexa)
  const platformPoints = basePoints.map((bp, i) => {
    const length = actuators[i].length || 0;
    // Aproximação: atuador aponta para cima com pequeno offset XY
    return [
      bp[0], // x aproximado
      bp[1], // y aproximado
      length - 500 + 432, // z estimado (500 = stroke_min, 432 = h0)
    ];
  });

  return platformPoints;
}

// ========== Aplicação de Telemetria ao 3D ==========

/**
 * Aplica dados de telemetria ao modelo 3D ao vivo
 * @param {string} containerId - ID do container 3D
 * @param {Object} data - Dados normalizados de telemetria
 * @param {Function} customCallback - Callback adicional (opcional)
 */
function applyLiveTelemetry(containerId, data, customCallback) {
  // Verificar se actuator_lengths_abs existe e tem dados
  if (!data.actuator_lengths_abs || data.actuator_lengths_abs.length === 0) {
    console.warn('⚠️ Sem dados de comprimento dos atuadores - pulando renderização');
    return;
  }

  // Se já temos os pontos da plataforma do backend, usar diretamente
  let platformPoints = data.platform_points_live;

  // Se não temos, tentar reconstruir a partir dos comprimentos
  if (!platformPoints && data.actuator_lengths_abs && data.actuator_lengths_abs.length === 6) {
    const actuatorsData = data.actuator_lengths_abs.map((length) => ({
      length,
    }));
    platformPoints = reconstructPlatformPoints(data.base_points, actuatorsData);
  }

  // Se ainda não temos pontos, não podemos renderizar
  if (!platformPoints) {
    console.warn('⚠️ Não foi possível obter pontos da plataforma após reconstrução');
    return;
  }

  // Preparar dados para renderização 3D
  const renderData = {
    base_points: data.base_points,
    platform_points: platformPoints,
    actuators: data.actuator_lengths_abs.map((length, i) => ({
      length: length,
      valid: length >= 498 && length <= 678, // Validação de limites seguros
    })),
    valid: true,
    pose: data.pose_live,
  };

  // Renderizar no modelo 3D
  if (window.draw3DPlatform) {
    window.draw3DPlatform(containerId, renderData);
  }

  // Atualizar medidas dos pistões
  if (window.updatePistonMeasures) {
    window.updatePistonMeasures('piston-live', renderData.actuators);
  }

  // Callback customizado (se fornecido)
  if (typeof customCallback === 'function') {
    customCallback(data, renderData);
  }
}

// ========== Throttle de Processamento ==========

/**
 * Cria um processador de telemetria com throttle
 * @param {Function} processor - Função de processamento
 * @param {number} interval - Intervalo de throttle em ms (padrão: 33ms = ~30 FPS)
 * @returns {Function} Função processadora com throttle
 */
function createThrottledTelemetryProcessor(processor, interval = 33) {
  let lastUpdate = 0;
  let lastMessage = null;

  return function (data) {
    const now = performance.now();

    // Armazena a última mensagem
    lastMessage = data;

    // Se ainda não passou o intervalo, aguarda
    if (now - lastUpdate < interval) {
      return;
    }

    // Processa a última mensagem acumulada
    lastUpdate = now;
    if (lastMessage) {
      processor(lastMessage);
      lastMessage = null;
    }
  };
}

// ========== Exportar para uso global ==========
window.BASE_POINTS_FIXED = BASE_POINTS_FIXED;
window.normalizeTelemetry = normalizeTelemetry;
window.reconstructPlatformPoints = reconstructPlatformPoints;
window.applyLiveTelemetry = applyLiveTelemetry;
window.createThrottledTelemetryProcessor = createThrottledTelemetryProcessor;
