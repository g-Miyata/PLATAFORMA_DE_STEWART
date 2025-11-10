/**
 * console-utils.js - Utilitários para console RX/TX
 * Plataforma de Stewart - IFSP
 */

function logConsole(text, type = 'info') {
  const consoleEl = document.getElementById('console');
  if (!consoleEl) return;

  const line = document.createElement('div');
  line.className = `console-line console-${type}`;

  const timestamp = new Date().toLocaleTimeString('pt-BR');
  const prefix = type === 'tx' ? '→ TX' : type === 'rx' ? '← RX' : '  ';
  line.textContent = `[${timestamp}] ${prefix}: ${text}`;

  consoleEl.appendChild(line);
  consoleEl.scrollTop = consoleEl.scrollHeight;

  // Limita a 500 linhas
  while (consoleEl.children.length > 500) {
    consoleEl.removeChild(consoleEl.firstChild);
  }
}

// Exporta para uso global
window.logConsole = logConsole;
