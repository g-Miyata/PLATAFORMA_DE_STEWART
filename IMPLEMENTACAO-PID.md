# 🎮 Interface Web - Controle PID da Plataforma Stewart

## ✨ O que foi implementado

Criei uma interface web completa com **Tailwind CSS** que replica todas as funcionalidades do `pid-control.py`, mas com uma interface moderna e responsiva.

### 📁 Arquivos Criados/Modificados

1. **`interface/frontend/pid-control.html`** ⭐ NOVO

   - Interface web completa com Tailwind CSS
   - Console RX/TX em tempo real
   - Telemetria visual de 6 pistões
   - Controle de setpoints (global e individual)
   - Ajuste de ganhos PID por pistão
   - Controle manual (Avanço/Recuo/Parar)
   - Ajustes gerais (deadband, filtro, PWM mínimo)

2. **`interface/backend/app.py`** ✏️ MODIFICADO

   - Adicionados novos modelos Pydantic:
     - `PIDCommand`, `PIDGains`, `PIDSetpoint`, `PIDFeedforward`, `PIDSettings`
   - Novos endpoints REST:
     - `/serial/send` - Comando livre
     - `/pid/setpoint` - Setpoint global/individual
     - `/pid/gains` - Ganhos por pistão
     - `/pid/gains/all` - Ganhos para todos
     - `/pid/feedforward` - Feedforward individual
     - `/pid/feedforward/all` - Feedforward para todos
     - `/pid/settings` - Ajustes gerais
     - `/pid/manual/{action}` - Controle manual
     - `/pid/select/{piston}` - Seleção de pistão

3. **`interface/README-PID.md`** 📖 NOVO

   - Documentação completa
   - Guia de uso
   - Comparação com pid-control.py
   - Troubleshooting
   - Lista de comandos úteis

4. **`interface/backend/test_pid_endpoints.py`** 🧪 NOVO

   - Script de teste dos endpoints
   - Verificação rápida da API

5. **`interface/start-backend.bat`** 🚀 NOVO
   - Script para iniciar o backend rapidamente (Windows)

---

## 🚀 Como Usar

### Passo 1: Iniciar o Backend

**Opção A - Script automático (Windows):**

```bash
# No diretório ESP32S3/interface/
./start-backend.bat
```

**Opção B - Manualmente:**

```bash
cd interface/backend
python app.py
```

O servidor estará em: `http://localhost:8001`

### Passo 2: Abrir a Interface

Abra no navegador:

```
interface/frontend/pid-control.html
```

### Passo 3: Conectar e Usar

1. **Selecione a porta COM** do ESP32
2. Clique em **"Conectar"**
3. Comece a controlar! 🎮

---

## 🎨 Recursos da Interface

### 📊 Telemetria em Tempo Real

- 6 painéis coloridos (um para cada pistão)
- Mostra **Y (posição)** e **PWM** em tempo real
- Atualização automática via WebSocket
- Cores únicas para fácil identificação

### 🎯 Controle de Setpoints

- **Global**: Aplica o mesmo valor para todos
- **Individual**: Controle pistão por pistão
- Valores em milímetros (precisão 0.1mm)

### ⚙️ Ganhos PID

- 6 seções coloridas (uma por pistão)
- Ajuste de **Kp, Ki, Kd** individualmente
- Botão "Aplicar em Todos" para sincronização
- Valores padrão: Kp=2.0, Ki=0.0, Kd=0.0

### 🔧 Ajustes Gerais

- **Deadband (mm)**: Zona morta/histerese
- **Freq. Filtro (Hz)**: Filtro passa-baixa
- **PWM Mínimo**: Limite inferior de PWM

### 🕹️ Controle Manual

- Seleciona um pistão (1-6)
- **▲ Avanço**: Estende o pistão
- **▼ Recuo**: Retrai o pistão
- **⏹ Parar**: Para o movimento

### 📟 Console RX/TX

- Exibe todos os comandos enviados (TX) em azul
- Exibe todas as respostas (RX) em verde
- Histórico com timestamp
- Campo para comandos livres

---

## 🆚 Comparação: pid-control.py vs pid-control.html

| Funcionalidade | Python (Tkinter)    | Web (Tailwind)      |
| -------------- | ------------------- | ------------------- |
| Interface      | Desktop             | Navegador           |
| Design         | Básico              | Moderno/Responsivo  |
| Telemetria     | Texto simples       | Painéis coloridos   |
| Ganhos PID     | Formulários         | Cards visuais       |
| Console        | Texto monocromático | Cores diferenciadas |
| Portabilidade  | Requer Python       | Qualquer navegador  |
| Gravação CSV   | ✅                  | ❌                  |
| WebSocket      | ❌                  | ✅                  |

---

## 🔌 Endpoints da API

A interface usa os seguintes endpoints:

### Serial

```
GET  /serial/ports          # Lista portas disponíveis
POST /serial/open           # Conecta à serial
POST /serial/close          # Desconecta
POST /serial/send           # Envia comando livre
```

### PID Control

```
POST /pid/setpoint          # Define setpoint
POST /pid/gains             # Define ganhos (individual)
POST /pid/gains/all         # Define ganhos (todos)
POST /pid/feedforward       # Define feedforward
POST /pid/feedforward/all   # Define feedforward (todos)
POST /pid/settings          # Ajusta dbmm, fc, minpwm
POST /pid/manual/{action}   # Controle manual (A/R/ok)
POST /pid/select/{piston}   # Seleciona pistão
```

### WebSocket

```
WS /ws/telemetry            # Stream de dados em tempo real
```

---

## 💡 Dicas de Uso

1. **Sempre conecte à serial primeiro** antes de enviar comandos
2. Use **Setpoint Global = 0** para posição inicial segura
3. Configure **Kp baixo** (ex: 0.5) e aumente gradualmente
4. O **Console** é útil para debug - mostra todos os comandos
5. **Telemetria** atualiza a cada 100ms automaticamente
6. Use **Controle Manual** para testar cada pistão individualmente

---

## 🐛 Troubleshooting

### Porta COM não aparece

- Verifique se o ESP32 está conectado via USB
- Clique em "↻ Atualizar"
- Verifique o Gerenciador de Dispositivos (Windows)

### WebSocket não conecta

- Certifique-se que o backend está rodando em `localhost:8001`
- Verifique o console do navegador (F12)
- Tente reconectar à serial

### Comandos não funcionam

- Veja se o indicador está verde (✅ Conectado)
- Verifique o console para mensagens de erro
- Teste com comando simples: `v?`

---

## 📝 Comandos Úteis (Console Livre)

```
v?          # Lê tensão do pistão selecionado
zero        # Calibra zero (posição retraída)
mark100     # Calibra 100% (posição estendida)
sel=N       # Seleciona pistão N (1-6)
spmm=100    # Setpoint global = 100mm
spmm3=50    # Setpoint pistão 3 = 50mm
kpmm=2.5    # Kp do pistão selecionado
kpall=2.0   # Kp para todos os pistões
A           # Avanço manual
R           # Recuo manual
ok          # Para movimento manual
```

---

## 🎯 Próximos Passos

1. ✅ Interface implementada
2. ✅ Endpoints do backend criados
3. ✅ WebSocket funcionando
4. ⏳ **Teste com hardware real**
5. ⏳ Adicionar feedforward na interface (opcional)
6. ⏳ Implementar gravação de CSV via backend (opcional)

---

## 🔗 Arquivos Relacionados

- **Interface de Cinemática**: `kinematics.html` - Controle por pose 3D
- **Interface de Atuadores**: `actuators.html` - Visualização 3D
- **Código Arduino**: `esp32s3_codes/pid-control/pid-control.ino`
- **Python Original**: `python_interfaces/pid-control.py`

---

**Desenvolvido para o projeto Stewart Platform - IFSP** 🎓
