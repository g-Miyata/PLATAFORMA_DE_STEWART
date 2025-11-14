# REFATORAÇÃO KINEMATICS.HTML - Guia Passo a Passo

## ⚠️ PROBLEMA ATUAL

O arquivo `kinematics.html` ficou corrompido após edição automática.
Código duplicado e funções quebradas entre linhas 835-1170.

## ✅ SOLUÇÃO

### 1. RESTAURAR O ARQUIVO

Use git para restaurar o arquivo original:

```bash
git restore interface/frontend/kinematics.html
```

### 2. ADICIONAR IMPORTS DOS UTILS (linha ~18)

Logo após os imports de Toastify, adicionar:

```html
    </script>
    <!-- Utilitários Compartilhados -->
    <script src="./common.js"></script>
    <script src="./three-utils.js"></script>
    <script src="./telemetry-utils.js"></script>
    <script src="./ws-utils.js"></script>
    <style>
```

### 3. REMOVER CÓDIGO DUPLICADO NO <script> PRINCIPAL

**DELETAR** as seguintes funções (já estão nos utils):

#### ❌ REMOVER: Constante COLORS (linha ~831)

```javascript
const COLORS = {
  base: 0xcd191e,
  platform: 0x2f9e41,
  // ... resto
};
```

**Motivo:** Já está em `three-utils.js`

---

#### ❌ REMOVER: function init3D() (linhas ~844-916)

**Motivo:** Já está em `three-utils.js`

---

#### ❌ REMOVER: function createBasePoint() (linhas ~918-929)

**Motivo:** Já está em `three-utils.js`

---

#### ❌ REMOVER: function createPlatformPoint() (linhas ~931-942)

**Motivo:** Já está em `three-utils.js`

---

#### ❌ REMOVER: function createActuator() (linhas ~944-966)

**Motivo:** Já está em `three-utils.js`

---

#### ❌ REMOVER: function draw3DPlatform() (linhas ~970-1163)

**Motivo:** Já está em `three-utils.js`

---

#### ❌ REMOVER: function resetCamera() (linhas ~1165-1177)

**Motivo:** Já está em `three-utils.js`

---

#### ❌ REMOVER: const BASE_POINTS_FIXED (linhas ~1395-1402)

```javascript
const BASE_POINTS_FIXED = [
  [305.5, -17, 0],
  // ... resto
];
```

**Motivo:** Já está em `telemetry-utils.js`

---

#### ❌ REMOVER: function normalizeTelemetry() (linhas ~1404-1459)

**Motivo:** Já está em `telemetry-utils.js`

---

#### ❌ REMOVER: function reconstructPlatformPoints() (linhas ~1462-1481)

**Motivo:** Já está em `telemetry-utils.js`

---

#### ❌ REMOVER: function applyLiveTelemetry() (linhas ~1484-1508)

**Motivo:** Já está em `telemetry-utils.js`

---

#### ❌ REMOVER: function monitorPerformance() (linhas ~1649-1658)

**Motivo:** Já está em `ws-utils.js` como `startFPSMonitor()`

---

### 4. MANTER FUNÇÕES ESPECÍFICAS

✅ **MANTER:**

- `function setupInputSync()` - Específica desta página
- `function getPoseFromUI()` - Específica desta página
- `function updatePreviewMeasures()` - Atualiza cards Preview (específico)
- `function updateLiveMeasures()` - Atualiza cards Live (específico)
- `function calculatePosition()` - Específica desta página
- `function resetPosition()` - Específica desta página
- `function applyToBench()` - Específica desta página
- `function updateVisualizationFromMotion()` - Específica desta página

**NOTA:** `updatePreviewMeasures` e `updateLiveMeasures` são DIFERENTES de `updatePistonMeasures` dos utils.
As funções locais atualizam CARDS com border colors, as dos utils apenas atualizam textos.

---

### 5. ATUALIZAR CHAMADAS

#### A) Substituir init3D local por importada

**Antes:**

```javascript
init3D('canvas-preview');
init3D('canvas-live');
```

**Depois:** (manter igual, pois a função importada tem mesma assinatura)

---

#### B) Substituir window.\_\_threeScenes

**Antes e Depois:** Manter igual (utils usa mesma estrutura global)

---

#### C) Atualizar applyLiveTelemetry no WebSocket

**Antes** (linha ~1520):

```javascript
function applyLiveTelemetry(data) {
  // ... implementação local
}
```

**Depois:** Usar versão importada:

```javascript
ws.onmessage = createThrottledWSHandler((data) => {
  const normalized = normalizeTelemetry(data);

  if (normalized.type !== 'raw') {
    // Atualizar modelo 3D ao vivo
    applyLiveTelemetry('canvas-live', normalized, (data, renderData) => {
      // Callback customizado para atualizar medidas locais
      updateLiveMeasures(renderData.actuators);
    });
  }
}, 33); // 30 FPS
```

---

#### D) Atualizar FPS Monitor

**Antes** (linha ~1694):

```javascript
requestAnimationFrame(monitorPerformance);
```

**Depois:**

```javascript
const stopFPS = startFPSMonitor(true); // Inicia monitor
// Para parar: stopFPS();
```

---

### 6. RESULTADO ESPERADO

**Antes:** ~1695 linhas  
**Depois:** ~1200-1300 linhas  
**Redução:** ~400-500 linhas (23-29%)

---

### 7. TESTAR

Após refatoração, testar:

1. ✅ Abrir kinematics.html no navegador
2. ✅ Console sem erros
3. ✅ Conectar serial
4. ✅ Mover sliders - Preview atualiza
5. ✅ WebSocket conecta - Live atualiza
6. ✅ Clicar "Aplicar na Bancada" funciona
7. ✅ Reset de câmera funciona
8. ✅ FPS no console

---

## 🚀 COMANDOS GIT

```bash
# Descartar mudanças ruins
git restore interface/frontend/kinematics.html

# Fazer refatoração manual conforme guia acima

# Testar no navegador

# Commit
git add interface/frontend/kinematics.html
git add interface/frontend/three-utils.js
git add interface/frontend/telemetry-utils.js
git add interface/frontend/ws-utils.js
git commit -m "refactor(frontend): move funções comuns para utils modulares

- Cria three-utils.js, telemetry-utils.js, ws-utils.js
- Refatora kinematics.html para usar imports
- Reduz ~400 linhas de código duplicado
- Melhora manutenibilidade e reutilização"
```

---

## ⚠️ ATENÇÃO

**NÃO use ferramentas automáticas** para esta refatoração!  
O arquivo tem muitas nuances e estrutura complexa.  
**FAÇA MANUALMENTE** seguindo este guia.

---

## 📝 PRÓXIMOS PASSOS

Após kinematics.html funcionar:

1. Refatorar `motion-accelerometer.html`
2. Refatorar `actuators.html` (menos impacto)
3. Atualizar `settings.html` se necessário
