# 🔗 Integração: Cinemática → PID Control

## ⚙️ Configuração da Plataforma

### 📏 Geometria Real

- **Altura mínima (z)**: 432mm → pistões em ~500mm (curso ~0mm)
- **Altura máxima (z)**: ~630mm → pistões em ~680mm (curso ~180mm)
- **Comprimento mínimo pistão**: 500mm
- **Curso útil**: 180mm (limitado por segurança)
- **Comprimento máximo**: 680mm (500 + 180)

### 🔢 Conversão de Unidades

**Backend calcula comprimento absoluto:**

```
Cinemática Inversa → L (comprimento em mm)
Exemplo: z=532mm → L = [590, 590, 590, 590, 590, 590]mm
```

**Conversão para Arduino (parte de 0mm):**

```
setpoint_arduino = L - stroke_min
setpoint_arduino = L - 500

Exemplo: L=590mm → spmm=90mm
```

**Arduino recebe curso (0-180mm):**

```
// Arduino
float Lmm[6] = {180, 180, 180, 180, 180, 180};  // curso útil

// Recebe: spmm1=90.0
SP_mm[0] = 90.0;  // 90mm de extensão
```

## Como Funciona a Integração

### 📐 Fluxo de Dados: Kinematics.html → Backend → Arduino

```
┌─────────────────────────────────────────────────────────────────┐
│                    1. Interface Kinematics                      │
│  Usuário define: x, y, z, roll, pitch, yaw                    │
│  Exemplo: x=10, y=20, z=432, roll=5°, pitch=3°, yaw=0°        │
└──────────────────────────┬──────────────────────────────────────┘
                           │ POST /apply_pose
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    2. Backend (FastAPI)                         │
│  • Recebe a pose desejada                                      │
│  • Calcula cinemática inversa                                  │
│  • L = comprimentos absolutos dos atuadores [200-450mm]        │
│  • Converte para curso: stroke_mm = L - 200mm [0-250mm]       │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Serial Commands
                           │ spmm1=150.234
                           │ spmm2=180.567
                           │ spmm3=125.890
                           │ spmm4=200.123
                           │ spmm5=175.456
                           │ spmm6=190.789
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    3. Arduino (ESP32)                           │
│  • Recebe setpoints individuais para cada pistão               │
│  • Controlador PID ajusta PWM para alcançar posição           │
│  • Feedback de posição via sensores analógicos                │
│  • Envia telemetria: Y1-Y6 (posição) e PWM1-PWM6              │
└──────────────────────────┬──────────────────────────────────────┘
                           │ WebSocket /ws/telemetry
                           │ ms;SP;Y1;Y2;Y3;Y4;Y5;Y6;PWM1;...;PWM6
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              4. Interfaces (PID-Control / Kinematics)           │
│  • Recebem telemetria em tempo real                           │
│  • Atualizam visualização 3D (kinematics)                     │
│  • Mostram posição e PWM de cada pistão (pid-control)         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔢 Conversões de Unidades

### Comprimento Absoluto → Curso em mm

**Backend:**

```python
# Configuração
stroke_min = 200mm  # Comprimento mínimo do atuador
stroke_max = 450mm  # Comprimento máximo do atuador
curso = 250mm       # stroke_max - stroke_min

# Cinemática inversa retorna L (comprimento absoluto)
L = [345.2, 378.9, 312.5, 425.1, 368.7, 390.4]  # exemplo em mm

# Conversão para curso (0-250mm)
stroke_mm = L - stroke_min
# Resultado: [145.2, 178.9, 112.5, 225.1, 168.7, 190.4]
```

**Arduino:**

```cpp
// Configuração
float Lmm[6] = {250, 250, 250, 250, 250, 250};  // curso útil em mm

// Recebe setpoint via serial: "spmm1=145.2"
SP_mm[0] = 145.2;  // setpoint em mm de curso

// PID controla para atingir essa posição
// Feedback via sensor analógico (0-3.3V) mapeado para 0-250mm
```

---

## 📊 Exemplo Prático

### Caso 1: Plataforma na Altura Mínima

```
Pose: x=0, y=0, z=432, roll=0, pitch=0, yaw=0

Backend calcula:
L = [500, 500, 500, 500, 500, 500] mm (todos iguais)

Converte para curso:
stroke = [0, 0, 0, 0, 0, 0] mm

Envia comandos:
spmm1=0.000
spmm2=0.000
spmm3=0.000
spmm4=0.000
spmm5=0.000
spmm6=0.000

Arduino: Todos os pistões retraídos (posição mínima)
```

### Caso 2: Plataforma no Meio do Curso

```
Pose: x=0, y=0, z=532, roll=0, pitch=0, yaw=0

Backend calcula:
L = [590, 590, 590, 590, 590, 590] mm (todos iguais)

Converte para curso:
stroke = [90, 90, 90, 90, 90, 90] mm

Envia comandos:
spmm1=90.000
spmm2=90.000
spmm3=90.000
spmm4=90.000
spmm5=90.000
spmm6=90.000

Arduino: Todos os pistões a 90mm (meio do curso)
```

### Caso 3: Plataforma Inclinada (Roll=10°) na altura mínima

```
Pose: x=0, y=0, z=432, roll=10, pitch=0, yaw=0

Backend calcula:
L = [462, 535, 543, 506, 493, 456] mm (variados)
⚠️ Alguns pistões < 500mm → INVÁLIDO

Nota: Na altura mínima (z=432), inclinações podem ser
fisicamente impossíveis. Use z maior (ex: z=500)
```

### Caso 4: Plataforma na Altura Máxima

```
Pose: x=0, y=0, z=630, roll=0, pitch=0, yaw=0

Backend calcula:
L = [678, 678, 678, 678, 678, 678] mm (próximo do limite)

Converte para curso:
stroke = [178, 178, 178, 178, 178, 178] mm

Envia comandos:
spmm1=178.000
spmm2=178.000
spmm3=178.000
spmm4=178.000
spmm5=178.000
spmm6=178.000

Arduino: Todos os pistões quase totalmente estendidos
```

---

## ✅ Verificação de Integração

### Checklist de Funcionamento

- [x] **Backend configurado**: h0=432, stroke_min=500, stroke_max=680
- [x] **Arduino configurado**: Lmm[6]={180,180,180,180,180,180}
- [x] **Conversão correta**: stroke_mm = L - 500
- [x] **Comandos seriais**: spmm1=, spmm2=, ..., spmm6=
- [x] **Telemetria funcionando**: WebSocket envia Y1-Y6 e PWM1-PWM6
- [x] **Limites validados**: 0 ≤ stroke ≤ 180mm

### Teste Manual

1. **Conecte à serial** em qualquer interface
2. **Envie comando manual**: `spmm=90` (meio do curso)
3. **Verifique**: Todos os pistões vão para 90mm
4. **Na interface Kinematics**: Digite z=532 (meio) e clique "Apply Pose"
5. **Observe**: Pistões movem para ~90mm
6. **Telemetria**: Valores Y1-Y6 devem convergir para ~90mm

---

## 🔧 Debugging

### Se os pistões não se movem:

1. **Verifique conexão serial**:

   ```
   Console deve mostrar: ✅ Conectado
   ```

2. **Teste comando simples**:

   ```
   Envie: spmm1=50
   Arduino deve responder no console
   ```

3. **Verifique ganhos PID**:

   ```
   Kp deve ser > 0 (ex: Kp=2.0)
   Se Kp=0, não haverá movimento
   ```

4. **Verifique calibração**:
   ```
   Sensores devem estar calibrados (V0 e V100)
   Use comandos: zero, mark100
   ```

### Se as posições estão erradas:

1. **Verifique limites**:

   ```
   Backend: stroke_min=200, stroke_max=450
   Arduino: Lmm=250
   Devem ser compatíveis!
   ```

2. **Verifique telemetria**:

   ```
   Y1-Y6 devem estar entre 0-250mm
   Se fora desse range, revisar calibração
   ```

3. **Verifique cinemática**:
   ```
   Pontos B e P0 no backend devem corresponder
   à geometria física da plataforma
   ```

---

## 🎯 Conclusão

A integração está **funcionando corretamente** quando:

1. ✅ Interface Kinematics calcula comprimentos absolutos
2. ✅ Backend converte para curso (0-250mm)
3. ✅ Arduino recebe setpoints e controla pistões
4. ✅ Telemetria mostra convergência (Y → SP)
5. ✅ Visualização 3D reflete movimento real

**Status Atual**: ✅ **PRONTO PARA USO**

---

## 📝 Comandos Úteis

### Teste de Integração Rápido

```bash
# 1. Inicie o backend
cd interface/backend
python app.py

# 2. Abra kinematics.html no navegador

# 3. Conecte à serial

# 4. Teste pose neutra
x=0, y=0, z=432, roll=0, pitch=0, yaw=0
→ Todos pistões devem ir para ~232mm

# 5. Teste inclinação
x=0, y=0, z=432, roll=10, pitch=0, yaw=0
→ Pistões devem estender diferente
```

---

**Atualizado em**: 26 de Outubro de 2025
