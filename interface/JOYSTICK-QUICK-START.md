# 🎮 Guia Rápido - Sistema de Controle por Joystick

## ✅ Checklist de Implementação

### Backend (app.py) ✅

- [x] Modelo `JoystickPoseRequest` adicionado
- [x] Endpoint `POST /joystick/pose` implementado
- [x] Validação de limites (±10mm, ±10°)
- [x] Integração com cinemática inversa
- [x] Comando serial `spmm6x=...` implementado
- [x] Endpoint documentado na rota root

### Frontend (Scripts) ✅

- [x] `joystick-control.js` criado
- [x] `controller.js` criado
- [x] `controller.html` criado
- [x] Integração com Three.js (preview 3D)
- [x] Gamepad API integrada
- [x] Event listeners configurados

### Documentação ✅

- [x] README completo criado
- [x] Script de testes criado
- [x] Comentários em português
- [x] Logs detalhados

## 🚀 Como Testar Agora

### 1. Inicie o Backend

```bash
cd c:\Users\Miyata\Documents\ESP32S3\interface\backend
python app.py
```

Você deve ver:

```
✅ FastAPI startup: event loop configurado
INFO:     Uvicorn running on http://0.0.0.0:8001
```

### 2. Execute os Testes

Em outro terminal:

```bash
cd c:\Users\Miyata\Documents\ESP32S3\interface\backend
python test_joystick_endpoint.py
```

Isso testará todos os cenários sem hardware conectado.

### 3. Abra o Frontend

No navegador (Chrome recomendado):

```
file:///c:/Users/Miyata/Documents/ESP32S3/interface/frontend/controller.html
```

Ou configure um servidor HTTP simples:

```bash
cd c:\Users\Miyata\Documents\ESP32S3\interface\frontend
python -m http.server 8080
```

Depois acesse: `http://localhost:8080/controller.html`

### 4. Conecte um Gamepad

- Xbox Controller (USB ou Bluetooth)
- PlayStation Controller (DS4/DS5)
- Qualquer gamepad compatível

O navegador deve detectar automaticamente.

### 5. Teste o Preview

1. ✅ Marque "Ativar Controle por Joystick"
2. Mova os sticks
3. Veja o preview 3D atualizar em tempo real
4. Valores de X, Y, Z, Roll, Pitch, Yaw atualizarão

### 6. Teste com Hardware (Opcional)

⚠️ **APENAS SE A PLATAFORMA ESTIVER SEGURA!**

1. Conecte a porta serial no frontend
2. ✅ Marque "Aplicar no Hardware"
3. Movimentos agora controlam a plataforma real

## 🔍 Verificações Importantes

### Backend Logs

Ao enviar comandos, você deve ver no terminal:

```
🎮 Joystick -> Pose: x=5.00, y=3.00, z=432.00, roll=1.00°, pitch=2.00°, yaw=0.00°

🔍 VALIDAÇÃO - Pose: x=5.0, y=3.0, z=432, roll=1.0, pitch=2.0, yaw=0.0
   Limites: 500mm <= L <= 680mm
   Pistão 1: L=590.23mm ✅
   Pistão 2: L=588.45mm ✅
   ...
   RESULTADO GLOBAL: ✅ VÁLIDO

📤 Enviando comando joystick: spmm6x=90.23,88.45,...
✅ Comando joystick enviado com sucesso
```

### Console do Navegador

Pressione F12 e veja:

```
🎮 JoystickController inicializado
🎮 Gamepad conectado: Xbox 360 Controller (índice 0)
🎮 Controle por joystick ATIVADO
✅ Preview 3D inicializado
```

### Frontend - Indicadores Visuais

- Status do gamepad: Verde "Conectado"
- Valores de X, Y, Z, Roll, Pitch, Yaw atualizando
- Sliders movendo em sincronia
- Preview 3D rotacionando/transladando

## 🐛 Solução de Problemas Comuns

### "Nenhum gamepad conectado"

1. Conecte o gamepad USB
2. Pressione qualquer botão
3. Recarregue a página
4. Tente outro navegador (Chrome funciona melhor)

### Preview 3D não atualiza

1. Verifique se o backend está rodando (`http://localhost:8001`)
2. Abra o console do navegador (F12) e procure erros
3. Verifique se há mensagens de CORS (possível ao usar `file://`)
4. Use um servidor HTTP local (`python -m http.server`)

### "Erro ao enviar pose"

1. Certifique-se de que o backend está acessível
2. Verifique a URL em `controller.js` (deve ser `http://localhost:8001`)
3. Verifique se há erros no terminal do backend

### "Pose inválida"

Isso é normal se você mover muito o joystick. Os limites são:

- X, Y: ±10mm
- Roll, Pitch: ±10°

Se a pose calculada ultrapassar os limites dos atuadores (500-680mm), será rejeitada.

### Serial não conecta

1. Verifique se o ESP32 está conectado
2. Feche outras aplicações que usam a porta (Arduino IDE, PuTTY, etc.)
3. Atualize a lista de portas
4. Reinicie o backend

## 📊 Métricas de Performance

### Taxas de Atualização

- **Preview 3D**: ~60fps (requestAnimationFrame)
- **Backend**: 20Hz (50ms por update)
- **Serial TX**: Conforme comandos válidos

### Latência Esperada

- Frontend → Backend: ~5-10ms (localhost)
- Backend → ESP32: ~1-2ms (serial)
- **Total**: ~10-20ms (muito responsivo!)

## 🎯 Próximos Passos (Extensões)

### 1. Controle de Yaw com Triggers

Em `joystick-control.js`, método `_axesToPose`:

```javascript
const lt = gamepad.buttons[6]?.value || 0;
const rt = gamepad.buttons[7]?.value || 0;
const yaw = (rt - lt) * this.config.MAX_ANGLE_DEG;
```

### 2. Controle de Z com D-pad

```javascript
const dpadUp = gamepad.buttons[12]?.pressed;
const dpadDown = gamepad.buttons[13]?.pressed;
let z = this.config.Z_BASE;
if (dpadUp) z += 5;
if (dpadDown) z -= 5;
```

### 3. Presets com Botões

```javascript
const btnA = gamepad.buttons[0]?.pressed;
if (btnA) {
  // Ir para pose predefinida
  this.gotoPreset('home');
}
```

### 4. Modo Suave (Interpolação)

Adicionar interpolação entre poses para movimentos mais suaves:

```javascript
const targetPose = this._axesToPose(axes);
this.currentPose = lerp(this.currentPose, targetPose, 0.1);
```

### 5. Gravação de Trajetórias

Gravar sequência de poses e reproduzir depois:

```javascript
recorder.record(); // Começar gravação
recorder.play(); // Reproduzir
```

## 📝 Notas para o TCC

### Pontos Fortes

1. **Integração Completa**: Backend FastAPI + Frontend Three.js + Hardware ESP32
2. **Tempo Real**: Controle responsivo com baixa latência
3. **Segurança**: Múltiplas camadas de validação
4. **UX**: Interface intuitiva com feedback visual claro
5. **Código Limpo**: Bem documentado, fácil de entender e estender

### Possíveis Perguntas da Banca

**Q: Por que usar Gamepad API em vez de teclado?**

- Controle analógico suave (não binário)
- Melhor para controle contínuo em 6 DOF
- Ergonomia - operador pode controlar com uma mão

**Q: Como garantir segurança?**

- Limites físicos configuráveis (±10mm, ±10°)
- Validação em frontend, backend E ESP32
- Modo preview antes de aplicar
- Zona morta para evitar comandos não intencionais

**Q: E se o gamepad desconectar durante operação?**

- Evento `gamepaddisconnected` detecta imediatamente
- Controle é desabilitado automaticamente
- Usuário é notificado via toast

**Q: Por que 20Hz de update rate?**

- Balanceia responsividade e carga da rede/serial
- ESP32 consegue processar comandos a essa taxa
- Evita sobrecarga do buffer serial

## ✨ Demonstração Sugerida

1. Mostrar conexão e detecção automática do gamepad
2. Demonstrar preview 3D em tempo real
3. Explicar limites de segurança
4. Mostrar logs detalhados do backend
5. Demonstrar aplicação no hardware (se seguro)
6. Mostrar tratamento de erros (desconectar gamepad)

## 📞 Suporte

Se encontrar problemas:

1. Verifique logs do backend (terminal)
2. Verifique console do navegador (F12)
3. Execute os testes: `python test_joystick_endpoint.py`
4. Consulte o README completo: `JOYSTICK-CONTROL-README.md`

---

**Criado por:** Miyata  
**Data:** Novembro 2025  
**Versão:** 1.0.0
