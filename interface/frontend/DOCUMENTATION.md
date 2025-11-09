# Documentação - Interface Frontend da Plataforma de Stewart

Este documento descreve o funcionamento de cada uma das páginas da interface web da Plataforma de Stewart.

---

## 📋 Índice

1. [Actuators.html - Controle PID](#actuatorshtml---controle-pid)
2. [Motion.html - Controle por Acelerômetro](#motionhtml---controle-por-acelerômetro)
3. [Settings.html - Configurações PID](#settingshtml---configurações-pid)

---

## 🎮 Actuators.html - Controle PID

### Propósito

Página principal de controle e telemetria dos pistões da plataforma Stewart usando controle PID. Permite monitoramento em tempo real, ajuste de setpoints e visualização gráfica dos dados.

### Recursos Principais

#### 1. **Conexão Serial**

- **Seleção de Porta**: Dropdown com portas COM disponíveis
- **Atualização de Portas**: Botão para recarregar lista de portas seriais
- **Conexão/Desconexão**: Botões para estabelecer comunicação com ESP32-S3
- **Taxa de Comunicação**: 115200 baud (fixo)

**Endpoints utilizados:**

- `GET /serial/available` - Lista portas disponíveis
- `POST /serial/open` - Abre conexão serial
- `POST /serial/close` - Fecha conexão serial
- `GET /serial/status` - Verifica status da conexão

#### 2. **Gráfico de Telemetria**

Sistema avançado de visualização com 6 pistões simultâneos.

**Características:**

- **12 datasets por gráfico**: Y (posição real) e SP (setpoint) para cada pistão
- **Cores identificadoras**:
  - Pistão 1: Azul (`#3b82f6`)
  - Pistão 2: Roxo (`#a855f7`)
  - Pistão 3: Rosa (`#ec4899`)
  - Pistão 4: Laranja (`#f97316`)
  - Pistão 5: Teal (`#14b8a6`)
  - Pistão 6: Índigo (`#6366f1`)

**Controles:**

- **Iniciar/Pausar**: Controla gravação de dados
- **Limpar**: Remove todos os dados do gráfico
- **Reset Zoom**: Restaura visualização padrão
- **Exportar CSV**: Salva dados em arquivo CSV com timestamp
- **Visibilidade**: Checkboxes para mostrar/ocultar pistões individuais
- **Toggle All**: Mostra/oculta todos os pistões de uma vez

**Armazenamento:**

- **Memória RAM**: Limitado a 500 pontos (performance)
- **IndexedDB**: Armazena todos os pontos gravados (sem limite)
- **Exportação**: Recupera TODOS os dados do IndexedDB, não apenas os 500 em memória

**Zoom e Pan:**

- Roda do mouse: Zoom in/out
- Arrastar: Pan (movimento lateral/vertical)
- Duplo clique: Reset zoom

#### 3. **Console Serial**

Monitor de comunicação serial em tempo real.

**Tipos de mensagem:**

- `RX` (verde): Dados recebidos do ESP32
- `TX` (azul): Comandos enviados para ESP32
- `INFO` (cinza): Mensagens do sistema

**Recursos:**

- Auto-scroll para última linha
- Timestamp em cada linha
- Limitado a 500 linhas (performance)
- Campo de comando livre para envio manual

#### 4. **Telemetria em Tempo Real**

Exibição de dados dos 6 pistões em cards coloridos.

**Dados exibidos:**

- **Y (mm)**: Posição real do pistão
- **SP (mm)**: Setpoint atual
- **E (mm)**: Erro (SP - Y)
- **PWM**: Valor de PWM aplicado (0-255)
- **Taxa de atualização**: Hz

**Cores dos cards** (mesmas do gráfico):

- Pistão 1-6 com bordas coloridas para identificação rápida

#### 5. **Controle de Setpoints**

##### Setpoint Global

Envia o mesmo valor para todos os 6 pistões simultaneamente.

**Endpoint:** `POST /serial/send`
**Comando:** `s<valor>` (ex: `s450.5`)

##### Setpoints Individuais

Controla cada pistão separadamente.

**Endpoint:** `POST /serial/send`
**Comandos:**

- `s1<valor>` - Pistão 1
- `s2<valor>` - Pistão 2
- `s3<valor>` - Pistão 3
- `s4<valor>` - Pistão 4
- `s5<valor>` - Pistão 5
- `s6<valor>` - Pistão 6

#### 6. **Controle Manual**

Modo de operação manual sem PID.

**Comandos:**

- **Selecionar Pistão**: `m<1-6>` (ex: `m3`)
- **Avançar**: `a` (estende pistão selecionado)
- **Retrair**: `r` (retrai pistão selecionado)
- **Parar**: `p` (para movimento)

#### 7. **WebSocket para Telemetria**

Conexão persistente para recebimento de dados em tempo real.

**URL:** `ws://localhost:8001/ws/telemetry`

**Tipos de mensagem:**

```json
{
  "type": "telemetry",
  "Y": [y1, y2, y3, y4, y5, y6],
  "sp_mm": valor_global_opcional
}
```

```json
{
  "type": "raw",
  "raw": "texto_serial"
}
```

**Reconexão automática:** Tenta reconectar a cada 3 segundos se desconectar

---

## 🎯 Motion.html - Controle por Acelerômetro

### Propósito

Interface de controle da plataforma Stewart através de dados do acelerômetro MPU-6050. Calcula cinemática inversa a partir de orientação (roll, pitch, yaw) e visualiza em 3D.

### Recursos Principais

#### 1. **Recepção de Dados MPU-6050**

Recebe orientação do acelerômetro via WebSocket.

**Mensagem esperada:**

```json
{
  "type": "telemetry_mpu",
  "mpu": {
    "roll": -12.5,
    "pitch": 8.3,
    "yaw": -5.2
  }
}
```

**URL WebSocket:** `ws://localhost:8001/ws/telemetry`

#### 2. **Display de Valores MPU**

Três cards horizontais mostrando orientação atual.

**Para cada ângulo (Roll, Pitch, Yaw):**

- **Valor numérico**: Com 2 casas decimais
- **Barra de progresso**: Visual do ângulo dentro dos limites
- **Limites aplicados**:
  - Roll: ±12° (rosa a vermelho)
  - Pitch: ±12° (rosa a vermelho)
  - Yaw: ±10° (rosa a vermelho)

**Cálculo da barra de progresso:**

- Roll: `((valor + 12) / 24) × 100%`
- Pitch: `((valor + 12) / 24) × 100%`
- Yaw: `((valor + 10) / 20) × 100%`

**Taxa de atualização:** Exibida em Hz

#### 3. **Limitação de Ângulos**

Sistema de segurança que restringe ângulos extremos.

**Função:** `limitAngles(roll, pitch, yaw)`

**Limites:**

```javascript
roll = clamp(roll, -12, +12);
pitch = clamp(pitch, -12, +12);
yaw = clamp(yaw, -10, +10);
```

**Aplicação:** Antes de qualquer cálculo cinemático

#### 4. **Controle de Escala**

Slider para ajustar sensibilidade do movimento.

**Range:** 0.1 a 2.0 (padrão: 1.0)
**Efeito:** Multiplica os ângulos antes do cálculo

```javascript
roll_scaled = roll × scale
pitch_scaled = pitch × scale
yaw_scaled = yaw × scale
```

**Após escala:** Limitação é aplicada novamente

#### 5. **Ativar/Desativar Controle**

Checkbox para habilitar/desabilitar envio de comandos.

**Estados:**

- ✅ **Ativo**: Calcula cinemática e envia para backend
- ❌ **Inativo**: Apenas visualiza dados, não envia comandos

#### 6. **Botão de Recalibração**

Envia comando para recalibrar o MPU-6050.

**Funcionamento:**

1. Verifica se serial está conectada
2. Envia comando via `POST /serial/send`
3. Payload: `{command: 'recalibra'}`
4. ESP32-S3 recebe e envia via ESP-NOW para DevKit com MPU
5. MPU-6050 realiza recalibração

**Feedback:** Toast de confirmação/erro

#### 7. **Cinemática Inversa**

Converte orientação MPU em posições de pistões.

**Pose calculada:**

```javascript
{
  x: 0,              // Centro (sem translação lateral)
  y: 0,              // Centro (sem translação frontal)
  z: 580,            // Altura padrão em mm (DEFAULT_Z_HEIGHT)
  roll: roll_limited,
  pitch: pitch_limited,
  yaw: yaw_limited
}
```

**Endpoint:** `POST /calculate`

**Resposta:**

```json
{
  "pose": {...},
  "actuators": [
    {
      "id": 1,
      "length": 450.5,
      "valid": true,
      "base": [x, y, z],
      "platform": [x, y, z]
    },
    ...
  ],
  "valid": true,
  "base_points": [...],
  "platform_points": [...]
}
```

#### 8. **Visualização 3D (Three.js)**

Renderização tridimensional da plataforma em tempo real.

**Elementos renderizados:**

- **Base (Hexágono vermelho)**: Semi-transparente, fixo
- **Plataforma (Hexágono verde)**: Semi-transparente, móvel
- **6 Pistões (Cilindros)**:
  - Verde: Posição válida
  - Vermelho: Posição inválida (fora dos limites)

**Controles 3D (OrbitControls):**

- Arrastar mouse: Rotacionar visão
- Roda do mouse: Zoom in/out
- Botão direito + arrastar: Pan

**Câmera:**

- Tipo: PerspectiveCamera
- FOV: 75°
- Posição inicial: (800, 600, 800)
- Target: Centro da plataforma móvel

**Iluminação:**

- AmbientLight: 0x404040 (iluminação geral)
- DirectionalLight: 0xffffff (sombras direcionais)
- Shadow mapping ativado

**Estratégia de atualização:**

- Clear + Recreate: Remove tudo e redesenha (evita memory leaks)
- Atualiza apenas quando novos dados chegam

#### 9. **Display de Medidas dos Pistões**

6 cards mostrando comprimento de cada pistão.

**Informações exibidas:**

- **ID do Pistão**: 1-6
- **Comprimento**: Em mm com 2 casas decimais
- **Status visual**: Borda verde (válido) ou vermelha (inválido)

**Cores das bordas** (mesmas do gráfico de telemetria):

- Pistão 1: Azul
- Pistão 2: Roxo
- Pistão 3: Rosa
- Pistão 4: Laranja
- Pistão 5: Teal
- Pistão 6: Índigo

**Fonte de dados:** `actuator.length` (não `length_abs`)

#### 10. **Altura Padrão (DEFAULT_Z_HEIGHT)**

Constante que define altura neutra da plataforma.

**Valor:** 580mm

**Aplicação:**

- Posição inicial ao carregar página
- Base para todos os cálculos cinemáticos
- Mantém plataforma em altura operacional segura

---

## ⚙️ Settings.html - Configurações PID

### Propósito

Página de configuração dos parâmetros de controle PID para cada pistão e ajustes gerais do sistema.

### Recursos Principais

#### 1. **Ganhos PID Individuais**

Grid com 6 cards, um para cada pistão.

**Parâmetros configuráveis:**

- **Kp (Proporcional)**: Ganho proporcional ao erro
- **Ki (Integral)**: Ganho da integral do erro
- **Kd (Derivativo)**: Ganho da derivada do erro

**Valores padrão:**

- Kp: 2.0
- Ki: 0.0
- Kd: 0.0

**Cores dos cards** (identificação visual):

- Pistão 1: Borda azul
- Pistão 2: Borda roxa
- Pistão 3: Borda rosa
- Pistão 4: Borda laranja
- Pistão 5: Borda teal
- Pistão 6: Borda índigo

**Endpoint:** `POST /pid/gains`

```json
{
  "piston": 1,
  "kp": 2.5,
  "ki": 0.1,
  "kd": 0.05
}
```

#### 2. **Ganhos PID Globais**

Aplica os mesmos valores para todos os 6 pistões simultaneamente.

**Campos:**

- Kp (todos)
- Ki (todos)
- Kd (todos)

**Endpoint:** `POST /pid/gains/all?kp=2.0&ki=0.1&kd=0.05`

**Uso típico:**

- Configuração inicial rápida
- Testes com valores uniformes
- Calibração simultânea

#### 3. **Ajustes Gerais**

Configurações que afetam o comportamento global do sistema PID.

##### Deadband (dbmm)

**Descrição:** Zona morta em milímetros
**Valor padrão:** 0.2 mm
**Função:** Ignora erros menores que este valor (evita oscilação)

##### PWM Mínimo (minpwm)

**Descrição:** Valor mínimo de PWM aplicado
**Valor padrão:** 0
**Range:** 0-255
**Função:** Define threshold de ativação do motor

**Endpoint:** `POST /pid/settings`

```json
{
  "dbmm": 0.2,
  "minpwm": 0
}
```

#### 4. **Cache de Configurações**

Sistema de persistência no backend.

**Carregamento automático:**

- Ao abrir a página, carrega valores do cache
- Endpoint: `GET /pid/gains` - Retorna ganhos de todos os pistões
- Endpoint: `GET /pid/settings` - Retorna ajustes gerais

**Estrutura do cache de ganhos:**

```json
{
  "1": {"kp": 2.0, "ki": 0.0, "kd": 0.0},
  "2": {"kp": 2.0, "ki": 0.0, "kd": 0.0},
  ...
  "6": {"kp": 2.0, "ki": 0.0, "kd": 0.0}
}
```

**Estrutura do cache de ajustes:**

```json
{
  "dbmm": 0.2,
  "minpwm": 0
}
```

#### 5. **Status de Conexão**

Indicador visual sincronizado com outras páginas.

**Estados:**

- 🟢 **Verde pulsante**: Conectado à serial
- 🔴 **Vermelho**: Desconectado

**Sincronização:**

- Usa `localStorage` para compartilhar estado
- Atualiza a cada 2 segundos
- Reflete estado real do backend

#### 6. **Feedback ao Usuário**

Sistema de notificações toast.

**Tipos de mensagem:**

- ✅ **Success** (verde): Configuração aplicada com sucesso
- ❌ **Error** (vermelho): Falha ao aplicar
- ⚠️ **Warning** (amarelo): Avisos
- ℹ️ **Info** (azul): Informações gerais

**Exemplos:**

- "Ganhos aplicados no pistão 3: Kp=2.5, Ki=0.1, Kd=0.05"
- "Ganhos aplicados em TODOS os pistões: Kp=2.0, Ki=0.0, Kd=0.0"
- "Ajustes aplicados: dbmm=0.2, minpwm=0"

---

## 🔌 Backend API - Endpoints Comuns

### Serial

- `GET /serial/available` - Lista portas COM disponíveis
- `POST /serial/open` - Abre conexão (body: `{port, baud}`)
- `POST /serial/close` - Fecha conexão
- `GET /serial/status` - Status atual (`{connected, port}`)
- `POST /serial/send` - Envia comando (body: `{command}`)

### Cinemática

- `POST /calculate` - Calcula cinemática inversa
  - Input: `{x, y, z, roll, pitch, yaw}`
  - Output: `{pose, actuators, valid, base_points, platform_points}`

### PID

- `GET /pid/gains` - Retorna ganhos de todos os pistões
- `POST /pid/gains` - Define ganhos de um pistão (body: `{piston, kp, ki, kd}`)
- `POST /pid/gains/all` - Define ganhos de todos (query: `?kp=&ki=&kd=`)
- `GET /pid/settings` - Retorna ajustes gerais
- `POST /pid/settings` - Define ajustes (body: `{dbmm, minpwm}`)

### WebSocket

- `ws://localhost:8001/ws/telemetry` - Stream de telemetria em tempo real

---

## 🎨 Design System

### Cores Primárias

- **Fundo**: Gradiente gray-900 → gray-800
- **Cards**: gray-800 com borda gray-700
- **Texto**: white (títulos), gray-300 (normal), gray-400 (secundário)

### Pistões (Identificação Visual)

| Pistão | Cor Principal | Código Hex | Uso                      |
| ------ | ------------- | ---------- | ------------------------ |
| 1      | Azul          | `#3b82f6`  | Gráficos, bordas, botões |
| 2      | Roxo          | `#a855f7`  | Gráficos, bordas, botões |
| 3      | Rosa          | `#ec4899`  | Gráficos, bordas, botões |
| 4      | Laranja       | `#f97316`  | Gráficos, bordas, botões |
| 5      | Teal          | `#14b8a6`  | Gráficos, bordas, botões |
| 6      | Índigo        | `#6366f1`  | Gráficos, bordas, botões |

### Feedback Visual

- **Sucesso**: Verde `#10b981`
- **Erro**: Vermelho `#ef4444`
- **Aviso**: Amarelo `#f59e0b`
- **Info**: Azul `#3b82f6`

### Tipografia

- **Fonte**: Inter (Google Fonts)
- **Mono**: Courier New (console)

---

## 🚀 Fluxo de Trabalho Típico

### 1. Controle PID Normal (actuators.html)

1. Conectar à porta serial do ESP32-S3
2. Iniciar gravação no gráfico
3. Definir setpoints (global ou individual)
4. Monitorar telemetria em tempo real
5. Ajustar ganhos PID se necessário (settings.html)
6. Exportar dados para análise

### 2. Controle por Acelerômetro (motion.html)

1. Conectar à porta serial do ESP32-S3
2. Verificar recepção de dados MPU via WebSocket
3. (Opcional) Recalibrar MPU se necessário
4. Ajustar escala de sensibilidade
5. Ativar controle
6. Mover acelerômetro e observar plataforma
7. Monitorar visualização 3D

### 3. Configuração Inicial (settings.html)

1. Verificar conexão serial
2. Carregar valores atuais do cache
3. Ajustar ganhos PID conforme necessário
4. Configurar deadband e PWM mínimo
5. Aplicar configurações
6. Testar em actuators.html ou motion.html

---

## 📝 Notas de Desenvolvimento

### Performance

- **Gráfico**: Limitado a 500 pontos em memória (smooth rendering)
- **IndexedDB**: Sem limite (armazenamento persistente)
- **WebSocket**: Reconexão automática a cada 3s
- **3D**: Clear+Recreate evita memory leaks

### Compatibilidade

- **Navegadores**: Chrome, Edge, Firefox (modern browsers)
- **Dependências CDN**:
  - Tailwind CSS
  - Chart.js v4.4.0
  - Hammer.js v2.0.8
  - chartjs-plugin-zoom v2.0.1
  - Toastify.js
  - Three.js r128

### Segurança

- **Validação**: Todos os inputs numéricos validados
- **Limitação de ângulos**: Previne comandos perigosos
- **Status visual**: Sempre mostra estado da conexão
- **Feedback**: Toasts para todas as ações importantes

### Debug

- **Console logs**: Mantidos para troubleshooting
- **WebSocket debug**: Comentados mas disponíveis
- **3D debug**: Extensive logging disponível

---

## 🆘 Troubleshooting

### Serial não conecta

1. Verificar se backend está rodando (`python app.py`)
2. Verificar porta COM correta (Device Manager)
3. Fechar outras aplicações usando a porta
4. Tentar atualizar lista de portas

### Gráfico não atualiza

1. Verificar se WebSocket está conectado
2. Clicar em "Iniciar" gravação
3. Verificar se ESP32 está enviando telemetria
4. Abrir console do navegador para erros

### 3D não renderiza

1. Verificar console do navegador
2. Confirmar que dados estão chegando
3. Verificar se controle está ativo
4. Tentar recarregar página (Ctrl+F5)

### Configurações não salvam

1. Verificar conexão com backend
2. Confirmar resposta OK no console
3. Recarregar página para verificar cache
4. Verificar logs do backend

---

**Desenvolvido por:** Instituto Federal de São Paulo (IFSP)  
**Versão:** 1.0  
**Data:** Novembro 2025
