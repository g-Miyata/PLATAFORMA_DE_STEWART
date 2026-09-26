# Interface web (React)

Frontend da Plataforma de Stewart: React 19 + TypeScript + Vite, Tailwind CSS v4, Radix UI, React Three Fiber (three.js) e Chart.js. O build (`dist/`) é servido pelo próprio FastAPI em `http://localhost:8001/`; não há dependência de CDN, então a interface funciona offline.

## Rodando

```bat
npm install
npm run dev        :: http://localhost:5173 (a API é repassada para o backend em :8001)
npm run build      :: gera dist/, servido pelo FastAPI. Rode antes de commitar.
npm run lint       :: ESLint + regras de acessibilidade (jsx-a11y) + regras do React Compiler
npm run typecheck
npm test           :: Vitest (cinemática, rotinas, joystick, CSV...)
npm run test:e2e   :: Playwright + axe contra o build, com o simulador
```

O `test:e2e` usa o Edge instalado no Windows. Com o `start.bat` aberto, rode num backend separado (`PW_PORT=8011`) para não desconectar a sua sessão. Defina `PYTHON` com o Python do venv do backend se ele não for o `python` do PATH. No CI (Linux), use `PW_CHANNEL=chromium` depois de `npx playwright install chromium`.

## Estrutura

```
src/
  app/          App (rotas), AppShell (cabeçalho, menu, selo de modo), providers, nav
  components/   ui/ (Button, Card, campos, status), charts/LiveChart, PageLayout (PageHeader, WithViewer)
  features/
    platform3d/ modelo 3D: PlatformViewer, Scene, Actuators, TopPlate, BaseFrame, GhostPlatform,
                BlueMount (STL real), ModelSlot (modelos .glb do Blender), sceneState (SceneStore)
    control/    PoseEditor, validação no backend, trava de controle ao vivo
    serial/     conexão (hardware real pede confirmação; padrão = simulador)
    safety/     parada de emergência (botão e tecla Esc)
    bench3d/    Bancada 3D: store de edição (FK ao mexer num pistão, IK ao mexer na pose),
                gizmos de arraste (seta de eixo, anéis de rotação) e cena premium
    joystick/   Gamepad API + mapeamento idêntico ao /joystick/pose
    routines/   presets e estimativa de velocidade dos atuadores
    actuators/  console serial
  lib/          api (REST tipado), ws (WebSocket único com backoff), kinematics (inversa),
                forwardKinematics (direta, Levenberg-Marquardt), types, csv
  stores/       zustand: connection, telemetry, ui (tema, contador de parada de emergência)
  pages/        uma página por rota
```

### Fluxo de dados

- **Um WebSocket só** (`lib/ws.ts`), aberto na raiz do app. Como é uma SPA, ele sobrevive à troca de páginas. As mensagens vão para `stores/telemetry.ts` (`telemetry`, `motion_tick`, `raw`).
- **REST** em `lib/api.ts`, sempre na mesma origem. O estado da serial é consultado a cada 2 s (`features/serial/status.ts`) e alimenta o selo **SIMULAÇÃO / HARDWARE REAL / DESCONECTADO / BACKEND OFFLINE**.
- **Dados de alta frequência não passam pelo React**: gráficos (`LiveChart`) e o 3D (`SceneStore`) assinam o store diretamente e se atualizam de forma imperativa. Tabelas e textos usam `useThrottledTelemetry` (5 a 10 Hz).
- **Cinemática no navegador serve só para desenhar** (`lib/kinematics.ts`, mesmas fórmulas de `app.py`, com teste contra valores gerados pelo backend). Validar e aplicar uma pose é sempre papel do backend.

### Modelo 3D

`PlatformViewer` mostra duas plataformas:

- **sólida**: a pose medida (`pose_live` da telemetria; com o simulador, é o modelo virtual). Sem telemetria, mostra a pose prevista.
- **fantasma verde**: a pose comandada/prevista pela página (sliders, joystick, IMU, rotina). Só aparece quando difere da medida.

Cada atuador acende em âmbar perto do batente e em vermelho fora do curso. As mesmas informações estão na tabela abaixo do canvas, que é a alternativa textual do 3D. O eixo Z aponta para cima e as unidades são mm, iguais às do backend.

Tudo é montado a partir da geometria do `GET /config` (`base_points`, `platform_points_local`, curso), com fallback embutido em `features/platform3d/geometry.ts`. Mudou a geometria no backend, o desenho acompanha.

### Bancada 3D

O modelo "premium" (`features/platform3d/premium/`) é usado só nesta tela:

- **Peças:** tubo de alumínio de cantos arredondados, motor com etiqueta e o número do pistão, caixa de redução, juntas cardã cromadas, perfis 40×40 com canais em T e a parte elétrica (fonte, drivers, canaletas, trilho DIN, botão de emergência).
- **Render:** pós-processamento (N8AO, bloom, AgX, SMAA) no modo **Alta**. O modo **Leve** entra sozinho se o FPS cair.
- **Frameloop sob demanda:** a cena só redesenha quando a edição, a telemetria ou a câmera mudam.

**Teclado** (com o modelo em foco):

| Tecla | Ação |
| --- | --- |
| 1 a 6 | seleciona um pistão |
| C | seleciona o tampo e alterna o eixo |
| Z, R, P, Y | escolhe altura, roll, pitch ou yaw |
| setas | ajustam (Shift ×10) |
| Ctrl+Z | desfaz |
| F | tela cheia |

## Tema IFSP e acessibilidade

- **Tokens** em `src/index.css`, para `[data-theme="light"]` e `[data-theme="dark"]`. O verde (#2F9E41) e o vermelho (#CD191E) institucionais são usados em ícones, bordas e superfícies. Para texto, o tema claro usa um verde escurecido (#1B6E2B) e o escuro um verde claro, para passar o contraste AA.
- **Escolha do tema:** o padrão segue o sistema; o botão no cabeçalho alterna e salva em `localStorage`. Um script inline em `index.html` aplica o tema antes da primeira pintura.
- **Meta: WCAG 2.1 AA.** O `npm run test:e2e` roda o axe em todas as páginas, nos dois temas, e falha em violações sérias ou críticas.
- **Regras seguidas nos componentes:**
  - todo controle tem rótulo;
  - sliders com `aria-valuetext` em pt-BR ("5,5 graus") e campo numérico ao lado;
  - estado nunca só por cor (ícone + texto);
  - link "Pular para o conteúdo";
  - o foco vai para o conteúdo ao trocar de página;
  - atalho **Esc** para a parada de emergência;
  - `prefers-reduced-motion` desliga animações e a suavização do 3D.

## Modelos 3D (Blender)

A carcaça dos atuadores, os cardãs e a parte elétrica da bandeja (drivers, fonte, disjuntor, réguas de bornes, DB37 e botoeira de emergência) vêm de `.glb` gerados por scripts do Blender em [`3D-drawings-archives/blender/`](../../3D-drawings-archives/blender/README.md). O resto é gerado no código (procedural), com proporções tiradas das fotos da bancada. O bloco azul da base usa a peça real do repositório (`3D-drawings-archives/kardan-joint/kardan-joint.stl`, copiada para `public/models/`).

Para trocar uma peça por um modelo mais detalhado feito no Blender:

1. **Unidades:** em *Scene Properties > Units*, use *Unit Scale* 0,001 e *Length* em milímetros, para que **1 unidade = 1 mm**.
2. **Eixos e origem** (o exportador glTF converte o Z do Blender no +Y do three.js, que é o eixo do atuador no código):

   | Nome do arquivo | Origem (0,0,0) | Eixo do Blender +Z | +X |
   | --- | --- | --- | --- |
   | `actuator-housing.glb` | centro da junta da base | ao longo do atuador; a carcaça vai de ~32 a ~330 mm | lado do motor (para fora da plataforma) |
   | `actuator-rod.glb` | centro da haste | ao longo da haste (400 mm de comprimento) | livre |
   | `kardan-top.glb` | centro da junta superior | ao longo da perna | livre |

3. **Materiais:** Principled BSDF (vira PBR no glTF). Alumínio fosco, cromo para a haste, texturas de até 1024 px. Não é preciso pintar a cor de cada pistão: a faixa colorida continua sendo desenhada pelo código.
4. **Exportar:** *File > Export > glTF 2.0*, formato **.glb**, *Selected Objects*, *+Y Up* ligado, *Apply Modifiers*, sem câmeras, luzes ou animações.
5. **Otimizar** (Meshopt; não use Draco, que precisaria de CDN):

   ```bat
   npx @gltf-transform/cli optimize actuator-housing.glb public/models/actuator-housing.glb --compress meshopt --texture-compress webp
   ```

6. **Registrar** o nome em `public/models/manifest.json` (ex.: `"models": ["actuator-housing"]`) e rodar `npm run build`.

Se o arquivo faltar ou não carregar, a peça procedural volta sozinha (`ModelSlot`). Para conferir a escala, a carcaça precisa ter ~330 unidades no eixo do atuador. Se vier 0,33, a unidade estava em metros.

**Referências visuais:** fotos da bancada e Figuras 17, 20, 21 e 27 da monografia (`docs/TCC_Guilherme_rev4_final.docx`).
