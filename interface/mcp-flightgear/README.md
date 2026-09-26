# FlightGear MCP

Servidor MCP (Model Context Protocol) que deixa o Claude Code, ou qualquer cliente MCP, ler e controlar o FlightGear. Ele conversa com a API HTTP do simulador (`--httpd`), que expõe a árvore de propriedades, os fgcommands e a captura de tela.

Existe uma página "FG-MCP Server" na wiki do FlightGear, mas ela não publica o código. Este servidor segue a mesma ideia e foi escrito para este repositório.

## Requisitos

- FlightGear 2024.1 (`winget install FlightGear.FlightGear`).
- Dados base do FlightGear (FGData), que o instalador para Windows não traz. O launcher baixa os arquivos um a um e demora; é mais rápido baixar o pacote da mesma versão do binário e extrair em `%USERPROFILE%\FlightGear\fgdata_2024_1`:

  ```bash
  curl -L -o FlightGear-2024.1.4-data.txz https://mirrors.ibiblio.org/flightgear/ftp/release-2024.1/FlightGear-2024.1.4-data.txz
  ```

  O `start-flightgear.ps1` usa essa pasta (ou a variável `FG_ROOT`) automaticamente.
- [uv](https://docs.astral.sh/uv/). Ele cuida do Python 3.10+ e das dependências (`mcp` 2.x e `httpx`).

## Instalação

```powershell
cd interface/mcp-flightgear
uv sync
```

O `.mcp.json` na raiz do repositório registra o servidor no Claude Code com o nome `flightgear`. Na primeira vez que o projeto for aberto, o Claude Code pede para aprovar o servidor. Para usar fora do repositório:

```powershell
claude mcp add flightgear -- uv run --directory C:\caminho\para\interface\mcp-flightgear flightgear-mcp
```

## Uso

1. Abra o simulador com a API HTTP ligada:

   ```powershell
   .\interface\mcp-flightgear\start-flightgear.ps1 -Aircraft c172p -Airport SBGR
   ```

   O script chama o `fgfs` com `--httpd=8080` (API usada pelo MCP) e `--telnet=5050` (usada pelo `interface/simulation/fg-bridge.py`). Pelo launcher gráfico, coloque `--httpd=8080` em *Settings → Additional Settings*.
2. Confira se a API responde em <http://127.0.0.1:8080/json/orientation?d=2>.
   Para os voos do projeto (ERJ145 com a pintura do IFSP e saída UDP da plataforma), prefira `interface\simulation\start-flightgear-cueing.ps1`, que também liga o `--httpd`. Veja [FLIGHTGEAR-SETUP.md](../../FLIGHTGEAR-SETUP.md).
3. No Claude Code, peça por exemplo "qual o roll e pitch do avião agora?" ou "põe o piloto automático em 3000 ft, proa 270".

Variáveis de ambiente: `FG_HTTP_HOST` (padrão `127.0.0.1`), `FG_HTTP_PORT` (padrão `8080`) e `FG_HTTP_TIMEOUT` (padrão `5` s).

## Ferramentas

| Ferramenta | O que faz |
| --- | --- |
| `get_flight_data` | Simulação, posição, atitude, velocidades, motor e comandos |
| `get_motion_cues` | Atitude, velocidades angulares e acelerações no piloto (o que a plataforma reproduz) |
| `get_property` / `set_property` | Lê ou grava qualquer propriedade; `depth=2` lista os filhos |
| `set_controls` | Manete, aileron, profundor, leme, flaps, mistura, freio de estacionamento, trem |
| `get_autopilot` / `set_autopilot` | Piloto automático genérico (`/autopilot/locks` e `/autopilot/settings`) |
| `get_radios` / `set_radio` | COM1/2, NAV1/2, ADF e transponder |
| `get_views` / `set_view` | Câmera, zoom e direção do olhar |
| `screenshot` | Captura a tela do simulador |
| `set_pause`, `set_time_of_day`, `reset_flight` | Controle da simulação |
| `run_fgcommand` | Executa qualquer fgcommand |
| `run_nasal` | Executa código Nasal; o resultado volta por uma propriedade (`result_property`) |

## Limitações

- O piloto automático e alguns rádios mudam de caminho entre aeronaves. O c172p, por exemplo, usa o KAP140 em vez de `/autopilot`. Use `get_property` com `depth=2` para achar os caminhos certos.
- A API HTTP não tem autenticação. Deixe o `--httpd` só em `127.0.0.1` ou numa rede confiável.
