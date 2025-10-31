# 🎬 Interface de Rotinas de Movimento

Interface web para controlar trajetórias automáticas da Plataforma Stewart com presets prontos.

## 🚀 Como Usar

1. **Inicie o backend**:

   ```bash
   cd interface/backend
   python app.py
   ```

2. **Abra a interface**:

   - Navegue para `interface/frontend/menu.html`
   - Clique em **"Motion Routines"**

3. **Execute uma rotina**:

   - Escolha um preset
   - Ajuste os parâmetros (amplitude, frequência, duração)
   - Clique em **▶️ Iniciar**

4. **Parar rotina**:
   - Clique em **⏹️ Parar** (retorna suavemente ao home)

## 📋 Presets Disponíveis

### 🔵 Seno Vertical (Z)

Movimento senoidal puro no eixo Z (altura).

**Parâmetros:**

- Amplitude: 1-20 mm (padrão: 8 mm)
- Frequência: 0.1-2 Hz (padrão: 0.3 Hz)
- Duração: 5-300 s (padrão: 45 s)

**Uso:** Testes de vibração vertical, calibração de sensores.

---

### 🟣 Círculo XY

Movimento circular/elíptico no plano horizontal.

**Parâmetros:**

- Raio X: 1-40 mm (padrão: 12 mm)
- Raio Y: 1-40 mm (padrão: 8 mm)
- Frequência: 0.1-2 Hz (padrão: 0.25 Hz)
- Duração: 5-300 s (padrão: 60 s)

**Uso:** Testes de trajetória circular, simulação de órbitas.

---

### 🌸 Lissajous XY

Figura-8 complexa com frequências diferentes em X e Y.

**Parâmetros:**

- Amp X: 1-40 mm (padrão: 12 mm)
- Amp Y: 1-40 mm (padrão: 8 mm)
- Freq X: 0.1-2 Hz (padrão: 0.2 Hz)
- Freq Y: 0.1-2 Hz (padrão: 0.3 Hz)
- Duração: 5-300 s (padrão: 90 s)

**Uso:** Testes complexos, padrões harmônicos, demonstração visual.

---

### 🟠 Heave-Pitch

Simula movimento de onda com Z e pitch combinados (+90° de fase).

**Parâmetros:**

- Amplitude Z: 1-20 mm (padrão: 8 mm)
- Amplitude Pitch: 0.5-8° (padrão: 2.5°)
- Frequência: 0.1-2 Hz (padrão: 0.2 Hz)
- Duração: 5-300 s (padrão: 40 s)

**Uso:** Simulação marítima, testes de estabilidade.

---

### 🔷 Seno Pitch

Balanço angular em pitch (frente/trás).

**Parâmetros:**

- Amplitude: 0.5-8° (padrão: 3°)
- Frequência: 0.1-2 Hz (padrão: 0.25 Hz)
- Duração: 5-300 s (padrão: 30 s)

**Uso:** Testes de inclinação frontal, simulação de rampa.

---

### 🔶 Seno Roll

Balanço angular em roll (esquerda/direita).

**Parâmetros:**

- Amplitude: 0.5-8° (padrão: 3°)
- Frequência: 0.1-2 Hz (padrão: 0.25 Hz)
- Duração: 5-300 s (padrão: 30 s)

**Uso:** Testes de inclinação lateral, simulação de curva.

---

## 🎛️ Recursos da Interface

### ✅ Status em Tempo Real

- **Indicador visual**: Bolinha verde pulsante quando rodando
- **Timer**: Mostra tempo decorrido (MM:SS)
- **Info da rotina**: Nome, duração e frequência

### 🎨 Cards Visuais

- **Hover effect**: Animação ao passar o mouse
- **Card ativo**: Destaque verde quando a rotina está rodando
- **Ícones**: Cada preset tem emoji único para fácil identificação

### ⚙️ Parâmetros Ajustáveis

- **Inputs numéricos**: Valores com validação (min/max/step)
- **Valores padrão**: Pré-configurados para uso imediato
- **Feedback visual**: Border verde ao focar no input

### 🔒 Segurança

- **Validação backend**: Todos os parâmetros validados pela API
- **Limites de pose**: Poses inválidas são rejeitadas automaticamente
- **Stop suave**: Retorno gradual ao home (sem jerks)

## 🧪 Exemplos de Teste

### 1. Teste Rápido de Vibração

```
Preset: Seno Vertical (Z)
Amplitude: 5 mm
Frequência: 0.5 Hz
Duração: 20 s
```

### 2. Círculo Suave

```
Preset: Círculo XY
Raio X: 10 mm
Raio Y: 10 mm
Frequência: 0.2 Hz
Duração: 60 s
```

### 3. Simulação de Onda

```
Preset: Heave-Pitch
Amp Z: 10 mm
Amp Pitch: 3°
Frequência: 0.15 Hz
Duração: 60 s
```

### 4. Figura-8 Complexa

```
Preset: Lissajous XY
Amp X: 15 mm, Amp Y: 10 mm
Freq X: 0.2 Hz, Freq Y: 0.4 Hz
Duração: 120 s
```

## 🐛 Troubleshooting

### Erro: "Rotina já está rodando"

**Causa:** Tentou iniciar nova rotina sem parar a anterior.
**Solução:** Clique em ⏹️ Parar primeiro.

### Erro: "Pose inválida"

**Causa:** Parâmetros resultam em pose fora dos limites mecânicos.
**Solução:** Reduza amplitude ou verifique se h0/stroke_min estão corretos.

### Timer não atualiza

**Causa:** Rotina terminou por erro (serial não conectada, pose inválida).
**Solução:** Verifique logs do backend, conecte serial.

### Card não fica verde

**Causa:** Rotina falhou imediatamente (serial não aberta).
**Solução:** Conecte ESP32 via serial antes de iniciar.

## 📡 Comunicação com Backend

A interface se comunica com o backend via:

- **POST /motion/start**: Inicia rotina
- **POST /motion/stop**: Para rotina
- **GET /motion/status**: Consulta status (polling a cada 500ms)

## 🎓 Notas Técnicas

- **Ramp-in/out**: Todas as rotinas têm transições suaves (2s ou 20% da duração)
- **Frequência de execução**: 60 Hz (dt = 16.67 ms)
- **Validação contínua**: Cada pose é validada pela IK antes de enviar
- **Auto-stop**: Rotina para automaticamente se pose ficar inválida
- **Retorno ao home**: Gradual em ~1.5s após parar

## 🔗 Ver Também

- [MOTION-ROUTINES.md](../backend/MOTION-ROUTINES.md) - Documentação completa da API
- [README-PID.md](README-PID.md) - Controle PID manual
- [README-GRAFICO.md](README-GRAFICO.md) - Telemetria em tempo real

---

**Versão**: 1.0.0  
**Data**: Outubro 2025
