# 🧪 Guia de Teste - Wobble Precession

## Teste Rápido (5 minutos)

### 1. Inicie o servidor backend

```powershell
cd C:\Users\Miyata\Documents\ESP32S3\interface\backend
python app.py
```

Aguarde ver:

```
INFO:     Uvicorn running on http://0.0.0.0:8001 (Press CTRL+C to quit)
```

### 2. Execute os testes automatizados

Em **outro terminal**:

```powershell
cd C:\Users\Miyata\Documents\ESP32S3\interface\backend
python test_wobble.py
```

Pressione ENTER quando solicitado e aguarde os testes executarem.

**Resultado esperado:**

```
🎉 TODOS OS TESTES PASSARAM!
```

### 3. Teste no Frontend

1. Abra `C:\Users\Miyata\Documents\ESP32S3\interface\frontend\kinematics.html` no navegador

2. Role até a seção **"🎬 Rotinas de Movimento"**

3. Encontre o card **"🟡 Wobble Precession"** (último card, tema amarelo/amber)

4. Ajuste os parâmetros (ou use os defaults):

   - Tilt: 3.0°
   - Prec Hz: 0.4
   - Yaw Hz: 0.1
   - Z Amp: 6 mm
   - Z Phase: 90°
   - Duração: 40s (reduza para 10s para teste rápido)

5. Clique **"▶️ Iniciar"**

6. **Observe:**

   - ✅ Card fica com borda verde
   - ✅ Status muda para "🟢 Rodando"
   - ✅ Timer incrementa (00:01, 00:02, ...)
   - ✅ **Modelos 3D se movem** (Preview e Live)
   - ✅ Console do navegador (F12) mostra logs `🎬 Motion tick`

7. Clique **"⏹️ Parar"** ou aguarde terminar

8. **Observe:**
   - ✅ Status volta para "Parado"
   - ✅ Card volta ao normal (sem borda verde)
   - ✅ Timer reseta para 00:00
   - ✅ Modelos 3D retornam suavemente ao home

## Teste com Hardware (ESP32)

⚠️ **Requer plataforma Stewart física conectada**

1. Backend rodando (`python app.py`)

2. Abra `kinematics.html`

3. **Conecte ao ESP32:**

   - Selecione a porta COM
   - Clique "Abrir Serial"
   - Aguarde status "🟢 Conectado"

4. **Inicie wobble_precession:**

   - Ajuste parâmetros (comece com valores pequenos para segurança):
     - Tilt: 2.0° (reduzido)
     - Prec Hz: 0.3
     - Yaw Hz: 0.08
     - Z Amp: 4 mm (reduzido)
     - Duração: 15s
   - Clique "▶️ Iniciar"

5. **Observe a plataforma física:**

   - ✅ Inclinação precessa (vetor de tilt gira)
   - ✅ Rotação lenta em yaw
   - ✅ Oscilação vertical suave
   - ✅ Movimento coordenado dos 6 pistões

6. **Segurança:**
   - Mantenha mão no botão "⏹️ Parar"
   - Se movimento estranho, clique PARAR imediatamente
   - Plataforma deve retornar suavemente ao home

## Testes Avançados

### Teste 1: Wobble Lento (Hipnótico)

```json
{
  "routine": "wobble_precession",
  "duration_s": 60,
  "prec_hz": 0.25,
  "yaw_hz": 0.06,
  "tilt_deg": 2.5,
  "z_amp_mm": 5,
  "z_phase_deg": 90
}
```

**Efeito:** Movimento contemplativo, muito suave.

### Teste 2: Wobble Energético

```json
{
  "routine": "wobble_precession",
  "duration_s": 20,
  "prec_hz": 0.7,
  "yaw_hz": 0.18,
  "tilt_deg": 3.5,
  "z_amp_mm": 8,
  "z_phase_deg": 0
}
```

**Efeito:** Movimento dinâmico, Z sincronizado com inclinação.

### Teste 3: Wobble com Bias

```json
{
  "routine": "wobble_precession",
  "duration_s": 30,
  "prec_hz": 0.4,
  "yaw_hz": 0.1,
  "tilt_deg": 2.0,
  "tilt_bias_deg": 1.5,
  "z_amp_mm": 6,
  "z_phase_deg": 180
}
```

**Efeito:** Inclinação nunca volta a zero, Z em antifase.

### Teste 4: Z em Fase Diferente

Teste 3 fases diferentes e compare visualmente:

1. **Fase 0°** (sincronizado): Z máximo quando inclinação é máxima
2. **Fase 90°** (padrão): Z máximo quando inclinação passa por zero
3. **Fase 180°** (antifase): Z mínimo quando inclinação é máxima

## Troubleshooting

### ❌ Erro: "Pose inválida em t=0.00s"

**Causa:** Parâmetros violam limites cinemáticos desde o início.

**Solução:**

- Reduza `tilt_deg` para 2-3°
- Reduza `z_amp_mm` para 4-6mm
- Verifique que `tilt_bias_deg` + `tilt_deg` < 10°

### ❌ Rotina para após alguns segundos

**Causa:** Pose se torna inválida durante execução.

**Solução:**

- Reduza amplitudes
- Verifique logs do backend para ver qual pose falhou
- Teste com `duration_s` menor primeiro

### ❌ Modelos 3D não se movem

**Causa:** WebSocket não conectado ou eventos não sendo recebidos.

**Solução:**

1. Verifique console do navegador (F12)
2. Procure por erros de WebSocket
3. Confirme que backend está rodando
4. Recarregue a página

### ❌ "Connection refused" ao testar

**Causa:** Backend não está rodando.

**Solução:**

```powershell
cd C:\Users\Miyata\Documents\ESP32S3\interface\backend
python app.py
```

### ❌ Serial não conecta

**Causa:** Porta COM incorreta ou ESP32 desconectado.

**Solução:**

1. Clique "🔄 Atualizar Portas"
2. Verifique que ESP32 está conectado via USB
3. Selecione porta COM correta
4. Tente novamente

## Verificação de Sucesso

### ✅ Backend

- [ ] Servidor inicia sem erros
- [ ] `/motion/start` aceita `routine="wobble_precession"`
- [ ] `/motion/status` retorna `running=true` durante execução
- [ ] Logs mostram "🎬 Rotina 'wobble_precession' iniciada"
- [ ] Sem mensagens "❌ Pose inválida"

### ✅ Frontend

- [ ] Card "🟡 Wobble Precession" aparece
- [ ] Todos os 6 inputs são editáveis
- [ ] Botão "▶️ Iniciar" funciona
- [ ] Card fica verde ao iniciar
- [ ] Status mostra "Rodando"
- [ ] Timer incrementa
- [ ] Botão "⏹️ Parar" fica habilitado

### ✅ Visualização 3D

- [ ] Modelos 3D se movem durante rotina
- [ ] Movimento é suave (não "pula" frames)
- [ ] Preview e Live atualizam simultaneamente
- [ ] Console mostra logs "🎬 Motion tick"
- [ ] Modelos retornam ao home após parar

### ✅ Hardware (se conectado)

- [ ] Pistões se movem coordenadamente
- [ ] Movimento corresponde ao esperado
- [ ] Inclinação precessa visivelmente
- [ ] Yaw roda lentamente
- [ ] Z oscila suavemente
- [ ] Parar funciona corretamente
- [ ] Retorno ao home é suave (~1.5s)

## Métricas de Desempenho

### Backend

- **CPU Usage**: ~5-10% durante execução
- **Memory**: ~50-100 MB
- **WebSocket Rate**: 60 msg/s (motion_tick events)
- **Serial Rate**: ~400 commands/s (6 pistões × 60 Hz)

### Frontend

- **CPU Usage**: ~10-20% (visualização 3D)
- **Memory**: ~100-200 MB
- **Update Rate**: ~30 FPS (throttled de 60 Hz)
- **Latency**: <50ms (backend → frontend)

## Logs Esperados

### Backend (app.py)

```
▶️  Iniciando rotina 'wobble_precession' por 40.0s @ 0.4Hz
🎬 Rotina 'wobble_precession' iniciada
[movimento acontece silenciosamente]
✅ Rotina 'wobble_precession' finalizada (2400 passos)
🏠 Retornando para home...
```

### Frontend Console (F12)

```
🎬 Motion tick: {x: 0, y: 0, z: 503.2, roll: 2.1, pitch: -1.8, yaw: 14.4}
🎬 Motion tick: {x: 0, y: 0, z: 504.1, roll: 1.9, pitch: -2.0, yaw: 14.8}
...
```

## Próximos Experimentos

1. **Varie z_phase_deg** entre 0° e 360° (step 30°) e observe diferenças
2. **Compare prec_hz** lento (0.2) vs rápido (0.8)
3. **Teste tilt_bias_deg** diferentes: 0°, 1°, 2°
4. **Combine com baixo yaw_hz** (0.05) para movimento mais contemplativo
5. **Use z_hz = 2 \* prec_hz** para z oscilar duas vezes por revolução

## Documentação

- **Completa**: `WOBBLE-PRECESSION.md`
- **Resumo**: `WOBBLE-SUMMARY.md`
- **Código**: `app.py` (linhas 102-122, 633-665, 948-975)
- **Frontend**: `kinematics.html` (linhas 773-820, 1661)

---

**Implementado por:** Sistema de Motion Routines  
**Data:** 31 de Outubro de 2025  
**Status:** ✅ PRONTO PARA TESTES
