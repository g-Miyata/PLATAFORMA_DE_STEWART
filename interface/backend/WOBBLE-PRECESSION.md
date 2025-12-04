# 🌀 Wobble Precession - Documentação

## Descrição

A rotina **wobble_precession** simula o movimento de um disco tipo "Euler's Disk" na plataforma Stewart. Este movimento combina:

- **Inclinação precessionante**: O vetor de inclinação da plataforma gira azimutalmente (precessão)
- **Rotação em yaw**: Rotação lenta e contínua da plataforma em torno do eixo vertical
- **Oscilação em Z**: Movimento vertical senoidal sincronizado (ou com fase configurável)

## Parâmetros

| Parâmetro       | Tipo  | Default   | Range       | Descrição                              |
| --------------- | ----- | --------- | ----------- | -------------------------------------- |
| `tilt_deg`      | float | 3.0       | 1.0-8.0°    | Amplitude de inclinação (graus pico)   |
| `tilt_bias_deg` | float | 0.0       | 0.0-5.0°    | Inclinação constante adicional (graus) |
| `prec_hz`       | float | 0.4       | 0.1-1.0 Hz  | Frequência da precessão                |
| `yaw_hz`        | float | 0.1       | 0.05-0.5 Hz | Frequência de rotação em yaw           |
| `z_amp_mm`      | float | 6.0       | 2.0-15.0 mm | Amplitude do movimento vertical        |
| `z_hz`          | float | `prec_hz` | 0.1-2.0 Hz  | Frequência do movimento vertical       |
| `z_phase_deg`   | float | 90.0      | 0-360°      | Fase do movimento vertical             |
| `phx`           | float | 0.0       | 0-360°      | Fase azimutal inicial da precessão     |
| `duration_s`    | float | 40.0      | 5-300 s     | Duração da rotina                      |

## Física do Movimento

A rotina implementa as seguintes equações:

```python
# Inclinação total (modulada senoidalmente)
theta(t) = tilt_bias_deg + tilt_deg * sin(2π * prec_hz * t)

# Ângulo azimutal da precessão
phi(t) = 2π * prec_hz * t + phx(rad)

# Decomposição da inclinação em roll e pitch
roll(t)  = theta(t) * cos(phi(t))
pitch(t) = theta(t) * sin(phi(t))

# Rotação acumulada em yaw
yaw(t) = 360° * yaw_hz * t

# Movimento vertical oscilante
z(t) = h0 + z_amp_mm * sin(2π * z_hz * t + z_phase_deg(rad))
```

### Descrição dos Movimentos

1. **Vetor de inclinação**: A plataforma mantém uma inclinação `theta(t)` que varia senoidalmente ao longo do tempo
2. **Precessão**: Este vetor de inclinação gira no plano horizontal com frequência `prec_hz`
3. **Roll e Pitch**: São as projeções da inclinação nos eixos X e Y
4. **Yaw**: Acumula continuamente, criando uma rotação lenta
5. **Z**: Oscila verticalmente, tipicamente com fase de 90° em relação à inclinação

## Exemplos de Uso

### 1. Wobble Padrão (Suave)

Movimento clássico de Euler's Disk com oscilação vertical sincronizada:

```bash
POST http://localhost:8001/motion/start
Content-Type: application/json

{
  "routine": "wobble_precession",
  "duration_s": 40,
  "prec_hz": 0.4,
  "yaw_hz": 0.1,
  "tilt_deg": 3.0,
  "tilt_bias_deg": 0.0,
  "z_amp_mm": 6.0,
  "z_phase_deg": 90
}
```

**Características:**

- Precessão em 2.5s (0.4 Hz)
- Rotação yaw completa em 10s (0.1 Hz)
- Inclinação de ±3°
- Oscilação vertical de ±6mm

### 2. Wobble Rápido (Energético)

Movimento mais dinâmico com fase Z sincronizada:

```bash
POST http://localhost:8001/motion/start
Content-Type: application/json

{
  "routine": "wobble_precession",
  "duration_s": 30,
  "prec_hz": 0.6,
  "yaw_hz": 0.15,
  "tilt_deg": 2.5,
  "z_amp_mm": 5,
  "z_phase_deg": 0
}
```

**Características:**

- Precessão em ~1.67s (0.6 Hz)
- Rotação yaw completa em ~6.67s (0.15 Hz)
- Inclinação de ±2.5°
- Oscilação vertical de ±5mm em fase com a inclinação

### 3. Wobble com Inclinação Constante

Movimento com bias de inclinação adicional:

```bash
POST http://localhost:8001/motion/start
Content-Type: application/json

{
  "routine": "wobble_precession",
  "duration_s": 60,
  "prec_hz": 0.3,
  "yaw_hz": 0.08,
  "tilt_deg": 2.0,
  "tilt_bias_deg": 1.5,
  "z_amp_mm": 4,
  "z_phase_deg": 180
}
```

**Características:**

- Inclinação varia entre 1.5° e 3.5° (bias + amplitude)
- Precessão lenta em ~3.33s
- Z em antifase (180°)

### 4. Wobble Minimalista

Movimento sutil para demonstração:

```bash
POST http://localhost:8001/motion/start
Content-Type: application/json

{
  "routine": "wobble_precession",
  "duration_s": 90,
  "prec_hz": 0.25,
  "yaw_hz": 0.05,
  "tilt_deg": 1.5,
  "z_amp_mm": 3,
  "z_phase_deg": 90
}
```

**Características:**

- Movimento muito suave
- Precessão em 4s
- Inclinação de apenas ±1.5°

## Segurança e Limites

A rotina aplica automaticamente os seguintes limites de segurança:

- **Translação XY**: Mantida em (0, 0) - sem deslocamento horizontal
- **Z**: Limitado a [h0-20mm, h0+40mm] onde h0=500mm
- **Roll/Pitch/Yaw**: Limitados a [-10°, +10°]
- **Ramp-in/ramp-out**: Transições suaves de 2s ou 20% da duração (o menor)

### Validação de Cinemática Inversa

Cada pose é validada com cinemática inversa (IK) antes de ser enviada:

- Se uma pose é inválida, a rotina **para imediatamente**
- Retorna suavemente para home (0, 0, h0, 0, 0, 0) em ~1.5s
- Logs indicam o timestamp e a pose problemática

## WebSocket Events

Durante a execução, a rotina envia eventos `motion_tick` via WebSocket:

```json
{
  "type": "motion_tick",
  "t": 2.5,
  "pose_cmd": {
    "x": 0,
    "y": 0,
    "z": 503.2,
    "roll": 2.1,
    "pitch": -1.8,
    "yaw": 90.0
  },
  "routine": "wobble_precession"
}
```

Frequência: **60 Hz** (a cada ~16.67ms)

## Controle via API

### Iniciar Rotina

```bash
POST /motion/start
```

### Parar Rotina

```bash
POST /motion/stop
```

Retorna suavemente para home em ~1.5s.

### Verificar Status

```bash
GET /motion/status
```

Resposta:

```json
{
  "running": true,
  "routine": "wobble_precession",
  "started_at": 1698765432.123,
  "elapsed": 15.7
}
```

## Dicas de Uso

### Relação entre Parâmetros

1. **`z_phase_deg = 90°`**: Z atinge o máximo quando inclinação está em zero (suave)
2. **`z_phase_deg = 0°`**: Z e inclinação sincronizados (mais energético)
3. **`z_phase_deg = 180°`**: Z em antifase com inclinação (interessante visualmente)

4. **`z_hz = prec_hz`**: Z completa um ciclo por revolução da precessão
5. **`z_hz = 2 * prec_hz`**: Z oscila duas vezes por revolução

### Ajuste de Amplitudes

- **Tilt pequeno (1-2°)**: Movimento sutil, elegante
- **Tilt médio (3-4°)**: Movimento visível, dinâmico
- **Tilt grande (5-8°)**: Movimento dramático (pode violar limites se combinado com outros parâmetros)

### Frequências Sugeridas

| Efeito Desejado   | `prec_hz` | `yaw_hz`  | Descrição               |
| ----------------- | --------- | --------- | ----------------------- |
| Lento/Hipnótico   | 0.2-0.3   | 0.05-0.08 | Movimento contemplativo |
| Padrão            | 0.4-0.5   | 0.1-0.12  | Clássico Euler's Disk   |
| Rápido/Energético | 0.6-0.8   | 0.15-0.2  | Movimento dinâmico      |
| Muito Rápido      | 0.9-1.0   | 0.25-0.3  | Demonstração técnica    |

## Troubleshooting

### Rotina para imediatamente

**Possíveis causas:**

- Parâmetros violam limites cinemáticos
- `tilt_deg` + `tilt_bias_deg` muito alto
- Combinação de amplitudes ultrapassa workspace

**Soluções:**

- Reduzir `tilt_deg` para 2-3°
- Reduzir `z_amp_mm` para 4-6mm
- Verificar logs do backend para pose inválida

### Movimento não parece suave

**Possíveis causas:**

- Serial não conectado ou com delays
- Ramp-in muito curto para `duration_s` pequeno

**Soluções:**

- Aumentar `duration_s` para pelo menos 15-20s
- Verificar qualidade da conexão serial
- Testar com `prec_hz` mais baixo (0.3-0.4)

### Z não oscila como esperado

**Possíveis causas:**

- `z_amp_mm` muito pequeno
- `z_phase_deg` não configurado adequadamente

**Soluções:**

- Aumentar `z_amp_mm` para 6-8mm
- Testar diferentes fases: 0°, 90°, 180°

## Integração com Frontend

No arquivo `kinematics.html`, o preset está configurado com:

```javascript
'wobble_precession': {
  routine: 'wobble_precession',
  defaultParams: ['tilt_deg', 'prec_hz', 'yaw_hz', 'z_amp_mm', 'z_phase_deg', 'duration_s'],
  extraDefaults: { tilt_bias_deg: 0.0 }
}
```

O card permite ajustar:

- Tilt (°): 1-8°, step 0.5
- Prec Hz: 0.1-1 Hz, step 0.05
- Yaw Hz: 0.05-0.5 Hz, step 0.05
- Z Amp (mm): 2-15mm, step 1
- Z Phase (°): 0-360°, step 15
- Duração (s): 5-300s, step 5

## Visualização 3D

A visualização 3D atualiza em tempo real via eventos `motion_tick`:

- Frequência de atualização: ~30 FPS (throttled de 60 Hz para reduzir carga)
- Ambos os views (Preview e Live) mostram o movimento simultaneamente
- Cinemática inversa calculada no backend para cada frame

## Arquitetura

### Backend (app.py)

- **Modelo**: `MotionRequest` com campos específicos
- **Generator**: `_generate_pose()` caso `"wobble_precession"`
- **Thread**: Execução em background a 60 Hz
- **Validação**: IK + clamp em cada step
- **Broadcast**: WebSocket `motion_tick` events

### Frontend (kinematics.html)

- **Preset Card**: Interface visual com 6 inputs
- **Config**: `MOTION_PRESET_CONFIG['wobble_precession']`
- **WebSocket Handler**: Detecta `type: 'motion_tick'`
- **Visualização**: Atualiza ambos os canvas 3D

## Referências

- **Euler's Disk**: Disco que gira com precessão e dissipação de energia
- **Precessão**: Movimento do eixo de rotação em torno de outro eixo
- **Stewart Platform**: Manipulador paralelo com 6 graus de liberdade

---

**Autor**: Sistema de Motion Routines  
**Versão**: 1.0  
**Data**: Outubro 2025
