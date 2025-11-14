# Refatoração: Código Comum para common.js

## 📋 Análise de Código Duplicado

### ✅ JÁ ESTÁ NO COMMON.JS

- `showToast()` - Helper de notificações
- `loadSerialPorts()` - Carregar portas seriais
- `openSerial()` - Abrir conexão serial
- `closeSerial()` - Fechar conexão serial
- `setSerialStatus()` - Atualizar indicador de status
- `updateConnectionStatus()` - Verificar status da conexão
- `checkExistingConnection()` - Verificar conexão existente ao carregar
- `initTelemetryWS()` - Inicializar WebSocket
- `scheduleReconnect()` - Reagendar reconexão WS

---

## 🔄 CÓDIGO DUPLICADO PARA MOVER

### 1. **Three.js - Configuração Comum** (kinematics.html + motion-accelerometer.html)

**Funções duplicadas:**

```javascript
// COLORS - Paleta de cores (IDÊNTICA em ambas)
const COLORS = {
  base: 0xcd191e,
  platform: 0x2f9e41,
  actuatorValid: 0x50c878,
  actuatorInvalid: 0xff4444,
  background: 0x0f172a,
  grid: 0x475569
};

// init3D() - Setup da cena 3D
function init3D(containerId) { ... }

// createBasePoint() - Criar ponto da base
function createBasePoint(position) { ... }

// createPlatformPoint() - Criar ponto da plataforma
function createPlatformPoint(position) { ... }

// createActuator() - Criar atuador (cilindro)
function createActuator(startPos, endPos, actuator) { ... }

// draw3DPlatform() - Renderizar plataforma 3D
function draw3DPlatform(containerId, data) { ... }

// resetCamera() - Resetar câmera para posição padrão
function resetCamera(containerId) { ... }
```

**Ação:** Mover para `three-utils.js` ou adicionar ao `common.js`

---

### 2. **Medidas de Pistões** (kinematics.html + motion-accelerometer.html)

**Funções duplicadas:**

```javascript
// updatePreviewMeasures() - Atualizar medidas calculadas
function updatePreviewMeasures(actuators) {
  for (let i = 0; i < 6; i++) {
    document.getElementById(`piston-${i + 1}-length`).textContent = actuators[i].length.toFixed(1);
  }
}

// updateLiveMeasures() - Atualizar medidas ao vivo
function updateLiveMeasures(actuators) {
  for (let i = 0; i < 6; i++) {
    document.getElementById(`piston-live-${i + 1}-length`).textContent = actuators[i].length.toFixed(1);
  }
}
```

**Ação:** Criar função genérica `updatePistonMeasures(prefix, actuators)`

---

### 3. **Normalização de Telemetria** (kinematics.html + motion-accelerometer.html)

**Funções duplicadas:**

```javascript
// BASE_POINTS_FIXED - Constante (IDÊNTICA)
const BASE_POINTS_FIXED = [
  [305.5, -17, 0],
  [305.5, 17, 0],
  [-137.7, 273.23, 0],
  [-168, 255.7, 0],
  [-167.2, -256.2, 0],
  [-136.8, -273.6, 0],
];

// normalizeTelemetry() - Processar mensagem de telemetria
function normalizeTelemetry(msg) { ... }

// reconstructPlatformPoints() - Reconstruir pontos da plataforma
function reconstructPlatformPoints(basePoints, actuators) { ... }

// applyLiveTelemetry() - Aplicar telemetria ao modelo 3D
function applyLiveTelemetry(data) { ... }
```

**Ação:** Mover para `common.js` ou `telemetry-utils.js`

---

### 4. **WebSocket - Handlers Específicos**

**Padrão comum mas com implementações diferentes:**

**kinematics.html:**

```javascript
ws.onmessage = (evt) => {
  // Throttle a 30 FPS
  const now = performance.now();
  if (now - lastWSUpdate < WS_UPDATE_INTERVAL) {
    lastWSMessage = evt.data;
    return;
  }
  lastWSUpdate = now;

  const data = JSON.parse(lastWSMessage || evt.data);
  applyLiveTelemetry(data);
};
```

**motion-accelerometer.html:**

```javascript
ws.onmessage = (evt) => {
  // Throttle similar + lógica específica de MPU
  const now = performance.now();
  if (now - lastWSUpdate < WS_UPDATE_INTERVAL) {
    lastWSMessage = evt.data;
    return;
  }
  lastWSUpdate = now;

  const msg = JSON.parse(lastWSMessage || evt.data);
  const data = normalizeTelemetry(msg);

  if (data.mpu && controlEnabled) {
    lastMPUData = data.mpu;
    updateMPUDisplay(data.mpu);
    // ... lógica específica MPU
  }

  applyLiveTelemetry(data);
};
```

**actuators.html:**

```javascript
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  handleTelemetry(data);
};

function handleTelemetry(data) {
  if (data.type === 'raw') {
    logConsole(data.raw, 'rx');
  } else if ((data.type === 'telemetry' || data.type === 'telemetry_mpu') && data.Y) {
    // Atualiza UI
    updateChart(data);
  }
}
```

**Ação:** Criar `createThrottledWSHandler(callback, interval)` para reutilizar throttle

---

### 5. **Performance Monitoring** (kinematics.html + motion-accelerometer.html)

**Código idêntico:**

```javascript
let frameCount = 0;
let lastFPSCheck = performance.now();

function monitorPerformance() {
  frameCount++;
  const now = performance.now();
  if (now - lastFPSCheck >= 1000) {
    const fps = Math.round((frameCount * 1000) / (now - lastFPSCheck));
    console.log(`📊 FPS: ${fps}`);
    frameCount = 0;
    lastFPSCheck = now;
  }
  requestAnimationFrame(monitorPerformance);
}
```

**Ação:** Mover para `common.js` como `startFPSMonitor()`

---

## 📦 ESTRUTURA PROPOSTA

### Opção 1: Tudo em `common.js` (Simples)

```
common.js
├── Toast & Notifications
├── Serial Connection
├── WebSocket Management
├── Three.js Utils
├── Telemetry Processing
└── Performance Monitoring
```

### Opção 2: Múltiplos arquivos (Modular - RECOMENDADO)

```
common/
├── common.js          # Core (toast, serial, status)
├── three-utils.js     # Three.js (init3D, colors, geometrias)
├── telemetry-utils.js # Telemetria (normalize, reconstruct)
└── ws-utils.js        # WebSocket (throttle, reconnect)
```

---

## 🎯 PLANO DE AÇÃO

### Fase 1: Criar Arquivos Modulares

1. ✅ `common.js` já existe - manter funções básicas
2. ⏳ Criar `three-utils.js` - funções Three.js
3. ⏳ Criar `telemetry-utils.js` - processamento de telemetria
4. ⏳ Criar `ws-utils.js` - utilitários WebSocket

### Fase 2: Refatorar Páginas

1. ⏳ `kinematics.html` - usar imports
2. ⏳ `motion-accelerometer.html` - usar imports
3. ⏳ `actuators.html` - usar imports
4. ⏳ `settings.html` - já está OK (só usa common.js básico)

### Fase 3: Testar

1. ⏳ Verificar todas as funcionalidades
2. ⏳ Validar no navegador (sem erros de console)
3. ⏳ Confirmar redução de código duplicado

---

## 📊 MÉTRICAS ESPERADAS

### Antes:

- `kinematics.html`: ~1695 linhas
- `motion-accelerometer.html`: ~1329 linhas
- `actuators.html`: ~1465 linhas
- **Total duplicado estimado: ~800 linhas**

### Depois:

- `three-utils.js`: ~300 linhas
- `telemetry-utils.js`: ~200 linhas
- `ws-utils.js`: ~100 linhas
- **Redução esperada: 40-50% de código duplicado**

---

## ⚠️ CUIDADOS

1. **Throttle de WebSocket**: Cada página usa intervalo diferente

   - kinematics: 33ms (30 FPS)
   - motion-accelerometer: 33ms WS + 100ms controle
   - actuators: sem throttle explícito

2. **Handlers de Mensagem**: Lógica específica por página

   - kinematics: atualiza 3D ao vivo
   - motion-accelerometer: processa MPU + envia comandos
   - actuators: atualiza gráfico Chart.js

3. **Geometrias 3D**: Mantém cache local (`window.__threeScenes`)
   - Não sobrescrever entre páginas

---

## 🚀 PRÓXIMOS PASSOS

**Você quer que eu:**

1. **Crie os arquivos modulares** (`three-utils.js`, `telemetry-utils.js`, `ws-utils.js`)?
2. **Refatore uma página por vez** (começar por kinematics.html)?
3. **Apenas atualize common.js** com as funções mais críticas?

**Qual abordagem você prefere?**
