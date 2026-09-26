# Scripts do Blender (modelos 3D da interface web)

Os `.glb` de `interface/web/public/models/` são gerados por estes scripts. As medidas foram tiradas das fotos da bancada, das fichas dos componentes e do desenho do D-sub (Winford CNS37F). Os scripts rodam dentro do Blender (testado no 5.2) pelo add-on [BlenderMCP](https://github.com/ahujasid/blender-mcp), que escuta em `127.0.0.1:9876`.

| Script | Coleção no Blender | Arquivo exportado |
| --- | --- | --- |
| `import_stl.py` | `Stewart_Referencia` | (só referência: importa `kardan-joint.stl` e põe a cena em mm) |
| `actuator.py` | `Stewart_Atuador` | `actuator-housing.glb`: carcaça do XINHUANGDUO BHTGA-DW-250 (tubo em "D", base com juntas vermelhas, motor) |
| `kardan.py` | `Stewart_Kardan` | `kardan-top.glb`: junta universal cromada |
| `electronics.py` | `Stewart_Driver`, `Stewart_Fonte`, `Stewart_Disjuntor`, `Stewart_Bornes`, `Stewart_BornesAzul` | `driver-board.glb` (JZ-3615-A), `power-supply.glb`, `breaker.glb`, `terminal-strip.glb`, `terminal-strip-blue.glb` |
| `db37.py` | `Stewart_DB37` | `db37-female.glb` |
| `estop.py` | `Stewart_Emergencia` | `estop.glb`: botoeira de emergência |
| `export.py` | todas as acima | grava os `.glb` em `interface/web/public/models/` |

Tudo fica dentro da coleção `Stewart`. Rodar um script de novo apaga e recria só a coleção dele; o resto da cena não é tocado.

## Como regenerar

Com o Blender aberto e o add-on BlenderMCP conectado, rode na raiz do repositório:

```bat
python 3D-drawings-archives\blender\bl.py exec 3D-drawings-archives\blender\import_stl.py
python 3D-drawings-archives\blender\bl.py exec 3D-drawings-archives\blender\actuator.py
python 3D-drawings-archives\blender\bl.py exec 3D-drawings-archives\blender\kardan.py
python 3D-drawings-archives\blender\bl.py exec 3D-drawings-archives\blender\electronics.py
python 3D-drawings-archives\blender\bl.py exec 3D-drawings-archives\blender\db37.py
python 3D-drawings-archives\blender\bl.py exec 3D-drawings-archives\blender\estop.py
python 3D-drawings-archives\blender\bl.py exec 3D-drawings-archives\blender\export.py
```

`import_stl.py` roda primeiro: ele cria a coleção `Stewart` e ajusta as unidades (1 unidade = 1 mm). O `bl.py` define `REPO` (a raiz do repositório) antes de executar cada script. Para rodar pelo editor de texto do próprio Blender, defina antes a variável de ambiente `STEWART_REPO`.

Depois de exportar, registre os nomes novos em `interface/web/public/models/manifest.json` e rode `npm run build` em `interface/web`.

## Conferir sem sair do terminal

- `python bl.py shot saida.png 1200`: captura o viewport.
- `render.py`: render Workbench de uma coleção, salvo em `%TEMP%\stewart-renders`. Troque `SHOW`, `TARGET`, `DIST`, `VIEWS` e `PREFIX` no topo do arquivo antes de rodar.
- `view.py`: posiciona a câmera do viewport (`CENTER`, `ROT_DEG`, `DIST`, `SHOW`).

## Convenções

- 1 unidade = 1 mm. O exportador converte o +Z do Blender no +Y do three.js.
- Atuador: origem no centro da junta da base, eixo em +Z e motor do lado +X.
- Peças da bandeja (`driver-board`, `power-supply`, `breaker`, `terminal-strip*`, `db37-female`, `estop`): feitas com Z para cima e carregadas no app com `ModelSlot zUp`.
- O material `Alu_Tubo` do atuador é trocado no app pelo material com o brilho de estado do curso (ver `PremiumParts.tsx`). Não renomeie esse material.
