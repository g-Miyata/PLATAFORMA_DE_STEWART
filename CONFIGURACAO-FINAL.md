# ✅ Configuração Final - Geometria Real da Plataforma

## 📏 Parâmetros Confirmados

### Backend (app.py)

```python
h0 = 432           # altura mínima da plataforma (mm)
stroke_min = 500   # comprimento mínimo do pistão (mm)
stroke_max = 680   # comprimento máximo do pistão (mm)
curso = 180        # stroke_max - stroke_min
```

### Arduino (pid-control.ino)

```cpp
float Lmm[6] = {180, 180, 180, 180, 180, 180};  // curso útil (mm)
```

## 🔄 Fluxo de Conversão

```
1. Interface Kinematics
   Usuário define: z = 532mm (exemplo: meio do curso)

2. Backend - Cinemática Inversa
   Calcula: L = [590, 590, 590, 590, 590, 590]mm
   (comprimento absoluto dos pistões)

3. Backend - Conversão para Arduino
   stroke_mm = L - stroke_min
   stroke_mm = 590 - 500 = 90mm

4. Backend - Envia comandos seriais
   spmm1=90.000
   spmm2=90.000
   ...
   spmm6=90.000

5. Arduino - Recebe setpoint
   SP_mm[0] = 90.0  // 90mm de extensão do zero

6. Arduino - Controle PID
   Ajusta PWM para atingir 90mm de curso

7. Arduino - Telemetria
   Envia: Y1=90.0mm (posição atual)
```

## 📊 Tabela de Referência

| z (altura) | L (comprimento) | stroke (curso) | Descrição          |
| ---------- | --------------- | -------------- | ------------------ |
| 432mm      | ~500mm          | ~0mm           | Mínima (retraído)  |
| 532mm      | ~590mm          | ~90mm          | Meio do curso      |
| 630mm      | ~680mm          | ~180mm         | Máxima (estendido) |

## ⚠️ Observações Importantes

1. **z=432mm é a altura MÍNIMA**, não a neutra

   - Nesta altura, os pistões estão retraídos (~500mm)
   - Inclinações podem ser inválidas nesta altura

2. **Curso útil limitado a 180mm** (de 250mm possíveis)

   - Margem de segurança
   - Evita fim de curso

3. **Arduino parte do zero**

   - Não considera o comprimento mínimo (500mm)
   - Setpoint = comprimento_absoluto - 500
   - Range: 0 a 180mm

4. **Validação de limites**
   - Backend valida: 500 ≤ L ≤ 680
   - Arduino limita: 0 ≤ SP ≤ 180
   - Poses inválidas são rejeitadas

## 🧪 Testes de Validação

### Teste 1: Posição Mínima ✅

```
z=432mm → L=~500mm → stroke=~0mm
Comando: spmm=0
Resultado: Pistões retraídos
```

### Teste 2: Meio do Curso ✅

```
z=532mm → L=~590mm → stroke=~90mm
Comando: spmm=90
Resultado: Pistões no meio
```

### Teste 3: Posição Máxima ✅

```
z=630mm → L=~678mm → stroke=~178mm
Comando: spmm=178
Resultado: Pistões quase totalmente estendidos
```

### Teste 4: Pose Inválida ✅

```
z=700mm → L=~744mm > 680mm
Resultado: REJEITADO (fora dos limites)
```

## 🚀 Status Final

✅ **Backend configurado**: h0=432, stroke_min=500, stroke_max=680
✅ **Arduino configurado**: Lmm=180mm
✅ **Conversão implementada**: stroke = L - 500
✅ **Validação funcionando**: Limites respeitados
✅ **Integração testada**: Cinemática → PID OK

## 📝 Comandos de Teste

```bash
# 1. Iniciar backend
cd interface/backend
python app.py

# 2. Conectar à serial na interface

# 3. Testar posições
spmm=0      # Mínimo (retraído)
spmm=90     # Meio
spmm=180    # Máximo (estendido)

# 4. Testar via Kinematics
z=432       # Mínimo
z=532       # Meio
z=630       # Máximo
```

---

**Sistema pronto para uso! 🎉**

Configuração validada em: 26 de Outubro de 2025
