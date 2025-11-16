/**
 * motion-logic.js - Lógica de rotinas de movimento
 * Plataforma de Stewart - IFSP
 *
 * Funcionalidades:
 * - Gerenciamento de rotinas de movimento (start, stop, status)
 * - Gráficos em tempo real com Chart.js
 * - Gravação e exportação de dados (IndexedDB + CSV)
 * - WebSocket para atualização de status e telemetria
 */

window.addEventListener('beforeunload', () => {
  try {
    stopMotionRoutine();
  } catch (e) {
    console.warn('Erro ao parar rotina:', e);
  }
  try {
    stopMotionChart();
  } catch (e) {
    console.warn('Erro ao parar gráfico:', e);
  }
});


// ========== Variáveis Globais ==========
let motionChartCmd = null;
let motionChartReal = null;
let motionDB = null;
const MOTION_DB_NAME = 'MotionTrajectoryDB';
const MOTION_DB_VERSION = 1;
const MOTION_STORE_NAME = 'motion_data';

// Configuração da janela de visualização
const CHART_WINDOW_SECONDS = 30;
const MAX_VISIBLE_POINTS = 500;
let maxDataPoints = MAX_VISIBLE_POINTS;
let motionStartTimestamp = null;
let chartRecording = false;
let motionChartData = [];
let isManualControl = false; // Flag para controle manual vs automático

// Variáveis para batch writes no IndexedDB
let dbWriteBuffer = [];
let dbWriteTimer = null;
const DB_BATCH_SIZE = 10;
const DB_BATCH_INTERVAL = 500;

// Variáveis de controle de status
let motionStatusInterval = null;

// OTIMIZAÇÃO: Throttle do WebSocket
const WS_UPDATE_INTERVAL = 33; // ~30 FPS
let lastWSUpdate = 0;
let lastWSMessage = null;

// Contadores de gravação
let saveAttempts = 0;
let saveSuccesses = 0;

// Cores dos pistões
const MOTION_COLORS = {
  1: { cmd: 'rgba(59, 130, 246, 1)', real: 'rgba(59, 130, 246, 0.8)' },
  2: { cmd: 'rgba(168, 85, 247, 1)', real: 'rgba(168, 85, 247, 0.8)' },
  3: { cmd: 'rgba(236, 72, 153, 1)', real: 'rgba(236, 72, 153, 0.8)' },
  4: { cmd: 'rgba(249, 115, 22, 1)', real: 'rgba(249, 115, 22, 0.8)' },
  5: { cmd: 'rgba(20, 184, 166, 1)', real: 'rgba(20, 184, 166, 0.8)' },
  6: { cmd: 'rgba(99, 102, 241, 1)', real: 'rgba(99, 102, 241, 0.8)' },
};

// Configuração dos presets
const MOTION_PRESET_CONFIG = {
  sine_z: {
    title: 'Senoide Vertical (Z)',
    routine: 'sine_axis',
    axis: 'z',
    defaultParams: ['amp', 'hz', 'duration_s'],
  },
  circle_xy: {
    title: 'Círculo XY',
    routine: 'circle_xy',
    defaultParams: ['ax', 'ay', 'hz', 'duration_s'],
  },
  heave_pitch: {
    title: 'Heave & Pitch',
    routine: 'heave_pitch',
    defaultParams: ['amp', 'ay', 'hz', 'duration_s'],
  },
  sine_pitch: {
    title: 'Senoide Pitch',
    routine: 'sine_axis',
    axis: 'pitch',
    defaultParams: ['amp', 'hz', 'duration_s'],
  },
  sine_roll: {
    title: 'Senoide Roll',
    routine: 'sine_axis',
    axis: 'roll',
    defaultParams: ['amp', 'hz', 'duration_s'],
  },
  helix: {
    title: 'Helix (Espiral)',
    routine: 'helix',
    defaultParams: ['ax', 'ay', 'z_amp_mm', 'z_cycles', 'hz', 'duration_s'],
  },
};

// ========== IndexedDB Functions ==========
function initMotionDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MOTION_DB_NAME, MOTION_DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      motionDB = request.result;
      resolve(motionDB);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(MOTION_STORE_NAME)) {
        const objectStore = db.createObjectStore(MOTION_STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        objectStore.createIndex('timestamp', 'timestamp', {
          unique: false,
        });
      }
    };
  });
}

async function saveMotionDataToDB(data) {
  if (!motionDB || !chartRecording) return;

  saveAttempts++;

  return new Promise((resolve, reject) => {
    try {
      const transaction = motionDB.transaction([MOTION_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(MOTION_STORE_NAME);

      transaction.oncomplete = () => {
        saveSuccesses++;

        resolve();
      };

      transaction.onerror = () => {
        console.error('❌ Erro na transação:', transaction.error);
        reject(transaction.error);
      };

      transaction.onabort = () => {
        console.error('❌ Transação abortada:', transaction.error);
        reject(new Error('Transação abortada'));
      };

      const request = store.add(data);

      request.onerror = () => {
        console.error('❌ Erro no add():', request.error);
        console.error('   Dados:', data);
      };
    } catch (error) {
      console.error('❌ Exceção em saveMotionDataToDB:', error);
      reject(error);
    }
  });
}

async function flushDBWriteBuffer() {
  if (dbWriteBuffer.length === 0) return;

  const batch = [...dbWriteBuffer];
  dbWriteBuffer = [];

  if (dbWriteTimer) {
    clearTimeout(dbWriteTimer);
    dbWriteTimer = null;
  }

  try {
    await Promise.all(batch.map((data) => saveMotionDataToDB(data)));
  } catch (error) {
    console.error('❌ Erro ao gravar batch no IndexedDB:', error);
  }
}

async function getAllMotionDataFromDB() {
  if (!motionDB) return [];

  return new Promise((resolve, reject) => {
    const transaction = motionDB.transaction([MOTION_STORE_NAME], 'readonly');
    const store = transaction.objectStore(MOTION_STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

async function clearMotionDataFromDB() {
  if (!motionDB) return;

  return new Promise((resolve, reject) => {
    const transaction = motionDB.transaction([MOTION_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(MOTION_STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ========== Chart Functions ==========
function initMotionCharts() {
  // Gráfico 1: Comandos (Setpoints)
  const ctxCmd = document.getElementById('motion-chart-cmd').getContext('2d');
  const cmdDatasets = [];
  for (let i = 1; i <= 6; i++) {
    cmdDatasets.push({
      label: `Pistão ${i} (CMD)`,
      data: [],
      borderColor: MOTION_COLORS[i].cmd,
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderDash: [5, 5],
      pointRadius: 0,
      tension: 0.4,
    });
  }

  motionChartCmd = new Chart(ctxCmd, {
    type: 'line',
    data: { datasets: cmdDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      normalized: true,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Tempo (s)', color: '#9ca3af' },
          ticks: { color: '#9ca3af' },
          grid: { color: '#374151' },
        },
        y: {
          title: {
            display: true,
            text: 'Setpoint (mm)',
            color: '#9ca3af',
          },
          ticks: { color: '#9ca3af' },
          grid: { color: '#374151' },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
        },
        zoom: {
          pan: { enabled: true, mode: 'xy' },
          zoom: {
            wheel: { enabled: true, speed: 0.1 },
            pinch: { enabled: true },
            mode: 'xy',
          },
        },
      },
    },
  });

  // Gráfico 2: Posições Reais
  const ctxReal = document.getElementById('motion-chart-real').getContext('2d');
  const realDatasets = [];
  for (let i = 1; i <= 6; i++) {
    realDatasets.push({
      label: `Pistão ${i} (Real)`,
      data: [],
      borderColor: MOTION_COLORS[i].real,
      backgroundColor: MOTION_COLORS[i].real.replace('0.8', '0.1'),
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.4,
      fill: false,
    });
  }

  motionChartReal = new Chart(ctxReal, {
    type: 'line',
    data: { datasets: realDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      normalized: true,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Tempo (s)', color: '#9ca3af' },
          ticks: { color: '#9ca3af' },
          grid: { color: '#374151' },
        },
        y: {
          title: {
            display: true,
            text: 'Posição Real (mm)',
            color: '#9ca3af',
          },
          ticks: { color: '#9ca3af' },
          grid: { color: '#374151' },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
        },
        zoom: {
          pan: { enabled: true, mode: 'xy' },
          zoom: {
            wheel: { enabled: true, speed: 0.1 },
            pinch: { enabled: true },
            mode: 'xy',
          },
        },
      },
    },
  });
}

function startMotionChart() {

  chartRecording = true;
  motionChartData = [];
  motionStartTimestamp = null;
  isManualControl = false; // Reset flag ao iniciar nova gravação

  if (motionChartCmd) {
    motionChartCmd.data.datasets.forEach((ds) => (ds.data = []));
    motionChartCmd.update('none');
  }
  if (motionChartReal) {
    motionChartReal.data.datasets.forEach((ds) => (ds.data = []));
    motionChartReal.update('none');
  }

  clearMotionDataFromDB()
  .then(() => {/* ...existing code... */})
    .catch((error) => console.error('❌ Erro ao limpar IndexedDB:', error));

  const btnStart = document.getElementById('btn-start-motion-chart');
  const btnStop = document.getElementById('btn-stop-motion-chart');
  const status = document.getElementById('motion-chart-status');

  if (btnStart) {
    btnStart.classList.add('hidden');
  } else {
    console.error('❌ Botão btn-start-motion-chart não encontrado!');
  }

  if (btnStop) {
    btnStop.classList.remove('hidden');
  } else {
    console.error('❌ Botão btn-stop-motion-chart não encontrado!');
  }

  if (status) {
    status.textContent = `🔴 Gravando... (janela de ${CHART_WINDOW_SECONDS}s)`;
  }

  showToast('Gravação dos gráficos iniciada', 'success');
}

function stopMotionChart() {

  chartRecording = false;
  isManualControl = true; // Marca como controle manual (usuário pausou)

  const btnStart = document.getElementById('btn-start-motion-chart');
  const btnStop = document.getElementById('btn-stop-motion-chart');
  const status = document.getElementById('motion-chart-status');

  if (btnStart) {
    btnStart.classList.remove('hidden');
  } else {
    console.error('❌ Botão btn-start-motion-chart não encontrado!');
  }

  if (btnStop) {
    btnStop.classList.add('hidden');
  } else {
    console.error('❌ Botão btn-stop-motion-chart não encontrado!');
  }

  if (status) {
    status.textContent = `⏸ Pausado (${motionChartData.length} pontos gravados)`;
  }

  showToast(`Gravação pausada - ${motionChartData.length} pontos gravados`, 'info');
}

function resetMotionChartZoom(type) {
  if (type === 'cmd' && motionChartCmd) {
    motionChartCmd.resetZoom();
  } else if (type === 'real' && motionChartReal) {
    motionChartReal.resetZoom();
  }
}

function toggleMotionPistonVisibility(type, pistonNum) {
  const chart = type === 'cmd' ? motionChartCmd : motionChartReal;
  if (!chart) {
    console.warn(`⚠️ motionChart${type} não inicializado`);
    return;
  }

  const checkbox = document.getElementById(`motion-${type}-piston-${pistonNum}`);
  if (!checkbox) {
    console.error(`❌ Checkbox motion-${type}-piston-${pistonNum} não encontrado`);
    return;
  }

  const isVisible = checkbox.checked;
  const datasetIndex = pistonNum - 1;

  if (!chart.data.datasets[datasetIndex]) {
    console.error(`❌ Dataset não encontrado no índice ${datasetIndex}`);
    return;
  }

  chart.data.datasets[datasetIndex].hidden = !isVisible;
  chart.update();
}

function toggleAllMotionPistons(type, visible) {
  for (let i = 1; i <= 6; i++) {
    const checkbox = document.getElementById(`motion-${type}-piston-${i}`);
    if (checkbox) {
      checkbox.checked = visible;
      toggleMotionPistonVisibility(type, i);
    }
  }
}

function clearMotionChart() {
  chartRecording = false;
  motionChartData = [];
  motionStartTimestamp = null;
  saveAttempts = 0;
  saveSuccesses = 0;
  clearMotionDataFromDB();

  if (motionChartCmd) {
    motionChartCmd.data.datasets.forEach((dataset) => {
      dataset.data = [];
    });
    motionChartCmd.update('none');
    motionChartCmd.resetZoom();
  }

  if (motionChartReal) {
    motionChartReal.data.datasets.forEach((dataset) => {
      dataset.data = [];
    });
    motionChartReal.update('none');
    motionChartReal.resetZoom();
  }

  document.getElementById('btn-start-motion-chart').classList.remove('hidden');
  document.getElementById('btn-stop-motion-chart').classList.add('hidden');
  document.getElementById('motion-chart-status').textContent = 'Pronto para iniciar gravação';

  showToast('Gráficos limpos com sucesso', 'success');
}

async function exportMotionToCSV() {
  try {
    const allData = await getAllMotionDataFromDB();

    if (allData.length === 0) {
      showToast('Nenhum dado de movimento para exportar!', 'warning');
      return;
    }

    let csvContent = 'Timestamp,Routine,X_cmd,Y_cmd,Z_cmd,Roll_cmd,Pitch_cmd,Yaw_cmd,' + 'P1_cmd,P2_cmd,P3_cmd,P4_cmd,P5_cmd,P6_cmd,' + 'P1_real,P2_real,P3_real,P4_real,P5_real,P6_real\n';

    allData.forEach((row) => {
      const timestamp = new Date(row.timestamp).toISOString();
      const routine = row.routine || 'unknown';
      const pose = row.pose || {};
      const cmd = row.commanded || [];
      const real = row.actual || [];

      csvContent += `${timestamp},${routine},` + `${pose.x || 0},${pose.y || 0},${pose.z || 0},` + `${pose.roll || 0},${pose.pitch || 0},${pose.yaw || 0},` + `${cmd.join(',')},${real.join(',')}\n`;
    });

    const blob = new Blob([csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const filename = `motion_trajectory_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`CSV exportado com sucesso! ${allData.length} registros salvos`, 'success');
  } catch (error) {
    console.error('❌ Erro ao exportar CSV:', error);
    showToast(`Erro ao exportar CSV: ${error.message}`, 'error');
  }
}

function updateMotionGraph(timestamp, routine, pose, commandedLengths, actualLengths) {
  if (!chartRecording) {
    return;
  }

  if (!motionChartCmd || !motionChartReal) {
    console.warn('⚠️ updateMotionGraph: gráficos não inicializados');
    return;
  }

  const now = Date.now();

  if (motionStartTimestamp === null) {
    motionStartTimestamp = now;
  }

  const timeInSeconds = timestamp / 1000.0;

  const dataPoint = {
    timestamp: now,
    routine: routine,
    pose: pose,
    commanded: commandedLengths,
    actual: actualLengths,
  };

  motionChartData.push(dataPoint);

  // Batch writes no IndexedDB
  dbWriteBuffer.push(dataPoint);

  if (dbWriteBuffer.length >= DB_BATCH_SIZE) {
    flushDBWriteBuffer();
  } else if (!dbWriteTimer) {
    dbWriteTimer = setTimeout(flushDBWriteBuffer, DB_BATCH_INTERVAL);
  }

  // Atualizar gráficos
  commandedLengths.forEach((length, i) => {
    motionChartCmd.data.datasets[i].data.push({
      x: timeInSeconds,
      y: length,
    });
  });

  actualLengths.forEach((length, i) => {
    motionChartReal.data.datasets[i].data.push({
      x: timeInSeconds,
      y: length,
    });
  });

  if (motionChartData.length > maxDataPoints) {
    motionChartData.shift();
  }

  // Janela deslizante
  const windowStart = timeInSeconds - CHART_WINDOW_SECONDS;

  motionChartCmd.data.datasets.forEach((dataset) => {
    const cutIndex = dataset.data.findIndex((d) => d.x >= windowStart);
    if (cutIndex > 0) {
      dataset.data = dataset.data.slice(cutIndex);
    }

    if (dataset.data.length > MAX_VISIBLE_POINTS) {
      const removeCount = dataset.data.length - MAX_VISIBLE_POINTS;
      dataset.data.splice(0, removeCount);
    }
  });

  motionChartReal.data.datasets.forEach((dataset) => {
    const cutIndex = dataset.data.findIndex((d) => d.x >= windowStart);
    if (cutIndex > 0) {
      dataset.data = dataset.data.slice(cutIndex);
    }

    if (dataset.data.length > MAX_VISIBLE_POINTS) {
      const step = Math.ceil(dataset.data.length / MAX_VISIBLE_POINTS);
      const decimated = [];
      for (let i = 0; i < dataset.data.length - 1; i += step) {
        decimated.push(dataset.data[i]);
      }
      decimated.push(dataset.data[dataset.data.length - 1]);
      dataset.data = decimated;
    }
  });

  motionChartCmd.update('none');
  motionChartReal.update('none');

  document.getElementById('motion-chart-status').textContent = `🔴 Gravando... (${motionChartData.length} pontos em memória, janela de ${CHART_WINDOW_SECONDS}s)`;
}

// Atualiza apenas o gráfico de COMANDOS (CMD)
function updateMotionGraphCmd(timestamp, routine, pose, commandedLengths) {
  if (!chartRecording || !motionChartCmd) {
    return;
  }

  const now = Date.now();

  if (motionStartTimestamp === null) {
    motionStartTimestamp = now;
  }

  const timeInSeconds = timestamp / 1000.0;

  const dataPoint = {
    timestamp: now,
    routine: routine,
    pose: pose,
    commanded: commandedLengths,
  };

  motionChartData.push(dataPoint);

  // Batch writes no IndexedDB
  dbWriteBuffer.push(dataPoint);

  if (dbWriteBuffer.length >= DB_BATCH_SIZE) {
    flushDBWriteBuffer();
  } else if (!dbWriteTimer) {
    dbWriteTimer = setTimeout(flushDBWriteBuffer, DB_BATCH_INTERVAL);
  }

  // Atualizar apenas gráfico CMD
  commandedLengths.forEach((length, i) => {
    motionChartCmd.data.datasets[i].data.push({
      x: timeInSeconds,
      y: length,
    });
  });

  if (motionChartData.length > maxDataPoints) {
    motionChartData.shift();
  }

  // Janela deslizante para CMD
  const windowStart = timeInSeconds - CHART_WINDOW_SECONDS;

  motionChartCmd.data.datasets.forEach((dataset) => {
    const cutIndex = dataset.data.findIndex((d) => d.x >= windowStart);
    if (cutIndex > 0) {
      dataset.data = dataset.data.slice(cutIndex);
    }

    if (dataset.data.length > MAX_VISIBLE_POINTS) {
      const step = Math.ceil(dataset.data.length / MAX_VISIBLE_POINTS);
      const decimated = [];
      for (let i = 0; i < dataset.data.length - 1; i += step) {
        decimated.push(dataset.data[i]);
      }
      decimated.push(dataset.data[dataset.data.length - 1]);
      dataset.data = decimated;
    }
  });

  motionChartCmd.update('none');

  document.getElementById('motion-chart-status').textContent = `🔴 Gravando... (${motionChartData.length} pontos em memória, janela de ${CHART_WINDOW_SECONDS}s)`;
}

// Atualiza apenas o gráfico de valores REAIS
function updateMotionGraphReal(actualLengths) {
  if (!chartRecording || !motionChartReal) {
    return;
  }

  const now = Date.now();

  // Inicializa timestamp de início se for o primeiro ponto (igual actuators.js)
  if (motionStartTimestamp === null) {
    motionStartTimestamp = now;
  }

  // Calcula tempo relativo em relação ao primeiro ponto (igual actuators.js)
  const timeInSeconds = (now - motionStartTimestamp) / 1000.0;

  // Atualizar gráfico REAL
  actualLengths.forEach((length, i) => {
    motionChartReal.data.datasets[i].data.push({
      x: timeInSeconds,
      y: length,
    });
  });

  // Janela deslizante para REAL
  const windowStart = timeInSeconds - CHART_WINDOW_SECONDS;

  motionChartReal.data.datasets.forEach((dataset) => {
    const cutIndex = dataset.data.findIndex((d) => d.x >= windowStart);
    if (cutIndex > 0) {
      dataset.data = dataset.data.slice(cutIndex);
    }

    if (dataset.data.length > MAX_VISIBLE_POINTS) {
      const step = Math.ceil(dataset.data.length / MAX_VISIBLE_POINTS);
      const decimated = [];
      for (let i = 0; i < dataset.data.length - 1; i += step) {
        decimated.push(dataset.data[i]);
      }
      decimated.push(dataset.data[dataset.data.length - 1]);
      dataset.data = decimated;
    }
  });

  motionChartReal.update('none');
}

// ========== Motion Control Functions ==========
async function startMotionRoutine(card) {

  const presetKey = card.dataset.preset;

  const config = MOTION_PRESET_CONFIG[presetKey];

  const payload = { routine: config.routine };
  if (config.axis) payload.axis = config.axis;

  config.defaultParams.forEach((param) => {
    const input = card.querySelector(`[data-param="${param}"]`);
    if (input) payload[param] = parseFloat(input.value);
  });

  if (config.extraDefaults) Object.assign(payload, config.extraDefaults);

  try {
    const statusDot = document.getElementById('motion-status-dot');
    const statusText = document.getElementById('motion-status-text');
    const elapsedText = document.getElementById('motion-elapsed');


    statusDot.className = 'w-3 h-3 rounded-full bg-yellow-500 pulse-dot';
    statusText.textContent = 'Indo para HOME...';
    elapsedText.textContent = '00:00';

    const response = await fetch(`${API_BASE}/motion/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (response.ok) {
      card.classList.add('active');
      showToast(`Rotina ${config.title} iniciada`, 'success');

      // Verificar status continuamente até rotina começar de fato
      let homeCheckAttempts = 0;
      const maxHomeCheckAttempts = 10;

      const checkHomeComplete = async () => {
        try {
          const statusResp = await fetch(`${API_BASE}/motion/status`);
          const status = await statusResp.json();

          homeCheckAttempts++;

          // Se rotina está rodando E já passou tempo suficiente (elapsed > 0.5s)
          if (status.running && status.elapsed > 0.5) {
            statusText.textContent = 'Rodando';
            statusDot.className = 'w-3 h-3 rounded-full motion-status-running';
            startMotionMonitoring();
          } else if (homeCheckAttempts < maxHomeCheckAttempts) {
            // Ainda em fase de HOME - verificar novamente em 300ms
            setTimeout(checkHomeComplete, 300);
          } else {
            // Timeout - assumir que já começou
            console.warn('⚠️ Timeout esperando HOME - assumindo rotina iniciada');
            statusText.textContent = 'Rodando';
            statusDot.className = 'w-3 h-3 rounded-full motion-status-running';
            startMotionMonitoring();
          }
        } catch (error) {
          console.error('❌ Erro ao verificar status pós-HOME:', error);
          // Em caso de erro, assumir que começou após timeout
          if (homeCheckAttempts < maxHomeCheckAttempts) {
            setTimeout(checkHomeComplete, 300);
          } else {
            statusText.textContent = 'Rodando';
            statusDot.className = 'w-3 h-3 rounded-full motion-status-running';
            startMotionMonitoring();
          }
        }
      };

      // Iniciar verificação após pequeno delay (dar tempo pro backend processar)
      setTimeout(checkHomeComplete, 500);
    } else {
      statusDot.className = 'w-3 h-3 rounded-full motion-status-stopped';
      statusText.textContent = 'Parado';
      showToast(`Erro: ${data.detail || 'Falha ao iniciar rotina'}`, 'error');
    }
  } catch (error) {
    const statusDot = document.getElementById('motion-status-dot');
    const statusText = document.getElementById('motion-status-text');
    statusDot.className = 'w-3 h-3 rounded-full motion-status-stopped';
    statusText.textContent = 'Parado';
    showToast(`Erro de conexão: ${error.message}`, 'error');
  }
}

async function stopMotionRoutine() {
  try {
    const response = await fetch(`${API_BASE}/motion/stop`, {
      method: 'POST',
    });
    if (response.ok) {
      showToast('Rotina de movimento parada', 'info');
      stopMotionMonitoring();
      updateMotionUIState(false);
    } else {
      showToast('Erro ao parar rotina', 'error');
    }
  } catch (error) {
    showToast(`Erro: ${error.message}`, 'error');
  }
}

function startMotionMonitoring() {
  if (motionStatusInterval) return;
  motionStatusInterval = setInterval(checkMotionStatus, 500);
}

function stopMotionMonitoring() {
  if (motionStatusInterval) {
    clearInterval(motionStatusInterval);
    motionStatusInterval = null;
  }
}

async function checkMotionStatus() {
  try {
    const response = await fetch(`${API_BASE}/motion/status`);
    const status = await response.json();

    if (status.running) {
      updateMotionUIState(true, status);
    } else {
      updateMotionUIState(false);
      stopMotionMonitoring();
    }
  } catch (error) {
    console.error('Erro ao verificar status da rotina:', error);
  }
}

function updateMotionUIState(running, status = null) {
  const statusDot = document.getElementById('motion-status-dot');
  const statusText = document.getElementById('motion-status-text');
  const btnStop = document.getElementById('btn-motion-stop');

  document.querySelectorAll('.motion-preset-card').forEach((card) => {
    card.classList.remove('active');
  });

  if (running && status) {
    statusDot.className = 'w-3 h-3 rounded-full motion-status-running';
    statusText.textContent = 'Rodando';
    btnStop.disabled = false;

    startMotionGraph();

    const presetKey = findMotionPresetKey(status.routine, status.params);
    if (presetKey) {
      const card = document.querySelector(`[data-preset="${presetKey}"]`);
      if (card) card.classList.add('active');
    }
  } else {
    statusDot.className = 'w-3 h-3 rounded-full motion-status-stopped';
    statusText.textContent = 'Parado';
    btnStop.disabled = true;
    document.getElementById('motion-elapsed').textContent = '00:00';

    stopMotionGraph();
  }
}

function findMotionPresetKey(routine, params) {
  for (const [key, config] of Object.entries(MOTION_PRESET_CONFIG)) {
    if (config.routine === routine) {
      if (routine === 'sine_axis' && config.axis === params?.axis) {
        return key;
      } else if (routine !== 'sine_axis') {
        return key;
      }
    }
  }
  return null;
}

function startMotionGraph() {
  // Só inicia automaticamente se não estiver em controle manual
  if (!chartRecording && !isManualControl) {
    startMotionChart();
  } else if (chartRecording) {
  } else if (isManualControl) {
  }
}

function stopMotionGraph() {
  // Só para automaticamente se NÃO estiver em controle manual
  // (se usuário clicou para pausar, não retoma automaticamente)
  if (chartRecording && !isManualControl) {
    stopMotionChart();
  } 
}

// ========== WebSocket Handler Customizado ==========
function setupMotionWebSocket() {
  // Aguarda o WebSocket ser criado pelo common.js
  const checkWS = setInterval(() => {
    if (window.ws && !window.ws._motionHandlerAttached) {
      clearInterval(checkWS);


      // Marca como attached
      window.ws._motionHandlerAttached = true;

      // Sobrescreve o onmessage para processar motion_tick
      window.ws.onmessage = (evt) => {
        const now = performance.now();

        // OTIMIZAÇÃO: Throttle
        if (now - lastWSUpdate < WS_UPDATE_INTERVAL) {
          lastWSMessage = evt.data;
          return;
        }

        lastWSUpdate = now;

        const dataToProcess = lastWSMessage || evt.data;
        lastWSMessage = null;

        try {
          const msg = JSON.parse(dataToProcess);

          // Detectar eventos de motion_tick
          if (msg.type === 'motion_tick' && msg.pose_cmd) {
            // Atualizar timer do movimento
            if (msg.elapsed_ms !== undefined) {
              const elapsedSeconds = Math.floor(msg.elapsed_ms / 1000);
              const minutes = Math.floor(elapsedSeconds / 60);
              const seconds = elapsedSeconds % 60;
              const elapsedEl = document.getElementById('motion-elapsed');
              if (elapsedEl) {
                elapsedEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
              }
            }

            // Atualizar apenas gráfico de COMANDOS (CMD)
            if (msg.actuators_cmd && chartRecording) {
              updateMotionGraphCmd(msg.elapsed_ms || 0, msg.routine || 'unknown', msg.pose_cmd, msg.actuators_cmd);
            }
          } else {
            // Telemetria normal - atualizar gráfico REAL
            if (chartRecording) {
              let realLengths = null;

              // Extrair comprimentos reais da telemetria
              if (msg.actuators && msg.actuators.length >= 6) {
                realLengths = msg.actuators.map((a) => Number(a.length) || 0);
              } else if (msg.actuator_lengths_abs && msg.actuator_lengths_abs.length >= 6) {
                realLengths = msg.actuator_lengths_abs.map((L) => Number(L) || 0);
              } else if (msg.Y1 !== undefined) {
                // Formato Y1-Y6 (posições em mm) - precisa converter para comprimentos absolutos
                const stroke_min = 500; // stroke_min da plataforma
                realLengths = [stroke_min + (Number(msg.Y1) || 0), stroke_min + (Number(msg.Y2) || 0), stroke_min + (Number(msg.Y3) || 0), stroke_min + (Number(msg.Y4) || 0), stroke_min + (Number(msg.Y5) || 0), stroke_min + (Number(msg.Y6) || 0)];
              }

              if (realLengths) {
                // Usa timestamp real (Date.now()) internamente, igual actuators.js
                updateMotionGraphReal(realLengths);
              }
            }
          }
        } catch (e) {
          console.error('❌ Erro ao processar mensagem WS:', e, dataToProcess);
        }
      };

      // Listener para reconexões - remove flag ao desconectar
      window.ws.onclose = (evt) => {

        window.ws._motionHandlerAttached = false;
        scheduleReconnect();
      };
    }
  }, 100);

  // Timeout de 5 segundos
  setTimeout(() => {
    clearInterval(checkWS);
  }, 5000);
}

// ========== Preset HTML Generator ==========
function createPresetHTML(presetKey, config) {
  const presetData = {
    sine_z: {
      color: 'blue',
      icon: 'show_chart',
      description: 'Movimento vertical senoidal',
      params: [
        {
          label: 'Amplitude (mm)',
          name: 'amp',
          value: 10,
          min: 10,
          max: 40,
          step: 0.5,
        },
        {
          label: 'Frequência (Hz)',
          name: 'hz',
          value: 0.5,
          min: 0.1,
          max: 1.5,
          step: 0.05,
        },
        {
          label: 'Duração (s)',
          name: 'duration_s',
          value: 45,
          min: 5,
          max: 300,
          step: 5,
        },
      ],
    },
    circle_xy: {
      color: 'purple',
      icon: 'trip_origin',
      description: 'Movimento circular horizontal',
      params: [
        {
          label: 'Raio X (mm)',
          name: 'ax',
          value: 20,
          min: 10,
          max: 40,
          step: 1,
          grid: true,
        },
        {
          label: 'Raio Y (mm)',
          name: 'ay',
          value: 20,
          min: 10,
          max: 40,
          step: 1,
          grid: true,
        },
        {
          label: 'Frequência (Hz)',
          name: 'hz',
          value: 0.75,
          min: 0.2,
          max: 1.5,
          step: 0.05,
        },
        {
          label: 'Duração (s)',
          name: 'duration_s',
          value: 60,
          min: 5,
          max: 300,
          step: 5,
        },
      ],
    },
    heave_pitch: {
      color: 'orange',
      icon: 'waves',
      description: 'Simulação de onda marítima',
      params: [
        {
          label: 'Amplitude Z (mm)',
          name: 'amp',
          value: 20,
          min: 10,
          max: 25,
          step: 0.5,
        },
        {
          label: 'Amplitude Pitch (°)',
          name: 'ay',
          value: 3.5,
          min: 1.5,
          max: 3.5,
          step: 0.5,
        },
        {
          label: 'Frequência (Hz)',
          name: 'hz',
          value: 0.8,
          min: 0.3,
          max: 0.8,
          step: 0.05,
        },
        {
          label: 'Duração (s)',
          name: 'duration_s',
          value: 40,
          min: 5,
          max: 300,
          step: 5,
        },
      ],
    },
    sine_pitch: {
      color: 'teal',
      icon: 'unfold_more',
      description: 'Balanço frontal angular',
      params: [
        {
          label: 'Amplitude (°)',
          name: 'amp',
          value: 5,
          min: 0.5,
          max: 5,
          step: 0.5,
        },
        {
          label: 'Frequência (Hz)',
          name: 'hz',
          value: 0.8,
          min: 0.1,
          max: 0.8,
          step: 0.05,
        },
        {
          label: 'Duração (s)',
          name: 'duration_s',
          value: 30,
          min: 5,
          max: 300,
          step: 5,
        },
      ],
    },
    sine_roll: {
      color: 'indigo',
      icon: 'unfold_less',
      description: 'Balanço lateral angular',
      params: [
        {
          label: 'Amplitude (°)',
          name: 'amp',
          value: 5,
          min: 0.2,
          max: 5,
          step: 0.5,
        },
        {
          label: 'Frequência (Hz)',
          name: 'hz',
          value: 0.8,
          min: 0.2,
          max: 0.8,
          step: 0.05,
        },
        {
          label: 'Duração (s)',
          name: 'duration_s',
          value: 30,
          min: 5,
          max: 300,
          step: 5,
        },
      ],
    },
    helix: {
      color: 'pink',
      icon: 'cyclone',
      description: 'Parafuso: sobe girando, desce voltando',
      params: [
        {
          label: 'Raio X',
          name: 'ax',
          value: 10,
          min: 10,
          max: 40,
          step: 1,
          grid: true,
        },
        {
          label: 'Raio Y',
          name: 'ay',
          value: 10,
          min: 10,
          max: 40,
          step: 1,
          grid: true,
        },
        {
          label: 'Amp Z (mm)',
          name: 'z_amp_mm',
          value: 10,
          min: 10,
          max: 40,
          step: 0.5,
          grid: true,
        },
        {
          label: 'Ciclos Z',
          name: 'z_cycles',
          value: 1,
          min: 0.2,
          max: 1,
          step: 0.5,
          grid: true,
        },
        {
          label: 'Freq (Hz)',
          name: 'hz',
          value: 0.2,
          min: 0.1,
          max: 1.5,
          step: 0.05,
          grid: true,
        },
        {
          label: 'Duração (s)',
          name: 'duration_s',
          value: 60,
          min: 5,
          max: 300,
          step: 5,
          grid: true,
        },
      ],
    },
  };

  const preset = presetData[presetKey];
  if (!preset) return '';

  const paramsHTML = preset.params
    .map((param) => {
      if (param.grid) {
        return `
        <div>
          <label class="text-xs text-gray-400">${param.label}</label>
          <input
            type="number"
            class="motion-param-input"
            data-param="${param.name}"
            value="${param.value}"
            min="${param.min}"
            max="${param.max}"
            step="${param.step}"
          />
        </div>
      `;
      } else {
        return `
        <div>
          <label class="text-xs text-gray-400">${param.label}</label>
          <input
            type="number"
            class="motion-param-input"
            data-param="${param.name}"
            value="${param.value}"
            min="${param.min}"
            max="${param.max}"
            step="${param.step}"
          />
        </div>
      `;
      }
    })
    .join('');

  // Detecta se precisa de grid 2 colunas
  const hasGrid = preset.params.some((p) => p.grid);
  const gridClass = hasGrid ? 'grid grid-cols-2 gap-2' : '';

  return `
    <div class="motion-preset-card" data-preset="${presetKey}">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-base font-bold text-${preset.color}-400 flex items-center gap-2">
          <span class="material-icons">${preset.icon}</span>
          <span>${config.title}</span>
        </h3>
      </div>
      <p class="text-gray-400 text-xs mb-3">
        ${preset.description}
      </p>
      <div class="space-y-2 mb-3">
        ${hasGrid ? `<div class="${gridClass}">${paramsHTML}</div>` : paramsHTML}
      </div>
      <button
        class="btn-start-motion w-full bg-${preset.color}-600 hover:bg-${preset.color}-700 text-white py-2 rounded-lg font-semibold text-sm transition flex items-center justify-center gap-2"
      >
        <span class="material-icons text-sm">play_arrow</span>
        <span>Iniciar</span>
      </button>
    </div>
  `;
}

function loadPresets() {
  const container = document.getElementById('presets-container');
  if (!container) return;

  let presetsHTML = '';
  for (const [key, config] of Object.entries(MOTION_PRESET_CONFIG)) {
    presetsHTML += createPresetHTML(key, config);
  }

  container.innerHTML = presetsHTML;

  // Adicionar event listeners aos botões

  const buttons = document.querySelectorAll('.btn-start-motion');
 

  buttons.forEach((btn, index) => {
    btn.addEventListener('click', function () {

      const card = this.closest('.motion-preset-card');
  
      startMotionRoutine(card);
    });
  });
}

// ========== Initialization ==========
window.addEventListener('DOMContentLoaded', async () => {


  // Inicializar controles seriais comuns
  initCommonSerialControls();

  // Inicializar IndexedDB
  try {
    await initMotionDB();

  } catch (error) {
    console.error('❌ Erro ao inicializar MotionDB:', error);
  }

  // Inicializar gráficos
  initMotionCharts();

  // Carregar presets

  loadPresets();

  // Setup event listeners
  const btnMotionStop = document.getElementById('btn-motion-stop');
  const btnStartChart = document.getElementById('btn-start-motion-chart');
  const btnStopChart = document.getElementById('btn-stop-motion-chart');
  const btnClearChart = document.getElementById('btn-clear-motion-chart');
  const btnExportCSV = document.getElementById('btn-export-motion-csv');
  const btnResetZoomCmd = document.getElementById('btn-reset-zoom-cmd');
  const btnResetZoomReal = document.getElementById('btn-reset-zoom-real');

  if (btnMotionStop) {
    btnMotionStop.addEventListener('click', stopMotionRoutine);
  } else {
    console.error('❌ Botão btn-motion-stop não encontrado!');
  }

  if (btnStartChart) {
    btnStartChart.addEventListener('click', () => {

      startMotionChart();
    });
  } else {
    console.error('❌ Botão btn-start-motion-chart não encontrado!');
  }

  if (btnStopChart) {
    btnStopChart.addEventListener('click', () => {

      stopMotionChart();
    });
  } else {
    console.error('❌ Botão btn-stop-motion-chart não encontrado!');
  }

  if (btnClearChart) {
    btnClearChart.addEventListener('click', clearMotionChart);
  } else {
    console.error('❌ Botão btn-clear-motion-chart não encontrado!');
  }

  if (btnExportCSV) {
    btnExportCSV.addEventListener('click', exportMotionToCSV);
  } else {
    console.error('❌ Botão btn-export-motion-csv não encontrado!');
  }

  if (btnResetZoomCmd) {
    btnResetZoomCmd.addEventListener('click', () => resetMotionChartZoom('cmd'));
  } else {
    console.error('❌ Botão btn-reset-zoom-cmd não encontrado!');
  }

  if (btnResetZoomReal) {
    btnResetZoomReal.addEventListener('click', () => resetMotionChartZoom('real'));
  } else {
    console.error('❌ Botão btn-reset-zoom-real não encontrado!');
  }

  // Checkbox toggles
  for (let i = 1; i <= 6; i++) {
    const cmdCheckbox = document.getElementById(`motion-cmd-piston-${i}`);
    const realCheckbox = document.getElementById(`motion-real-piston-${i}`);

    if (cmdCheckbox) {
      cmdCheckbox.addEventListener('change', () => toggleMotionPistonVisibility('cmd', i));
    }
    if (realCheckbox) {
      realCheckbox.addEventListener('change', () => toggleMotionPistonVisibility('real', i));
    }
  }

  // Toggle all buttons
  document.getElementById('btn-toggle-all-cmd-on').addEventListener('click', () => toggleAllMotionPistons('cmd', true));
  document.getElementById('btn-toggle-all-cmd-off').addEventListener('click', () => toggleAllMotionPistons('cmd', false));
  document.getElementById('btn-toggle-all-real-on').addEventListener('click', () => toggleAllMotionPistons('real', true));
  document.getElementById('btn-toggle-all-real-off').addEventListener('click', () => toggleAllMotionPistons('real', false));

  // Setup WebSocket customizado (aguarda conexão)
  setupMotionWebSocket();

  // Verificar se há movimento rodando
  await checkMotionStatus();

  // Reconecta o handler do WebSocket quando houver reconexão
  setInterval(() => {
    if (window.ws && !window.ws._motionHandlerAttached) {
      setupMotionWebSocket();
    }
  }, 1000);
});
