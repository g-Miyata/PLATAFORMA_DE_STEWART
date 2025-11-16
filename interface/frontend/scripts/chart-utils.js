/**
 * chart-utils.js - Utilitários para gráficos de telemetria com Chart.js
 * Plataforma de Stewart - IFSP
 */

// Cores dos pistões (compartilhado)
const PISTON_COLORS = {
  1: { y: "rgba(59, 130, 246, 0.8)", sp: "rgba(59, 130, 246, 1)" }, // blue
  2: { y: "rgba(168, 85, 247, 0.8)", sp: "rgba(168, 85, 247, 1)" }, // purple
  3: { y: "rgba(236, 72, 153, 0.8)", sp: "rgba(236, 72, 153, 1)" }, // pink
  4: { y: "rgba(249, 115, 22, 0.8)", sp: "rgba(249, 115, 22, 1)" }, // orange
  5: { y: "rgba(20, 184, 166, 0.8)", sp: "rgba(20, 184, 166, 1)" }, // teal
  6: { y: "rgba(99, 102, 241, 0.8)", sp: "rgba(99, 102, 241, 1)" }, // indigo
};

// Variáveis globais do gráfico
let telemetryChart = null;
let chartRecording = false;
let chartData = [];
const maxDataPoints = 500; // Máximo de pontos no gráfico (evita lag)
let db = null;
let currentSetpoints = [0, 0, 0, 0, 0, 0]; // Rastreia setpoint individual de cada pistão

// ========== IndexedDB Functions ==========
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("TelemetryDB", 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("telemetry")) {
        const store = db.createObjectStore("telemetry", {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}

async function saveTelemetryToDB(data) {
  if (!db || !chartRecording) return;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["telemetry"], "readwrite");
    const store = transaction.objectStore("telemetry");
    const request = store.add(data);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function clearTelemetryDB() {
  if (!db) return;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["telemetry"], "readwrite");
    const store = transaction.objectStore("telemetry");
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getAllTelemetryFromDB() {
  if (!db) return [];

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["telemetry"], "readonly");
    const store = transaction.objectStore("telemetry");
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ========== Chart Functions ==========
function initChart(canvasId = 'telemetry-chart') {
  const canvas = document.getElementById(canvasId);

  if (!canvas) {
    console.error(`❌ Canvas com id "${canvasId}" não encontrado!`);
    return null;
  }

  if (typeof Chart === 'undefined') {
    console.error('❌ Chart.js não está carregado!');
    return null;
  }

  const ctx = canvas.getContext('2d');

  const datasets = [];
  for (let i = 1; i <= 6; i++) {
    // Dataset para Y (posição atual)
    datasets.push({
      label: `Pistão ${i} (Y)`,
      data: [],
      borderColor: PISTON_COLORS[i].y,
      backgroundColor: PISTON_COLORS[i].y.replace('0.8', '0.1'),
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.4,
    });

    // Dataset para Setpoint (linha tracejada)
    datasets.push({
      label: `Pistão ${i} (SP)`,
      data: [],
      borderColor: PISTON_COLORS[i].sp,
      backgroundColor: 'transparent',
      borderWidth: 3,
      borderDash: [5, 5],
      pointRadius: 0,
      tension: 0,
    });
  }

  telemetryChart = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          mode: 'index',
          intersect: false,
        },
        zoom: {
          pan: {
            enabled: true,
            mode: 'xy',
            modifierKey: null,
          },
          zoom: {
            wheel: {
              enabled: true,
              speed: 0.1,
            },
            pinch: {
              enabled: true,
            },
            mode: 'xy',
          },
          limits: {
            x: { min: 'original', max: 'original' },
            y: { min: 'original', max: 'original' },
          },
        },
      },
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: 'Tempo (s)',
            color: '#9ca3af',
          },
          ticks: { color: '#9ca3af' },
          grid: { color: 'rgba(75, 85, 99, 0.3)' },
        },
        y: {
          display: true,
          title: {
            display: true,
            text: 'Posição (mm)',
            color: '#9ca3af',
          },
          ticks: { color: '#9ca3af' },
          grid: { color: 'rgba(75, 85, 99, 0.3)' },
        },
      },
    },
  });

  return telemetryChart;
}

function startChart() {
  chartRecording = true;
  chartData = [];
  clearTelemetryDB();

  const btnStart = document.getElementById('btn-start-chart');
  const btnStop = document.getElementById('btn-stop-chart');
  const status = document.getElementById('chart-status');

  if (btnStart) btnStart.classList.add('hidden');
  if (btnStop) btnStop.classList.remove('hidden');
  if (status) {
    status.textContent = '🔴 Gravando...';
    status.style.color = '';
  }

  if (window.showToast) {
    window.showToast('Gravação da telemetria iniciada', 'success');
  }
}

function stopChart() {
  chartRecording = false;

  const btnStart = document.getElementById('btn-start-chart');
  const btnStop = document.getElementById('btn-stop-chart');
  const status = document.getElementById('chart-status');

  if (btnStart) btnStart.classList.remove('hidden');
  if (btnStop) btnStop.classList.add('hidden');
  if (status) {
    status.textContent = `⏸ Pausado (${chartData.length} pontos gravados)`;
  }

  if (window.showToast) {
    window.showToast(`Gravação pausada - ${chartData.length} pontos gravados`, 'info');
  }
}

function resetZoom() {
  if (telemetryChart) {
    telemetryChart.resetZoom();
  }
}

function clearChart() {
  chartRecording = false;
  chartData = [];
  clearTelemetryDB();

  if (telemetryChart) {
    telemetryChart.data.labels = [];
    telemetryChart.data.datasets.forEach((ds) => (ds.data = []));
    telemetryChart.update();
    telemetryChart.resetZoom();
  }

  const btnStart = document.getElementById('btn-start-chart');
  const btnStop = document.getElementById('btn-stop-chart');
  const status = document.getElementById('chart-status');

  if (btnStart) btnStart.classList.remove('hidden');
  if (btnStop) btnStop.classList.add('hidden');
  if (status) status.textContent = 'Pronto para iniciar gravação';

  if (window.showToast) {
    window.showToast('Gráfico limpo com sucesso', 'success');
  }
}

function togglePistonVisibility(pistonNum) {
  if (!telemetryChart) return;

  const checkbox = document.getElementById(`piston-${pistonNum}-visible`);
  const isVisible = checkbox?.checked;

  // Os datasets estão organizados alternadamente: Y1, SP1, Y2, SP2, Y3, SP3...
  const yIndex = (pistonNum - 1) * 2;
  const spIndex = (pistonNum - 1) * 2 + 1;

  telemetryChart.data.datasets[yIndex].hidden = !isVisible;
  telemetryChart.data.datasets[spIndex].hidden = !isVisible;

  telemetryChart.update();
}

function toggleAllPistons(visible) {
  for (let i = 1; i <= 6; i++) {
    const checkbox = document.getElementById(`piston-${i}-visible`);
    if (checkbox) {
      checkbox.checked = visible;
      togglePistonVisibility(i);
    }
  }
}

function updateChart(telemetryData) {
  if (!telemetryChart) {
    console.error('❌ telemetryChart não está inicializado!');
    return;
  }

  if (!telemetryData.Y) {
    console.warn('⚠️ telemetryData.Y não existe:', telemetryData);
    return;
  }

  if (!chartRecording) {
    const status = document.getElementById('chart-status');
    if (status && !status.textContent.includes('Clique')) {
      status.textContent = '⏸️ Gráfico pausado - Clique em "Começar" para iniciar gravação';
      status.style.color = '#fbbf24';
    }

    return;
  }

  const now = Date.now();
  const timeLabel = ((now - (chartData[0]?.timestamp || now)) / 1000).toFixed(1);

  // Usa os setpoints individuais rastreados de cada pistão
  const setpoints = [...currentSetpoints];

  // Adiciona aos dados em memória (limitado)
  const dataPoint = {
    timestamp: now,
    sp_mm: telemetryData.sp_mm || 0,
    SP: setpoints,
    Y: [...telemetryData.Y],
  };

  chartData.push(dataPoint);

  // Salva no IndexedDB (sem limite)
  saveTelemetryToDB(dataPoint).catch((err) => console.error('Erro ao salvar no DB:', err));

  // Limita pontos no gráfico para performance
  if (chartData.length > maxDataPoints) {
    chartData.shift();
  }

  // Atualiza gráfico
  telemetryChart.data.labels.push(timeLabel);

  for (let i = 0; i < 6; i++) {
    // Y (posição atual)
    telemetryChart.data.datasets[i * 2].data.push(telemetryData.Y[i] || 0);
    // SP (setpoint individual de cada pistão)
    const setpointValue = setpoints[i] !== null ? setpoints[i] : telemetryData.Y[i] || 0;
    telemetryChart.data.datasets[i * 2 + 1].data.push(setpointValue);
  }

  // Remove pontos antigos do gráfico
  if (telemetryChart.data.labels.length > maxDataPoints) {
    telemetryChart.data.labels.shift();
    telemetryChart.data.datasets.forEach((ds) => ds.data.shift());
  }

  telemetryChart.update('none'); // 'none' = sem animação (melhor performance)

  // Atualiza status
  const status = document.getElementById('chart-status');
  if (status) {
    status.textContent = `🔴 Gravando... (${chartData.length} pontos em memória)`;
  }
}

function updateSetpoint(piston, value) {
  if (piston === null) {
    // Setpoint global - atualiza todos
    for (let i = 0; i < 6; i++) {
      currentSetpoints[i] = value;
    }
  } else {
    // Setpoint individual
    currentSetpoints[piston - 1] = value;
  }
}

async function exportToCSV() {
  try {
    const allData = await getAllTelemetryFromDB();

    if (allData.length === 0) {
      if (window.showToast) {
        window.showToast(
          "Não há dados para exportar. Inicie a gravação primeiro.",
          "warning"
        );
      }
      return;
    }

    // Cabeçalho CSV
    let csv = "Timestamp,SP_Global,SP1,SP2,SP3,SP4,SP5,SP6,Y1,Y2,Y3,Y4,Y5,Y6\n";

    // Dados
    allData.forEach((row) => {
      const timestamp = new Date(row.timestamp).toISOString();
      const sp_global = row.sp_mm || 0;
      const sp = row.SP ? row.SP.join(",") : "0,0,0,0,0,0";
      const y = row.Y.join(",");
      csv += `${timestamp},${sp_global},${sp},${y}\n`;
    });

    // Download
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `telemetria_${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    if (window.showToast) {
      window.showToast(
        `CSV exportado com sucesso! ${allData.length} registros salvos.`,
        "success"
      );
    }
  } catch (err) {
    console.error("Erro ao exportar CSV:", err);
    if (window.showToast) {
      window.showToast(`Erro ao exportar: ${err.message}`, "error");
    }
  }
}

// Exporta funções para uso global
window.PISTON_COLORS = PISTON_COLORS;
window.initDB = initDB;
window.initChart = initChart;
window.startChart = startChart;
window.stopChart = stopChart;
window.resetZoom = resetZoom;
window.clearChart = clearChart;
window.togglePistonVisibility = togglePistonVisibility;
window.toggleAllPistons = toggleAllPistons;
window.updateChart = updateChart;
window.updateSetpoint = updateSetpoint;
window.exportToCSV = exportToCSV;
