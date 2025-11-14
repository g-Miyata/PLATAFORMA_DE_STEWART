# 🚀 Prompt para GitHub Copilot - Otimização Completa de Performance

**Regras prioritárias (siga à risca):**

1. Não remover nenhuma funcionalidade existente.
2. Aplicar TODAS as otimizações descritas (Tarefas 1–8).
3. Editar apenas o arquivo atual (kinematics.html), dentro do `<script>`.
4. Manter o código válido e completo, sem truncar.
5. Comentar mudanças com `// OTIMIZAÇÃO: ...`.

## 📋 Contexto

Você é um especialista em otimização de performance web. Preciso otimizar uma aplicação de controle de plataforma Stewart que está travando devido a:

- WebSocket enviando dados em alta frequência (>60 FPS)
- Renderização 3D com Three.js sendo recriada completamente a cada update
- 2 gráficos Chart.js com até 1000 pontos cada
- Gravação síncrona no IndexedDB a cada frame
- Processamento pesado no thread principal

## 🎯 Objetivo

Otimizar o código para rodar suavemente a ~60 FPS com telemetria em tempo real, garantindo:

- WebSocket throttled a ~30 FPS
- Atualizações 3D com cache e reutilização de geometrias
- Batch writes no IndexedDB
- Decimação inteligente de pontos dos gráficos
- Janela deslizante otimizada (O(1) ao invés de O(n))

---

## 🔧 TAREFA 1: Implementar Throttle no WebSocket

**Localize o código:**

```javascript
ws.onmessage = (evt) => {
  try {
    const msg = JSON.parse(evt.data);
    // ... processamento
  }
}
```

**Otimize para:**

- Adicionar throttle de 33ms (~30 FPS máximo)
- Usar `performance.now()` para timing preciso
- Ignorar mensagens intermediárias se estiver processando
- Manter última mensagem em buffer para não perder dados

**Código otimizado esperado:**

```javascript
let lastWSUpdate = 0;
const WS_UPDATE_INTERVAL = 33; // ~30 FPS

ws.onmessage = (evt) => {
  const now = performance.now();
  if (now - lastWSUpdate < WS_UPDATE_INTERVAL) return;
  lastWSUpdate = now;
  // ... resto do código
};
```

---

## 🔧 TAREFA 2: Otimizar draw3DPlatform com Cache

**Localize o código:**

```javascript
function draw3DPlatform(containerId, data) {
  baseGroup.clear();
  platformGroup.clear();
  actuatorGroup.clear();
  // ... recria TODA geometria
}
```

**Otimize para:**

- Criar cache global de objetos 3D reutilizáveis
- Na primeira renderização: criar objetos
- Nas seguintes: apenas atualizar posições, escalas e cores
- Usar `requestAnimationFrame` para debounce

**Estrutura esperada:**

```javascript
const objectCache = {
  [containerId]: {
    actuators: [],
    initialized: false,
  },
};

let update3DPending = false;

function draw3DPlatformOptimized(containerId, data) {
  if (!objectCache[containerId]) {
    objectCache[containerId] = { actuators: [], initialized: false };
  }

  if (!objectCache[containerId].initialized) {
    // Primeira vez: criar objetos
    // ...
    objectCache[containerId].initialized = true;
  } else {
    // Updates: apenas transformar objetos existentes
    objectCache[containerId].actuators.forEach((actuator, i) => {
      // Atualizar position, scale, rotation, color
    });
  }
}
```

---

## 🔧 TAREFA 3: Implementar Batch Writes no IndexedDB

**Localize o código:**

```javascript
function updateMotionGraph(timestamp, routine, pose, commandedLengths, actualLengths) {
  // ...
  saveMotionDataToDB(dataPoint); // CHAMADO A CADA FRAME!
}
```

**Otimize para:**

- Criar buffer de gravação em memória
- Acumular 10 pontos ou esperar 500ms
- Flush em batch usando `Promise.all()`
- Limpar buffer após gravação bem-sucedida

**Código esperado:**

```javascript
let dbWriteBuffer = [];
let dbWriteTimer = null;
const DB_BATCH_SIZE = 10;
const DB_BATCH_INTERVAL = 500;

function updateMotionGraphOptimized(...) {
  // ...
  dbWriteBuffer.push(dataPoint);

  if (dbWriteBuffer.length >= DB_BATCH_SIZE) {
    flushDBWriteBuffer();
  } else if (!dbWriteTimer) {
    dbWriteTimer = setTimeout(flushDBWriteBuffer, DB_BATCH_INTERVAL);
  }
}

async function flushDBWriteBuffer() {
  if (dbWriteBuffer.length === 0) return;
  const batch = [...dbWriteBuffer];
  dbWriteBuffer = [];
  clearTimeout(dbWriteTimer);
  dbWriteTimer = null;

  await Promise.all(batch.map(data => saveMotionDataToDB(data)));
}
```

---

## 🔧 TAREFA 4: Otimizar Janela Deslizante dos Gráficos

**Localize o código:**

```javascript
// Remove pontos antigos (LENTO - O(n²))
while (dataset.data.length > 0 && dataset.data[0].x < windowStart) {
  dataset.data.shift(); // O(n) a cada iteração!
}
```

**Otimize para:**

- Usar `findIndex()` + `slice()` ao invés de `shift()` em loop
- Complexidade O(n) ao invés de O(n²)
- Aplicar decimação se exceder 500 pontos

**Código esperado:**

```javascript
const MAX_VISIBLE_POINTS = 500;

// Remover pontos fora da janela (O(n))
const cutIndex = dataset.data.findIndex((d) => d.x >= windowStart);
if (cutIndex > 0) {
  dataset.data = dataset.data.slice(cutIndex);
}

// Decimação se exceder limite
if (dataset.data.length > MAX_VISIBLE_POINTS) {
  const step = Math.ceil(dataset.data.length / MAX_VISIBLE_POINTS);
  const decimated = [];
  for (let i = 0; i < dataset.data.length - 1; i += step) {
    decimated.push(dataset.data[i]);
  }
  decimated.push(dataset.data[dataset.data.length - 1]); // Último sempre
  dataset.data = decimated;
}
```

---

## 🔧 TAREFA 5: Adicionar Debounce nas Atualizações 3D

**Localize o código:**

```javascript
function applyLiveTelemetry(data) {
  updateLiveMeasures(data.actuators);
  draw3DPlatform('canvas-live', data);
}
```

**Otimize para:**

- Usar `requestAnimationFrame` para agrupar updates
- Guardar última data recebida em variável
- Processar apenas 1 update por frame

**Código esperado:**

```javascript
let update3DPending = false;
let last3DData = null;

function applyLiveTelemetryThrottled(data) {
  last3DData = data;

  if (update3DPending) return;

  update3DPending = true;
  requestAnimationFrame(() => {
    if (last3DData) {
      updateLiveMeasures(last3DData.actuators);
      draw3DPlatformOptimized('canvas-live', last3DData);
    }
    update3DPending = false;
  });
}
```

---

## 🔧 TAREFA 6: Reduzir Configurações de Janela

**Localize as constantes:**

```javascript
const CHART_WINDOW_SECONDS = 60;
let maxDataPoints = 1000;
```

**Altere para:**

```javascript
const CHART_WINDOW_SECONDS = 30; // Reduzir de 60 para 30
const MAX_VISIBLE_POINTS = 500; // Reduzir de 1000 para 500
```

---

## 🔧 TAREFA 7: Adicionar Monitor de Performance

**Adicione no final do arquivo:**

```javascript
let frameCount = 0;
let lastFPSCheck = performance.now();

function monitorPerformance() {
  frameCount++;
  const now = performance.now();

  if (now - lastFPSCheck >= 1000) {
    const fps = frameCount;
    frameCount = 0;
    lastFPSCheck = now;

    if (fps < 20) {
      console.warn(`⚠️ FPS baixo: ${fps}. Considere ajustar configurações.`);
    } else if (fps > 50) {
      // FPS OK
    }
  }

  requestAnimationFrame(monitorPerformance);
}

// Iniciar no DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  // ... código existente ...
  requestAnimationFrame(monitorPerformance);
});
```

---

## 🔧 TAREFA 8: Otimizar Chart.js Update

**Localize:**

```javascript
motionChartCmd.update('none');
motionChartReal.update('none');
```

**Garanta que está usando:**

- `update("none")` ao invés de `update()` ✅
- `animation: false` na configuração dos gráficos ✅
- `parsing: false` e `normalized: true` ✅

---

## ✅ CHECKLIST DE VALIDAÇÃO

Após implementar todas as otimizações, verifique:

- [ ] WebSocket throttled a ~30 FPS (console mostra mensagens a cada 33ms)
- [ ] FPS estável entre 50-60 (monitor de performance não mostra avisos)
- [ ] IndexedDB gravando em batches (console mostra "Salvos X pontos em batch")
- [ ] Gráficos não excedendo 500 pontos visíveis
- [ ] Objetos 3D reutilizados (não recriados a cada frame)
- [ ] CPU usage < 50% durante operação normal
- [ ] Memory usage estável (sem memory leaks)
- [ ] Smooth scroll e interações na UI

---

## 🎯 MÉTRICAS ESPERADAS

**Antes:**

- FPS: 15-20
- CPU: 80-100%
- Memory: crescente
- Updates/s: ilimitado
- DB writes/s: ~100

**Depois:**

- FPS: 50-60 ✅
- CPU: 30-50% ✅
- Memory: estável ✅
- Updates/s: 30 ✅
- DB writes/s: ~10 ✅

---

## 📝 NOTAS IMPORTANTES

1. **Não remova funcionalidades**, apenas otimize performance
2. **Mantenha compatibilidade** com código existente
3. **Adicione comentários** explicando otimizações
4. **Teste cada mudança** individualmente antes de prosseguir
5. **Use console.log estratégico** para debug de performance

---

## 🚨 SE AINDA TRAVAR APÓS ISSO

Considere implementar Web Worker para processamento pesado:

```javascript
// worker.js
self.onmessage = function (e) {
  const { type, data } = e.data;
  if (type === 'NORMALIZE_TELEMETRY') {
    const result = normalizeTelemetry(data);
    self.postMessage({ type: 'TELEMETRY_READY', data: result });
  }
};

// main.js
const telemetryWorker = new Worker('worker.js');
telemetryWorker.onmessage = (e) => {
  if (e.data.type === 'TELEMETRY_READY') {
    applyLiveTelemetryThrottled(e.data.data);
  }
};

ws.onmessage = (evt) => {
  telemetryWorker.postMessage({
    type: 'NORMALIZE_TELEMETRY',
    data: JSON.parse(evt.data),
  });
};
```

---

## 🎬 COMEÇAR AGORA

Copilot, por favor:

1. Leia TODO o arquivo kinematics.html
2. Identifique as funções críticas mencionadas acima
3. Implemente TODAS as 8 tarefas em sequência
4. Adicione comentários `// OTIMIZAÇÃO:` antes de cada mudança
5. Mantenha a estrutura e funcionalidades existentes
6. Retorne o arquivo completo otimizado

**IMPORTANTE:** Não trunce o código! Retorne o arquivo COMPLETO com todas as otimizações aplicadas.
