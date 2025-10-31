# 🎬 Motor de Rotinas de Movimento - Stewart Platform

## 📋 Visão Geral

Sistema de execução de trajetórias senoidais automáticas para a plataforma Stewart, com controle via API REST e feedback em tempo real via WebSocket.

## ✨ Características

- **Execução em Thread Separada**: Não bloqueia o servidor FastAPI
- **Ramp-in/Ramp-out Suaves**: Transições suaves com curva cosseno (2s ou 20% da duração)
- **Validação Contínua**: Todas as poses são validadas pela cinemática inversa
- **Feedback em Tempo Real**: Eventos `motion_tick` via WebSocket a 60 Hz
- **Retorno Automático ao Home**: Ao parar, retorna suavemente para (0,0,h0,0,0,0)
- **Limites de Segurança**: Poses limitadas automaticamente

## 🎯 Rotinas Disponíveis

### 1. `sine_axis` - Movimento Senoidal em Um Eixo

Movimento senoidal puro em um eixo (x, y, z, roll, pitch, yaw).

**Parâmetros:**

- `axis` (obrigatório): `"x"`, `"y"`, `"z"`, `"roll"`, `"pitch"`, `"yaw"`
- `amp` (opcional): Amplitude
  - Padrão: 5 mm para eixos lineares (x,y,z)
  - Padrão: 2° para eixos angulares (roll,pitch,yaw)
- `offset` (opcional): Valor central
  - Padrão: 0 para x,y,roll,pitch,yaw
  - Padrão: h0 (432mm) para z
- `hz`: Frequência (padrão 0.2 Hz)
- `duration_s`: Duração (padrão 60s)

**Exemplo:**

```json
POST /motion/start
{
  "routine": "sine_axis",
  "axis": "z",
  "amp": 8,
  "hz": 0.3,
  "duration_s": 45
}
```

---

### 2. `circle_xy` - Círculo no Plano XY

Movimento circular (ou elíptico) no plano horizontal.

**Parâmetros:**

- `ax` (opcional): Raio X em mm (padrão: 10)
- `ay` (opcional): Raio Y em mm (padrão: 10)
- `phx` (opcional): Fase inicial em graus (padrão: 0)
- `hz`: Frequência de rotação (padrão 0.2 Hz)
- `duration_s`: Duração (padrão 60s)

**Exemplo:**

```json
POST /motion/start
{
  "routine": "circle_xy",
  "ax": 12,
  "ay": 8,
  "hz": 0.25,
  "duration_s": 60
}
```

---

### 3. `lissajous_xy` - Curva de Lissajous XY

Movimento complexo com frequências independentes em X e Y.

**Fórmulas:**

- x = ax · sin(2π·fx·t + phx)
- y = ay · sin(2π·fy·t + phy)

**Parâmetros:**

- `ax`, `ay` (opcional): Amplitudes em mm (padrão: 10, 6)
- `fx`, `fy` (opcional): Frequências independentes (padrão: hz, hz×1.5)
- `phx`, `phy` (opcional): Fases em graus (padrão: 0, 90)
- `duration_s`: Duração (padrão 60s)

**Exemplo:**

```json
POST /motion/start
{
  "routine": "lissajous_xy",
  "ax": 10,
  "ay": 6,
  "fx": 0.2,
  "fy": 0.3,
  "phx": 0,
  "phy": 90,
  "duration_s": 90
}
```

---

### 4. `heave_pitch` - Movimento Combinado Vertical + Pitch

Simula movimento de onda (heave + pitch com 90° de defasagem).

**Fórmulas:**

- z = h0 + amp · sin(2π·hz·t)
- pitch = ay · sin(2π·hz·t + 90°)

**Parâmetros:**

- `amp` (opcional): Amplitude vertical em mm (padrão: 8)
- `ay` (opcional): Amplitude de pitch em graus (padrão: 2.5)
- `hz`: Frequência (padrão 0.2 Hz)
- `duration_s`: Duração (padrão 60s)

**Exemplo:**

```json
POST /motion/start
{
  "routine": "heave_pitch",
  "amp": 8,
  "ay": 2.5,
  "hz": 0.2,
  "duration_s": 40
}
```

---

## 🛑 Controle de Execução

### Parar Rotina

```http
POST /motion/stop
```

Interrompe a rotina atual e retorna suavemente para home em ~1.5s.

**Resposta:**

```json
{
  "message": "Rotina parada"
}
```

---

### Consultar Status

```http
GET /motion/status
```

**Resposta:**

```json
{
  "running": true,
  "routine": "sine_axis",
  "params": {
    "routine": "sine_axis",
    "axis": "z",
    "amp": 8,
    "hz": 0.3,
    "duration_s": 45
  },
  "started_at": 1698765432.123,
  "elapsed": 12.456
}
```

---

## 📡 WebSocket - Eventos em Tempo Real

Conecte ao WebSocket `/ws/telemetry` para receber eventos:

### Evento `motion_tick`

Enviado a cada passo (60 Hz) durante a execução da rotina.

```json
{
  "type": "motion_tick",
  "t": 3.45,
  "pose_cmd": {
    "x": 0,
    "y": 0,
    "z": 440.0,
    "roll": 0,
    "pitch": 0,
    "yaw": 0
  },
  "routine": "sine_axis"
}
```

---

## 🔒 Limites de Segurança

Todas as poses são automaticamente limitadas:

| Parâmetro        | Mínimo   | Máximo   |
| ---------------- | -------- | -------- |
| x, y             | -50 mm   | +50 mm   |
| z                | h0-20 mm | h0+40 mm |
| roll, pitch, yaw | -10°     | +10°     |

Poses que violam os limites da cinemática inversa param a rotina automaticamente.

---

## 🧪 Exemplos de Teste

### 1. Seno em Z (básico)

```bash
curl -X POST http://localhost:8001/motion/start \
  -H "Content-Type: application/json" \
  -d '{
    "routine": "sine_axis",
    "axis": "z",
    "amp": 5,
    "hz": 0.2,
    "duration_s": 30
  }'
```

### 2. Círculo Elíptico

```bash
curl -X POST http://localhost:8001/motion/start \
  -H "Content-Type: application/json" \
  -d '{
    "routine": "circle_xy",
    "ax": 15,
    "ay": 10,
    "hz": 0.15,
    "duration_s": 60
  }'
```

### 3. Figura-8 (Lissajous com ratio 1:2)

```bash
curl -X POST http://localhost:8001/motion/start \
  -H "Content-Type: application/json" \
  -d '{
    "routine": "lissajous_xy",
    "ax": 12,
    "ay": 12,
    "fx": 0.2,
    "fy": 0.4,
    "phx": 0,
    "phy": 90,
    "duration_s": 120
  }'
```

### 4. Simulação de Onda Marítima

```bash
curl -X POST http://localhost:8001/motion/start \
  -H "Content-Type: application/json" \
  -d '{
    "routine": "heave_pitch",
    "amp": 10,
    "ay": 3,
    "hz": 0.25,
    "duration_s": 60
  }'
```

### 5. Parar Rotina

```bash
curl -X POST http://localhost:8001/motion/stop
```

### 6. Verificar Status

```bash
curl http://localhost:8001/motion/status
```

---

## ⚙️ Parâmetros Globais

| Parâmetro    | Tipo  | Limites      | Padrão |
| ------------ | ----- | ------------ | ------ |
| `duration_s` | float | 0 < x ≤ 3600 | 60.0   |
| `hz`         | float | 0 < x ≤ 2.0  | 0.2    |

---

## 🐛 Debug & Logs

O servidor imprime logs detalhados:

```
🎬 Rotina 'sine_axis' iniciada
▶️  Iniciando rotina 'sine_axis' por 45.0s @ 0.3Hz
✅ Rotina 'sine_axis' finalizada (2700 passos)
🏠 Retornando para home...
⏹️  Parando rotina...
```

Em caso de pose inválida:

```
❌ Pose inválida em t=12.34s: {'x': 0, 'y': 0, 'z': 550, ...}
```

---

## 🎓 Notas Técnicas

1. **Frequência de Atualização**: 60 Hz (dt = 16.67 ms)
2. **Espaçamento Serial**: 1.5 ms entre comandos `spmm1..6`
3. **Ramp Suave**: Curva cosseno para evitar jerks
4. **Thread Daemon**: Termina automaticamente com o servidor
5. **Event Loop**: Usa o loop do FastAPI para broadcast assíncrono

---

## ⚠️ Avisos

- **Não inicie múltiplas rotinas simultaneamente**: Pare a anterior primeiro
- **Supervisione a primeira execução**: Verifique se os limites são adequados
- **Conexão Serial Necessária**: A serial deve estar aberta
- **Validação Contínua**: Rotinas param automaticamente se a pose ficar inválida

---

## 🚀 Roadmap Futuro

- [ ] Rotinas compostas (sequências de movimentos)
- [ ] Interpolação suave entre rotinas
- [ ] Salvamento/carregamento de trajetórias customizadas
- [ ] Preview de trajetória antes da execução
- [ ] Ajuste de velocidade em tempo real (speed multiplier)

---

**Versão**: 1.0.0  
**Data**: Outubro 2025  
**Autor**: Sistema de Controle Stewart Platform
