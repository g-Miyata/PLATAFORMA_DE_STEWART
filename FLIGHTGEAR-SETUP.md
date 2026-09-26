# FlightGear: instalação e uso nas telas de voo

Este guia deixa o computador pronto para as telas **Simulador de voo** (`/simulador-voo`, motion cueing) e **Orientação do avião** (`/orientacao-voo`, roll/pitch). As duas usam o FlightGear de dois jeitos:

- **Rodar no FlightGear (voo gravado):** um botão na própria tela. O backend abre o FlightGear sem física, com o Embraer ERJ145 na pintura do IFSP, e o avião voa a gravação **sincronizado com a plataforma**. A imagem aparece dentro da página. É o modo para apresentações.
- **Voar ao vivo:** você (ou o piloto de demonstração) pilota o FlightGear com a física ligada, e a plataforma segue em tempo real. Também é assim que se gravam voos novos.

A tela antiga de roll/pitch por Telnet continua disponível só na interface `/antigo`.

## 1. Pré-requisitos

| O quê | Como instalar |
| --- | --- |
| FlightGear 2024.1 | `winget install FlightGear.FlightGear` (ou o instalador de [flightgear.org](https://www.flightgear.org/download/)) |
| Dados base (FGData) da mesma versão | Veja a seção 2 |
| Embraer ERJ145 | Veja a seção 3 |
| Backend do projeto | `start.bat`, ou o `README.md` principal |
| ~4 GB de memória livre | O FlightGear fecha sozinho quando a memória virtual acaba |

A pintura do IFSP (`interface/simulation/assets/ifsp.xml` e `ifsp-flightgear-livery.png`) é copiada para o avião **automaticamente**. Os protocolos UDP ficam no repositório, em `interface/simulation/fgdata/Protocol`, e não precisam ser copiados para lugar nenhum.

## 2. Dados base (FGData)

O instalador do FlightGear para Windows não traz os dados base. Na primeira vez que o FlightGear abre, o launcher baixa os arquivos um a um, o que é lento. É mais rápido baixar o pacote da mesma versão do binário (a do winget é a 2024.1.4) e extrair em `%USERPROFILE%\FlightGear`:

```bash
curl -L -o FlightGear-2024.1.4-data.txz https://mirrors.ibiblio.org/flightgear/ftp/release-2024.1/FlightGear-2024.1.4-data.txz
```

```bash
tar -xJf FlightGear-2024.1.4-data.txz -C "%USERPROFILE%\FlightGear"
```

A pasta resultante é `%USERPROFILE%\FlightGear\fgdata_2024_1`. O backend acha essa pasta sozinho; em outro lugar, defina a variável `FG_ROOT` com o caminho.

## 3. Avião ERJ145

1. Abra o FlightGear pelo atalho (o launcher gráfico).
2. Aba **Aircraft** → busque **ERJ** → **Embraer ERJ 145** → **Install**.
3. Feche o launcher.

O avião fica em `%USERPROFILE%\FlightGear\Downloads\Aircraft\org.flightgear.fgaddon.stable_2024\Aircraft\Embraer-ERJ-145`. Instalado à mão (zip do FGAddon), coloque a pasta `Embraer-ERJ-145` em `%USERPROFILE%\FlightGear\Custom Aircraft`, ou aponte `FG_AIRCRAFT` para a pasta que a contém.

## 4. Rodar um voo gravado no FlightGear (apresentação)

1. Suba o backend e abra **Simulador de voo** ou **Orientação do avião**.
2. No cartão **FlightGear**, confira **Pré-requisitos ok**. Se faltar algo, a lista mostra o item e como resolver (tabela da seção 6).
3. Clique em **Rodar no FlightGear**. A janela do FlightGear abre e, em 20 s a 1 min, a imagem aparece no cartão com o selo **No ar**.
4. Conecte a bancada (ou o **Simulador**) no topo da página e clique em **Engatar**.
5. Em **Voos gravados**, clique em **Play**. Voos com o selo "Aparece no FlightGear" são desenhados no FlightGear; a rotina pronta é **ERJ145 IFSP: decolagem e manobras em SBGR**.

Dicas:
- **Imagem fluida:** a imagem que o FlightGear manda pelo servidor dele (MJPEG) tem ~7 fps e compressão JPEG. Para projetar, clique em **Imagem fluida (capturar a janela)** e escolha a janela do FlightGear na lista do navegador. A página passa a mostrar a janela em até 60 fps, na resolução real, e o FlightGear fica mais leve. Funciona no Chrome e no Edge; a escolha vale para as duas telas até você fechar o FlightGear ou clicar em "Voltar para a imagem do servidor".
- O ícone de tela cheia no canto da imagem serve para projetar.
- Deixe a janela do FlightGear aberta, mesmo atrás do navegador. Minimizada, ela para de desenhar e a imagem congela.
- Pausar, mudar a velocidade ou repetir o voo vale para a plataforma e para o avião ao mesmo tempo.
- Só uma tela manda na plataforma por vez. A outra mostra "engatada pela tela …" até você soltar por lá.

## 5. Voar ao vivo e gravar voos

```powershell
powershell -File interface\simulation\start-flightgear-cueing.ps1
```

```bash
cd interface\simulation
python fg-bridge.py --cueing
```

O primeiro comando abre o ERJ145 do IFSP no SBGR com a física ligada, a saída UDP a 60 Hz e a câmera de terceira pessoa. Use `-Aircraft c172p` para o Cessna e `-View 0` para a cabine. O segundo repassa os dados ao backend.

Na aba **Ao vivo**, confira "Recebendo do FlightGear", engate e voe. **Gravar voo** salva em `interface/simulation/flights/`; voos gravados assim já trazem posição e superfícies para o botão do FlightGear.

Para o avião decolar e fazer as manobras sozinho (é assim que a rotina pronta foi gravada):

```bash
python fly-demo.py
```

## 6. Erros comuns

Os itens da lista de pré-requisitos têm estes identificadores (`GET /fg/check`):

| Item | Mensagem | Solução |
| --- | --- | --- |
| `fgfs` | fgfs não encontrado | Instale o FlightGear (`winget install FlightGear.FlightGear`) ou defina `FGFS` com o caminho completo do `fgfs.exe` |
| `fgdata` | FGData não encontrado ou de outra versão | Baixe o FGData da **mesma** versão do FlightGear (seção 2) ou defina `FG_ROOT` |
| `aircraft` | erj145-set.xml não encontrado | Instale o Embraer ERJ 145 pelo launcher (seção 3) ou aponte `FG_AIRCRAFT` |
| `livery` | Pintura ainda não copiada | Automático ao rodar. Se falhar por permissão, copie `assets/ifsp.xml` para `Embraer-ERJ-145\Models\Liveries` e o PNG para `Models\Liveries\2048x2048` |
| `protocols` | Protocolos faltando | Restaure `interface/simulation/fgdata/Protocol` do repositório |
| `ports` | TCP 8080 ou UDP 5511 em uso | Feche o outro FlightGear aberto (ou o programa na porta). Portas diferentes: variáveis `FG_HTTP_PORT` e `FG_VISUAL_PORT` antes de subir o backend |
| `memory` | Pouca memória livre (aviso) | Feche programas pesados (Blender, navegadores, IDEs). Com menos de ~4 GB livres, o FlightGear pode fechar no meio do voo |

Outras situações:

- **"O FlightGear fechou sozinho"**: o cartão mostra o código de saída e as últimas linhas de alerta do log (`%APPDATA%\flightgear.org\fgfs.log`). O caso mais comum é falta de memória. A plataforma continua tocando o voo.
- **"O FlightGear está aberto mas não responde"**: quase sempre é uma caixa de mensagem de erro na janela do FlightGear (por exemplo "Fatal exception"). Leia, feche e rode de novo.
- **Imagem preta ou congelada**: a janela do FlightGear está minimizada. Restaure (pode ficar atrás) e clique em **Recarregar imagem**.
- **Imagem travando ou com qualidade pior que a do FlightGear**: é o limite do MJPEG do FlightGear (~7 fps, JPEG). Use **Imagem fluida (capturar a janela)**.
- **Plataforma soltou sozinha**: o cartão **Eventos** mostra quem soltou (botão Soltar ou a página saindo da tela) e em qual aba. Fechar ou recarregar a aba dona da plataforma sempre solta, por segurança.
- **"Este voo foi gravado sem posição do avião"**: voos antigos (formato v1) movem a plataforma, mas não o FlightGear. Grave de novo pela aba Ao vivo.
- **Rodando `fgfs` no Git Bash**: o terminal converte argumentos que começam com `/` (`--prop:/sim/...` vira `C:/Program Files/Git/sim/...`) e o FlightGear para com "Illegal character in property path". Use o PowerShell, o `start-flightgear-cueing.ps1` ou o botão da tela.
- **ERJ145 com motores "sem combustível"** ao voar ao vivo: o avião abre com os tanques desmarcados. O `fly-demo.py` já marca os tanques e dá a partida; à mão, use o menu do avião (Autostart).
