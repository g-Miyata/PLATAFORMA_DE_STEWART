/**
 * ws-utils.js - Utilitários WebSocket avançados
 * Plataforma de Stewart - IFSP
 */

// ========== Criação de Handler com Throttle ==========

/**
 * Cria um handler de WebSocket com throttle automático
 * @param {Function} callback - Função a ser chamada com os dados processados
 * @param {number} interval - Intervalo de throttle em ms (padrão: 33ms = ~30 FPS)
 * @returns {Function} Handler onmessage configurado
 */
function createThrottledWSHandler(callback, interval = 33) {
  let lastUpdate = 0;
  let lastMessage = null;

  return function (event) {
    const now = performance.now();

    // Armazena a última mensagem
    lastMessage = event.data;

    // Se ainda não passou o intervalo, aguarda
    if (now - lastUpdate < interval) {
      return;
    }

    // Processa a última mensagem acumulada
    lastUpdate = now;
    if (lastMessage) {
      try {
        const data = JSON.parse(lastMessage);
        callback(data);
      } catch (err) {
        console.error('❌ Erro ao parsear mensagem WS:', err);
      }
      lastMessage = null;
    }
  };
}

// ========== WebSocket com Auto-Reconnect ==========

/**
 * Cria um WebSocket com auto-reconnect e throttle
 * @param {string} url - URL do WebSocket
 * @param {Object} options - Opções de configuração
 * @param {Function} options.onMessage - Callback para mensagens
 * @param {Function} options.onOpen - Callback quando conectado
 * @param {Function} options.onClose - Callback quando desconectado
 * @param {Function} options.onError - Callback para erros
 * @param {number} options.throttle - Intervalo de throttle em ms (padrão: 33)
 * @param {number} options.reconnectDelay - Delay para reconexão em ms (padrão: 2000)
 * @param {boolean} options.autoReconnect - Reconectar automaticamente (padrão: true)
 * @returns {Object} Objeto com controles do WebSocket
 */
function createAutoReconnectWS(url, options = {}) {
  const { onMessage = () => {}, onOpen = () => {}, onClose = () => {}, onError = () => {}, throttle = 33, reconnectDelay = 2000, autoReconnect = true } = options;

  let ws = null;
  let reconnectTimer = null;
  let shouldReconnect = autoReconnect;
  let isConnected = false;

  function connect() {
    if (ws) {
      try {
        ws.close();
      } catch (_) {}
      ws = null;
    }

    console.log(`🔌 Conectando WebSocket: ${url}`);

    try {
      ws = new WebSocket(url);
    } catch (e) {
      console.error('❌ Erro ao criar WebSocket:', e);
      scheduleReconnect();
      return null;
    }

    // Handler com throttle
    ws.onmessage = createThrottledWSHandler(onMessage, throttle);

    ws.onopen = () => {
      console.log('✅ WebSocket conectado');
      isConnected = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      onOpen();
    };

    ws.onclose = () => {
      console.log('🔌 WebSocket desconectado');
      isConnected = false;
      onClose();
      scheduleReconnect();
    };

    ws.onerror = (err) => {
      console.error('❌ WebSocket error:', err);
      onError(err);
    };

    return ws;
  }

  function scheduleReconnect() {
    if (!shouldReconnect) {
      console.log('⏸ Auto-reconnect desabilitado');
      return;
    }

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }

    console.log(`⏰ Reagendando reconexão em ${reconnectDelay}ms...`);
    reconnectTimer = setTimeout(() => {
      connect();
    }, reconnectDelay);
  }

  function disconnect() {
    shouldReconnect = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
    isConnected = false;
    console.log('🛑 WebSocket desconectado manualmente');
  }

  function send(data) {
    if (!ws || !isConnected) {
      console.warn('⚠️ WebSocket não conectado, não foi possível enviar:', data);
      return false;
    }

    try {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      ws.send(payload);
      return true;
    } catch (err) {
      console.error('❌ Erro ao enviar mensagem:', err);
      return false;
    }
  }

  // Conectar imediatamente
  connect();

  // Retornar controles
  return {
    get connected() {
      return isConnected;
    },
    get instance() {
      return ws;
    },
    connect,
    disconnect,
    send,
    enableAutoReconnect() {
      shouldReconnect = true;
    },
    disableAutoReconnect() {
      shouldReconnect = false;
    },
  };
}

// ========== Monitor de Performance FPS ==========

/**
 * Inicia monitoramento de FPS no console
 * @param {boolean} enabled - Se deve logar FPS (padrão: true)
 * @returns {Function} Função para parar o monitor
 */
function startFPSMonitor(enabled = true) {
  if (!enabled) {
    return () => {}; // Retorna função vazia
  }

  let frameCount = 0;
  let lastFPSCheck = performance.now();
  let animationId = null;
  let running = true;

  function monitor() {
    if (!running) return;

    frameCount++;
    const now = performance.now();

    if (now - lastFPSCheck >= 1000) {
      const fps = Math.round((frameCount * 1000) / (now - lastFPSCheck));
      console.log(`📊 FPS: ${fps}`);
      frameCount = 0;
      lastFPSCheck = now;
    }

    animationId = requestAnimationFrame(monitor);
  }

  // Iniciar
  animationId = requestAnimationFrame(monitor);

  // Retornar função para parar
  return function stopMonitor() {
    running = false;
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    console.log('⏹ Monitor FPS parado');
  };
}

// ========== Rate Limiter ==========

/**
 * Cria um limitador de taxa para chamadas de função
 * @param {Function} fn - Função a ser limitada
 * @param {number} interval - Intervalo mínimo entre chamadas em ms
 * @returns {Function} Função com rate limit aplicado
 */
function rateLimit(fn, interval) {
  let lastCall = 0;
  let pending = null;

  return function (...args) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    // Limpa timeout pendente
    if (pending) {
      clearTimeout(pending);
      pending = null;
    }

    // Se passou tempo suficiente, executa imediatamente
    if (timeSinceLastCall >= interval) {
      lastCall = now;
      return fn.apply(this, args);
    }

    // Senão, agenda para executar no próximo intervalo disponível
    const delay = interval - timeSinceLastCall;
    return new Promise((resolve) => {
      pending = setTimeout(() => {
        lastCall = Date.now();
        resolve(fn.apply(this, args));
        pending = null;
      }, delay);
    });
  };
}

// ========== Exportar para uso global ==========
window.createThrottledWSHandler = createThrottledWSHandler;
window.createAutoReconnectWS = createAutoReconnectWS;
window.startFPSMonitor = startFPSMonitor;
window.rateLimit = rateLimit;
