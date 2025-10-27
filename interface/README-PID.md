# Interface Web - Controle PID Stewart Platform

Esta interface HTML permite controlar completamente os 6 pistões da plataforma Stewart através de uma interface web moderna, replicando todas as funcionalidades do `pid-control.py` original.

## 🚀 Como Usar

### 1. Iniciar o Backend

Certifique-se de que o backend FastAPI está rodando:

```bash
cd interface/backend
python app.py
```

O servidor estará disponível em `http://localhost:8001`

### 2. Abrir a Interface

Abra o arquivo no navegador:

```
interface/frontend/pid-control.html
```

Ou acesse através de um servidor local.

## 📋 Funcionalidades

### 🔌 Conexão Serial

- **Listar portas**: Atualiza automaticamente as portas COM disponíveis
- **Conectar/Desconectar**: Estabelece conexão serial a 115200 baud
- **Status em tempo real**: Indicador visual do estado da conexão

### 📟 Console RX/TX

- Exibe todas as mensagens recebidas (RX) e enviadas (TX)
- Histórico com timestamp
- Comando livre para enviar comandos customizados
- Auto-scroll e limite de 500 linhas

### 📊 Telemetria em Tempo Real

- **6 Painéis coloridos** mostrando:
  - Posição atual (Y) em mm
  - PWM aplicado (0-255)
- **Setpoint global** exibido no topo
- Atualização automática via WebSocket

### 🎯 Setpoints (mm)

- **Global**: Aplica o mesmo setpoint para todos os pistões
- **Individual**: Controle individual por pistão (1-6)
- Valores em milímetros com precisão de 0.1mm

### ⚙️ Ganhos PID por Pistão

- **6 painéis coloridos** (um para cada pistão)
- Ajuste individual de:
  - **Kp** (Proporcional)
  - **Ki** (Integral)
  - **Kd** (Derivativo)
- **Aplicar para todos**: Define os mesmos ganhos para todos os pistões de uma vez

### 🔧 Ajustes Gerais

- **Deadband (mm)**: Zona morta/histerese (padrão: 0.2mm)
- **Frequência do Filtro (Hz)**: Filtro passa-baixa (padrão: 4.0Hz)
- **PWM Mínimo**: Valor mínimo de PWM aplicado (0-255)

### 🕹️ Controle Manual

- **Selecionar pistão**: Escolhe qual pistão controlar (1-6)
- **Ações**:
  - ▲ **Avanço**: Estende o pistão selecionado
  - ▼ **Recuo**: Retrai o pistão selecionado
  - ⏹ **Parar**: Para o movimento

## 🎨 Design

- Interface moderna com **Tailwind CSS**
- Design responsivo (funciona em tablets e desktops)
- Cores diferenciadas para cada pistão (facilita identificação)
- Feedback visual em tempo real
- Console estilo terminal

## 📡 API Endpoints Utilizados

A interface utiliza os seguintes endpoints do backend:

### Serial

- `GET /serial/ports` - Lista portas disponíveis
- `POST /serial/open` - Abre conexão serial
- `POST /serial/close` - Fecha conexão serial
- `POST /serial/send` - Envia comando livre

### PID Control

- `POST /pid/setpoint` - Define setpoint (global ou individual)
- `POST /pid/gains` - Define ganhos PID (individual)
- `POST /pid/gains/all` - Define ganhos PID (todos)
- `POST /pid/feedforward` - Define feedforward (individual)
- `POST /pid/feedforward/all` - Define feedforward (todos)
- `POST /pid/settings` - Ajusta dbmm, fc, minpwm
- `POST /pid/manual/{action}` - Controle manual (A/R/ok)
- `POST /pid/select/{piston}` - Seleciona pistão

### WebSocket

- `WS /ws/telemetry` - Stream de telemetria em tempo real

## 🔄 Comparação com pid-control.py

| Funcionalidade             | pid-control.py    | pid-control.html |
| -------------------------- | ----------------- | ---------------- |
| Conexão Serial             | ✅                | ✅               |
| Console RX/TX              | ✅                | ✅               |
| Telemetria 6 pistões       | ✅                | ✅               |
| Setpoint Global/Individual | ✅                | ✅               |
| Ganhos PID por pistão      | ✅                | ✅               |
| Ganhos PID para todos      | ✅                | ✅               |
| Feedforward U0_adv/U0_ret  | ❌ (na interface) | ✅ (backend)     |
| Ajustes dbmm/fc/minpwm     | ✅                | ✅               |
| Controle Manual A/R/ok     | ✅                | ✅               |
| Comando Livre              | ✅                | ✅               |
| Gravação CSV               | ✅                | ❌               |
| Interface                  | Tkinter           | Web (Tailwind)   |

## 💡 Dicas de Uso

1. **Sempre conecte à serial primeiro** antes de enviar comandos
2. Use o **Setpoint Global** para movimentos sincronizados
3. Configure os **ganhos PID** começando com Kp baixo e aumentando gradualmente
4. O **Console** mostra todos os comandos enviados (útil para debug)
5. A **telemetria** atualiza automaticamente a cada 100ms
6. Use o **Controle Manual** para testes individuais de cada pistão

## 🐛 Troubleshooting

### WebSocket não conecta

- Verifique se o backend está rodando em `localhost:8001`
- Verifique o console do navegador (F12) para erros

### Porta serial não aparece

- Verifique se o ESP32 está conectado
- Clique em "Atualizar" para recarregar as portas
- No Windows, verifique o Gerenciador de Dispositivos

### Comandos não estão sendo enviados

- Verifique se está conectado (indicador verde)
- Veja o console para mensagens de erro
- Teste com um comando livre simples como `v?`

## 📝 Comandos Úteis

Você pode enviar estes comandos pelo campo "Comando Livre":

- `v?` - Lê tensão do pistão selecionado
- `zero` - Calibra zero do pistão selecionado
- `mark100` - Calibra 100% do pistão selecionado
- `sel=N` - Seleciona pistão N (1-6)
- `spmm=X` - Define setpoint global
- `spmmN=X` - Define setpoint do pistão N
- `kpmm=X` - Define Kp do pistão selecionado
- `kpall=X` - Define Kp para todos
- `A` - Avanço manual
- `R` - Recuo manual
- `ok` - Para movimento manual

## 🔗 Links Relacionados

- **Interface de Cinemática**: `kinematics.html` - Controle por pose (x,y,z,roll,pitch,yaw)
- **Interface de Atuadores**: `actuators.html` - Visualização 3D simplificada
- **Backend API**: `backend/app.py` - Servidor FastAPI

---

Desenvolvido para o projeto Stewart Platform - IFSP
