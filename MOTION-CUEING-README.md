# Simulador de voo e Orientação do avião (FlightGear)

## Visão Geral

Duas telas usam o mesmo motor (`interface/backend/cueing.py`), cada uma com um perfil:

- **Simulador de voo** (`/simulador-voo`, perfil `washout`): motion cueing. A plataforma reproduz as **sensações** do voo, acelerações e rotações, e não a inclinação que se vê.
- **Orientação do avião** (`/orientacao-voo`, perfil `attitude`): a plataforma copia roll e pitch do avião, escalados e limitados a ±12°, em altura fixa.

Nas duas, o botão **Rodar no FlightGear** abre o FlightGear com o Embraer ERJ145 na pintura do IFSP. O avião voa o voo gravado **sincronizado com a plataforma** e a imagem aparece dentro da página. Instalação, uso e erros comuns estão em [FLIGHTGEAR-SETUP.md](FLIGHTGEAR-SETUP.md). A antiga ponte roll/pitch por Telnet (`fg-bridge.py` sem opções, rotas `/flight-simulation/*`) continua só para a interface `/antigo`.

O algoritmo é o **washout clássico** (Reid & Nahon), com um detalhe próprio desta bancada: os pistões são lentos (~10 a 16 mm/s, pelos parâmetros ajustados aos ensaios), então a pose final passa por um **limitador de velocidade das pernas**. A plataforma nunca recebe um comando mais rápido do que consegue seguir, e a tela mostra o que ela realmente entrega.

Dá para usar de dois jeitos:

- **Voos gravados:** clique em Play. O FlightGear é opcional (só para ver o avião). O repositório já traz uma rotina, `interface/simulation/flights/demo-erj145-sbgr-circuito.json` (5 min 58 s), gravada de dia na pista 27R de Guarulhos:
  - apresentação do ERJ145 do IFSP (~30 s), com a câmera girando em volta do avião parado e mostrando a pintura enquanto os motores dão partida;
  - decolagem e subida com recolhimento do trem;
  - circuito de tráfego pela esquerda, sobre a cidade, com puxada e picada, balanço de asas e curva em S na perna do vento;
  - base e final pela rampa de 3°;
  - arredondamento, pouso no eixo, frenagem e parada.
- **Ao vivo:** o FlightGear manda os dados por UDP e a plataforma segue o voo em tempo real. Também dá para gravar voos novos por aqui.

### O que esperar do movimento

O Simulador de voo é fiel às **sensações**: numa curva coordenada de 45°, o piloto não é empurrado para o lado (a inclinação compensa a força centrífuga), então a plataforma quase não inclina. Ela dá o início da rolagem e volta devagar ao centro, como os simuladores profissionais. O que mais aparece é a inclinação sustentada da decolagem e da subida. Na rotina do ERJ, com os parâmetros padrão, a plataforma chega a ~2° de roll e ~8° de pitch, e o comando traz até 23 mm de surge e 24 mm de heave. O pouso aparece como o toque (pico de ~2,8 g no piloto) e a frenagem (−5 m/s², a plataforma recua ~11 mm). Com pistões a ~9 mm/s, essas translações ficam abaixo do que o corpo percebe. Para uma apresentação em que o público compara com o avião na tela, a **Orientação do avião** é a que "bate com o que se vê" (até 12° de roll no mesmo voo).

## Arquitetura e Fluxo de Dados

```
FlightGear --UDP 60 Hz--> fg-bridge.py --cueing --WebSocket--> backend /cueing/ingest
 (protocolo genérico          (converte unidades,                 (washout + limites +
  stewart-cueing)              reconecta)                          serial a 60 Hz)
                                                                       |
                         /ws/telemetry (cueing_tick, 30 Hz)            |  replay de voo gravado v2:
                                        v                              v  UDP 60 Hz (stewart-visual)
                       telas Simulador de voo / Orientação       FlightGear sem física (ERJ145)
                                        ^                              |
                                        +------ /fg/stream (MJPEG) ----+
```

- **FlightGear como tela (`interface/backend/flightgear.py`):** `/fg/check` confere FlightGear, FGData, ERJ145, pintura, protocolos, portas e memória, e devolve a correção de cada item. `/fg/launch` instala a pintura e abre o `fgfs` com `--fdm=null`, a entrada `stewart-visual` e a Chase View. `/fg/status` acompanha a abertura e informa queda (com o log) ou travamento. `/fg/stream` repassa o MJPEG do servidor HTTP do FlightGear (`/screenshot?stream=y`). Durante o replay, o motor manda a posição, a atitude, o trem, os flaps e as superfícies interpolados a 60 Hz: o backend é o relógio, então pausa e velocidade valem para os dois.

- **FlightGear:** `interface/simulation/fgdata/Protocol/stewart-cueing.xml` define uma linha de texto por frame com força específica no piloto (`/accelerations/pilot/*`), velocidades angulares p, q, r, atitude, velocidade, altura e as flags de pausa/replay. A pasta entra no FlightGear pela opção `--data`, sem copiar nada para o FGData.
- **Ponte (`fg-bridge.py --cueing`, código em `cueing_bridge.py`):** recebe o UDP, converte ft/s² para m/s² e repassa cada frame ao backend por WebSocket. Se o backend atrasa, descarta os frames mais velhos.
- **Backend (`interface/backend/cueing.py`):** roda o washout, encolhe poses fora do curso, limita a velocidade das pernas e envia `spmm6x` a 60 Hz quando a plataforma está engatada. Publica `cueing_tick` no WebSocket de telemetria. O `app.py` só cria o motor, inclui as rotas e desliga o cueing na parada de emergência.

### Por que UDP e não Telnet

O Telnet é pergunta e resposta: cada propriedade custa uma ida e volta, e a ponte antiga lê só duas (roll e pitch) a ~30 Hz. O motion cueing precisa de ~15 valores coerentes do **mesmo frame**, com o menor atraso possível. A saída genérica UDP do FlightGear empurra tudo junto a cada frame (até 60 Hz), sem polling, e um pacote perdido simplesmente é substituído pelo próximo. O Telnet continua sendo usado pela ponte antiga.

## Voos gravados

`interface/simulation/flights/*.json`, formato `stewart-cueing-flight`:

- **v1:** colunas `t, fx, fy, fz, p, q, r, roll, pitch, heading, ias, agl, alt, wow`. Movem a plataforma.
- **v2:** as mesmas colunas mais `lat, lon, gear, flaps, elevator, aileron, rudder, speedbrake`. O FlightGear também consegue redesenhar o voo.
- **v3:** v2 mais a câmera (`cam_view, cam_hdg, cam_pitch, cam_fov, cam_dist`: vista, giro, inclinação, zoom e distância da Chase View). No replay, o FlightGear repete o mesmo enquadramento, inclusive a apresentação do avião; nos voos v1 e v2 a câmera fica livre. Toda gravação feita com o protocolo atual já sai em v3.

## Algoritmo

Entrada nos eixos do avião (x frente, y direita, z baixo). Saída na pose da plataforma (x frente, y esquerda, z cima; convenção ZYX de `StewartPlatform`, em que pitch positivo **abaixa** a frente). Por isso pitch e yaw trocam de sinal no mapeamento.

| Canal | Entrada | O que faz |
| --- | --- | --- |
| Inclinação (tilt) | Força específica x, y escalada (`f_scale`) | Passa-baixa e `asin(f/g)`: a gravidade empurra o ocupante como a aceleração sustentada faria. Taxa limitada (`tilt_rate_max`) para ficar abaixo do limiar do ouvido interno. Reproduz também a atitude sustentada (subida, descida). |
| Translação | Força específica em torno de 1 g, escalada (`trans_scale`) | Passa-alta de 3ª ordem até deslocamento: o solavanco aparece e o tampo volta ao centro sozinho. Usar a força específica, e não a aceleração cinemática, evita a pista lateral falsa das curvas coordenadas. |
| Rotação | p, q, r escalados (`rot_scale`, `yaw_scale`) | Passa-alta de 2ª ordem integrado: dá o início das rolagens e arfagens e depois volta ao zero. |

Depois do washout, a pose passa por três travas: limites por eixo (`x_max` … `yaw_max`), encolhimento na direção do neutro até caber no curso dos pistões e limite de velocidade das pernas (`leg_speed_max`). O mesmo limitador faz as transições de engatar (a partir da pose medida) e de soltar (até o neutro).

Os gráficos comparam o que o piloto sente no avião com o que o ocupante sente na plataforma (aceleração do tampo + gravidade pela inclinação), ao vivo e na análise de voos gravados.

### Limitação física

Com ~10 mm/s por perna, a plataforma inclina no máximo ~2°/s e não consegue dar o "tranco" do início de uma aceleração (onset). O que ela reproduz bem são as pistas lentas: aceleração sustentada na decolagem, subida e descida, e o início das rotações. Na rotina de demonstração, com os parâmetros padrão, o limitador de velocidade atua em ~28% do tempo e nenhuma pose precisa ser encolhida. Se os pistões reais forem mais rápidos do que o simulador indica, aumente `leg_speed_max`.

## Execução

### Voo gravado (sem FlightGear)

1. Suba o backend e abra a tela **Motion cueing**.
2. Conecte a bancada ou o simulador no topo e clique em **Engatar**.
3. Em **Voos gravados**, clique em **Play**. Velocidade de 0,5× a 2× e repetição ficam logo acima da lista.

Sem serial conectada, tudo roda e aparece no 3D, mas nada se move. O ícone de gráfico ao lado de cada voo abre a **análise**: o voo inteiro passado pelo washout com os parâmetros atuais, com picos por eixo e o quanto do tempo o limitador atuou.

### Ao vivo

```powershell
# 1. FlightGear com a saída UDP (e --httpd para o MCP do FlightGear)
powershell -File interface\simulation\start-flightgear-cueing.ps1 -Aircraft c172p -Airport SBGR

# 2. Ponte (backend já rodando)
cd interface\simulation
python fg-bridge.py --cueing
```

O launcher abre na **Chase View** (terceira pessoa, atrás do avião), para quem assiste ver a orientação do avião de fora da cabine; `-View 0` volta para a cabine e `-View 1` dá a câmera orbital. O piloto de demonstração também escolhe a Chase View ao decolar.

O launcher usa o ERJ145 do IFSP por padrão (`-Aircraft c172p` para o Cessna). Na aba **Ao vivo**, confira "Recebendo do FlightGear". **Gravar voo** guarda um arquivo novo em `interface/simulation/flights/`.

Para refazer a rotina de demonstração, `python fly-demo.py` (na mesma pasta) faz tudo sozinho com o ERJ145: a apresentação com a câmera enquanto os motores dão partida, a decolagem, o circuito com as manobras e o pouso (o C172P só decola e faz manobras). O piloto está em `demo-flight.nas` e vai pela API HTTP do FlightGear, porque o Nasal não lê arquivos fora das pastas do simulador.

### Variáveis de ambiente da ponte

- `STEWARD_API_BASE` (padrão `http://localhost:8001`): backend.
- `FG_CUEING_UDP_HOST` / `FG_CUEING_UDP_PORT` (padrão `127.0.0.1:5510`): onde ouvir o FlightGear.
- `FG_RECONNECT_DELAY` (padrão `2.0` s).

## API

| Rota | Descrição |
| --- | --- |
| `GET /cueing/status` | Fonte, modo (`off`, `engaging`, `on`, `releasing`), ponte, replay, gravação, eventos e parâmetros |
| `GET/POST /cueing/params` | Lê ou troca os parâmetros (valem na hora); `POST /cueing/params/save` grava em `cueing_params.json` |
| `POST /cueing/engage` / `release` | Engata com `{profile: "washout" \| "attitude"}` (transição suave a partir da pose medida) ou volta ao neutro |
| `POST /cueing/record/start` / `stop` / `discard` | Gravação de voos ao vivo |
| `GET /cueing/flights` | Voos gravados; `GET /cueing/flights/{id}/analysis` roda o washout no voo inteiro; `POST /cueing/flights/{id}/delete` apaga |
| `POST /cueing/replay/start` / `update` / `stop` | Toca um voo (perfil, velocidade, repetição, pausa, `visual` para o FlightGear) |
| `GET /fg/check`, `GET /fg/status`, `POST /fg/launch`, `POST /fg/stop`, `GET /fg/stream` | FlightGear como tela do voo gravado |
| `WS /cueing/ingest` | Entrada da ponte: uma amostra JSON por mensagem |

## Segurança Operacional

- **Parada de emergência** (botão PARAR ou Esc) desliga o cueing e o replay antes de congelar os atuadores. O envio serial acontece sob o mesmo lock, então nenhum comando do cueing sai depois que a parada começa.
- Não engata com uma rotina rodando nem com a simulação de voo antiga liberada, e desengata sozinho se uma delas começar ou se a serial cair.
- Sem dados do FlightGear por 0,5 s, volta ao neutro. Com o FlightGear pausado, segura a última pose.
- Fechar a aba solta a plataforma (`/cueing/release` via `sendBeacon`), se for a tela dona da plataforma.
- Só um perfil manda por vez: a outra tela avisa "engatada pela tela …" e não engata até a primeira soltar.
- Se o FlightGear cair no meio do voo, a plataforma continua tocando, e a tela mostra o motivo.
- **Inverter pitch** (nos parâmetros das duas telas) corrige o sentido se, na bancada, a frente física da cadeira for o lado −X.

## Testes

`interface/backend/tests/test_cueing.py` cobre os sinais de cada canal (aceleração → nariz para cima, curva coordenada sem pista lateral, rolagem à direita → roll positivo, guinada, heave), o washout de volta ao neutro, o limitador de velocidade e de curso, engatar/soltar, parada de emergência, conflito com rotinas, gravação, análise, replay e as rotas.

## 👤 Autor

**Guilherme Miyata** - Instituto Federal de São Paulo (IFSP)
Trabalho de Conclusão de Curso - 2025

---

<a href='https://github.com/g-Miyata'>Github</a><br>
<a href='www.linkedin.com/in/g-miyata'>Linkedin</a><br>
<a href='https://www.g-miyata.com'>Portfólio</a>

**Última atualização:** Setembro 2026
