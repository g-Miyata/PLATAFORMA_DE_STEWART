// Conteúdo da aula (Módulo 1: a plataforma; Módulo 2: cinemática). Notação do TCC
// (Guilherme M. Meirelles, IFSP 2025, §2.1–2.2): aᵢ ∈ {B}, bᵢ ∈ {P}, pose (p, R),
// Pᵢ = p + R·bᵢ, sᵢ = Pᵢ − aᵢ, Lᵢ = ‖sᵢ‖, Δᵢ = Lᵢ − Lmin. Referências: Craig (2012),
// Merlet e Gosselin (2008), Eisele (raw.org, 2019), Hawkins (2013, IK do UR).
// Nos textos: $…$ é LaTeX e **…** é negrito.
import type { Lesson, Module } from './types';

const t = String.raw;

const moduloPlataforma: Lesson[] = [
  {
    id: 'o-que-e',
    title: 'O que é uma Plataforma de Stewart',
    summary: 'As peças, a história e por que usar um robô paralelo.',
    steps: [
      {
        id: 'mecanismo',
        title: 'Um robô de cadeia fechada',
        body: [
          'A Plataforma de Stewart é um **robô paralelo**: em vez de um braço com juntas uma depois da outra, ela tem uma **base fixa** e uma **plataforma móvel** (o tampo) ligadas por **seis atuadores** ao mesmo tempo.',
          'Cada atuador só faz uma coisa: fica mais comprido ou mais curto. Mudando os seis comprimentos juntos, o tampo pode ir para qualquer posição e inclinação dentro do alcance.',
          'Passe o mouse (ou o foco do teclado) nas peças abaixo para vê-las no modelo.',
        ],
        widgets: ['parts'],
        scene: { show: 'stewart', overlays: { parts: true }, camera: 'iso' },
        sceneSummary: 'A bancada completa: base fixa embaixo, tampo em cima e seis atuadores coloridos ligando os dois por juntas cardã.',
        quiz: [{ q: 'Quantos atuadores ligam a base ao tampo?', options: ['3', '6', '12'], correct: 1, explain: 'São seis atuadores lineares, um para cada grau de liberdade.' }],
      },
      {
        id: 'historia',
        title: 'De onde ela veio',
        body: [
          'Em 1954, **Eric Gough** construiu na Dunlop (Reino Unido) uma máquina de seis pernas para testar pneus: o pneu ficava preso num tampo que podia ser empurrado e girado em todas as direções.',
          'Em 1965, **D. Stewart** publicou o artigo "A Platform with Six Degrees of Freedom", propondo o mecanismo para **simuladores de voo**. O nome pegou: hoje se fala em plataforma de Stewart ou de Gough–Stewart.',
          'Onde ela aparece hoje:',
          { list: ['simuladores de voo e de direção (a cabine inteira fica em cima do tampo);', 'ensaios de vibração e de estruturas;', 'posicionamento de telescópios, antenas e espelhos;', 'cirurgia e micromanipulação de alta precisão;', 'usinagem e montagem ("hexápodes").'] },
          'Esta bancada do IFSP São José dos Campos foi reformada no TCC: controle PID de cada pistão num ESP32-S3, cinemática em tempo real e integração com o simulador de voo FlightGear.',
        ],
        scene: { show: 'stewart', showcase: true, camera: 'iso' },
        sceneSummary: 'A bancada faz a coreografia da página inicial: sobe, inclina e gira.',
        quiz: [{ q: 'Para que Stewart propôs a plataforma em 1965?', options: ['Testar pneus', 'Simular voo', 'Soldar carrocerias'], correct: 1, explain: 'Gough usou a ideia para testar pneus; Stewart a propôs para simuladores de voo.' }],
      },
      {
        id: 'por-que',
        title: 'Por que um robô paralelo?',
        body: [
          'Como a carga se divide entre as seis pernas, e cada perna só é empurrada ou puxada ao longo do próprio eixo, a estrutura é **rígida** e aguenta **cargas grandes** para o seu peso.',
          'Os erros dos atuadores **não se acumulam** como num braço, em que um erro no ombro é amplificado até a ponta: aqui cada perna liga direto a base ao tampo. Isso dá **precisão**.',
          'O preço: o **espaço de trabalho é pequeno** (as pernas batem no fim do curso logo), existem **singularidades** e, como veremos no Módulo 2, a **cinemática direta é difícil**.',
          { note: 'Para ver o alcance real desta bancada, abra a página Espaço de trabalho.' },
        ],
        scene: { show: 'stewart', overlays: { legs: 'all' }, camera: 'iso' },
        sceneSummary: 'As seis pernas aparecem como setas coloridas, cada uma com o seu comprimento.',
        quiz: [
          {
            q: 'Comparado a um braço robótico, o que a Stewart tem de melhor?',
            options: ['Alcance maior', 'Rigidez e precisão', 'Cinemática direta mais simples'],
            correct: 1,
            explain: 'As seis pernas dividem a carga e os erros não se acumulam; em troca, o alcance é menor e a direta é mais difícil.',
          },
        ],
      },
    ],
  },
  {
    id: 'gdl',
    title: 'Seis graus de liberdade',
    summary: 'Três translações e três rotações descrevem a pose do tampo.',
    steps: [
      {
        id: 'translacoes',
        title: 'Três translações',
        body: [
          'Um corpo rígido livre no espaço tem **seis graus de liberdade** (GDL). Os três primeiros são translações: andar em **X**, em **Y** e em **Z**.',
          'Mexa nos controles: o tampo anda sem girar. As setas vermelha, verde e azul são os eixos X, Y e Z.',
        ],
        widgets: ['pose-xyz'],
        scene: { show: 'stewart', overlays: { plateFrame: true, baseFrame: true }, camera: 'iso' },
        sceneSummary: 'Os eixos da base e do tampo aparecem como setas X (vermelha), Y (verde) e Z (azul).',
        quiz: [{ q: 'Aumentar Z faz o tampo...', options: ['girar', 'subir', 'andar para o lado'], correct: 1, explain: 'Z é o eixo vertical: aumentar Z sobe o tampo sem incliná-lo.' }],
      },
      {
        id: 'rotacoes',
        title: 'Três rotações',
        body: [
          'Os outros três GDL são rotações em torno dos eixos. Como num avião:',
          { list: ['**roll** ($\\phi$, rolagem): em torno de X, como inclinar as asas;', '**pitch** ($\\theta$, arfagem): em torno de Y, como levantar o nariz;', '**yaw** ($\\psi$, guinada): em torno de Z, como virar para o lado.'] },
          'Repare que os eixos do tampo giram junto com ele.',
        ],
        widgets: ['pose-rpy'],
        scene: { show: 'stewart', overlays: { plateFrame: true }, camera: 'iso' },
        sceneSummary: 'Os eixos X, Y e Z do tampo giram junto com ele.',
        quiz: [{ q: 'Inclinar as asas para fazer uma curva é...', options: ['roll', 'pitch', 'yaw'], correct: 0, explain: 'Roll é a rotação em torno do eixo longitudinal (X).' }],
      },
      {
        id: 'desafio',
        title: 'Desafio: encaixe no fantasma',
        body: [
          'Seis números descrevem completamente onde o tampo está: $(x, y, z, \\phi, \\theta, \\psi)$. Esse conjunto é a **pose**.',
          'Leve a plataforma até o tampo fantasma usando os seis controles. Quando os seis estiverem perto, o desafio se completa.',
        ],
        widgets: ['dof-challenge'],
        scene: { show: 'stewart', overlays: { ghosts: true, plateFrame: true }, camera: 'iso' },
        sceneSummary: 'Um tampo fantasma verde marca a pose alvo; o tampo real se move com os controles.',
        quiz: [{ q: 'Quantos números descrevem a pose do tampo?', options: ['3', '6', '12'], correct: 1, explain: 'Três de posição (x, y, z) e três de orientação (roll, pitch, yaw).' }],
      },
    ],
  },
  {
    id: 'atuadores',
    title: 'Atuadores e juntas',
    summary: 'Como cada perna muda de comprimento e por que precisa de juntas cardã.',
    steps: [
      {
        id: 'atuador',
        title: 'O atuador linear',
        body: [
          'Cada perna é um **atuador linear elétrico**: um motor DC de 12 V com caixa de redução gira um fuso; a porca do fuso anda e empurra a haste para fora ou para dentro. Um **potenciômetro** mede a posição e o ESP32 fecha a malha com um PID.',
          'O comprimento total da perna, de junta a junta, é $L_i$. Com a haste toda recolhida ele vale $L_{\\min}$, e o que o atuador realmente controla é o **curso**:',
          { eq: t`\Delta_i = L_i - L_{\min}, \qquad 0 \le \Delta_i \le 180\ \text{mm}`, label: 'Delta i igual a L i menos L mínimo, entre 0 e 180 milímetros' },
          'Mexa só no pistão 1. O tampo inteiro se move, e não só aquele canto: descobrir para onde ele vai é a cinemática direta, assunto da aula 2.4.',
        ],
        widgets: ['actuator'],
        scene: { show: 'stewart', overlays: { legs: 'one' }, camera: 'actuator' },
        sceneSummary: 'Câmera próxima do atuador 1, com a seta do comprimento L1.',
        quiz: [{ q: 'Se Lmin = 500 mm e o curso é Δ = 80 mm, quanto vale L?', options: ['80 mm', '500 mm', '580 mm'], correct: 2, explain: 'L = Lmin + Δ = 500 + 80 = 580 mm.' }],
      },
      {
        id: 'juntas',
        title: 'Juntas cardã',
        body: [
          'Quando o tampo se move, cada perna muda de **ângulo**, não só de comprimento. Por isso as pontas das pernas são presas por **juntas cardã** (universais), que deixam a perna girar em duas direções.',
          'No projeto original de Stewart eram juntas esféricas (três rotações); nesta bancada são cardãs na base e no tampo. Os pontos de fixação é que importam para a cinemática: $\\mathbf{a}_i$ na base e $\\mathbf{b}_i$ no tampo.',
        ],
        scene: { show: 'stewart', overlays: { base: true, legs: 'all' }, camera: 'joint' },
        sceneSummary: 'Câmera próxima de uma junta cardã da base, com os pontos a1 a a6 marcados.',
        quiz: [{ q: 'Quantas rotações uma junta cardã permite?', options: ['1', '2', '3'], correct: 1, explain: 'Duas rotações, em eixos perpendiculares (a esférica permite três).' }],
      },
      {
        id: 'limites',
        title: 'Até onde dá para ir',
        body: [
          'Cada atuador só vai de $L_{\\min}$ a $L_{\\max}$. Uma pose só é possível se as **seis** pernas couberem no curso ao mesmo tempo.',
          'Exagere nos controles: a perna que sair do curso fica **vermelha**. É assim que a interface bloqueia poses impossíveis antes de mandar para a bancada.',
        ],
        widgets: ['pose-wide'],
        scene: { show: 'stewart', overlays: { legs: 'all' }, camera: 'iso' },
        sceneSummary: 'As seis pernas com o comprimento; a que passa do curso fica vermelha.',
        quiz: [{ q: 'A pose é possível se...', options: ['pelo menos uma perna estiver no curso', 'todas as seis estiverem no curso', 'o tampo não girar'], correct: 1, explain: 'Basta uma perna fora do curso para a pose ser impossível.' }],
      },
    ],
  },
  {
    id: 'coordenadas',
    title: 'Sistemas de coordenadas',
    summary: 'Os referenciais {B} e {P} e os pontos aᵢ e bᵢ.',
    steps: [
      {
        id: 'base',
        title: '{B}: o referencial da base',
        body: [
          'Para fazer contas, a gente precisa de um referencial. O da base, $\\{B\\}$, fica **no centro da base**, com Z para cima. Ele nunca se move.',
          'Os seis pontos de fixação das pernas na base, $\\mathbf{a}_i$, são medidos nesse referencial. Eles vieram das furações reais da bancada (TCC, tabela 8).',
        ],
        widgets: ['points-base'],
        scene: { show: 'stewart', overlays: { baseFrame: true, base: true }, camera: 'top' },
        sceneSummary: 'Vista de cima: o referencial {B} no centro e os pontos a1 a a6 nas juntas da base.',
      },
      {
        id: 'plataforma',
        title: '{P}: o referencial do tampo',
        body: [
          'O referencial do tampo, $\\{P\\}$, fica **no centro do tampo** e se move junto com ele.',
          'Os pontos de fixação no tampo, $\\mathbf{b}_i$, são medidos em $\\{P\\}$ e por isso são **constantes**: não importa como o tampo esteja, o furo continua no mesmo lugar do tampo.',
          'Mexa na pose e compare as colunas: $\\mathbf{b}_i$ (em $\\{P\\}$) não muda; $\\mathbf{P}_i$, o mesmo ponto visto de $\\{B\\}$, muda.',
        ],
        widgets: ['pose-all', 'points-plate'],
        scene: { show: 'stewart', overlays: { plateFrame: true, plate: 'b' }, camera: 'iso' },
        sceneSummary: 'O referencial {P} no centro do tampo e os pontos b1 a b6 nas juntas do tampo.',
        quiz: [{ q: 'Quando o tampo gira, as coordenadas de bᵢ em {P}...', options: ['mudam', 'não mudam'], correct: 1, explain: 'bᵢ é fixo no tampo; quem muda é Pᵢ, o mesmo ponto medido em {B}.' }],
      },
      {
        id: 'pose',
        title: 'A pose liga os dois',
        body: [
          'A pose é o que diz onde $\\{P\\}$ está em relação a $\\{B\\}$: o vetor $\\mathbf{p}$ (do centro da base até o centro do tampo) e a rotação $R$ (como o tampo está girado).',
          { eq: t`\text{pose} = (\mathbf{p},\ R), \qquad \mathbf{p} = \begin{bmatrix} x & y & z \end{bmatrix}^T,\quad R = R(\phi, \theta, \psi)`, label: 'pose igual ao par p e R' },
          'Com a pose e os pontos $\\mathbf{a}_i$ e $\\mathbf{b}_i$, dá para calcular tudo o que vem a seguir.',
        ],
        widgets: ['pose-all'],
        scene: { show: 'stewart', overlays: { baseFrame: true, plateFrame: true, translation: true }, camera: 'iso' },
        sceneSummary: 'Os dois referenciais e a seta amarela p, do centro da base até o centro do tampo.',
        quiz: [{ q: 'O vetor p liga...', options: ['aᵢ a bᵢ', 'o centro da base ao centro do tampo', 'a junta 1 à junta 2'], correct: 1, explain: 'p é a posição da origem de {P} medida em {B}.' }],
      },
    ],
  },
];

const moduloCinematica: Lesson[] = [
  {
    id: 'seriais-paralelos',
    title: 'Cinemática em robôs: seriais × paralelos',
    summary: 'Por que a direta é fácil num braço e difícil na Stewart, e a inversa é o contrário.',
    steps: [
      {
        id: 'dois-jeitos',
        title: 'Dois jeitos de montar um robô',
        body: [
          '**Cinemática** relaciona as juntas de um robô com a posição e a orientação da ferramenta, sem olhar para forças. Há duas perguntas:',
          { list: ['**direta**: conhecendo as juntas, onde está a ferramenta?', '**inversa**: para a ferramenta chegar numa pose, como devem estar as juntas?'] },
          'À esquerda, um **robô serial**: o UR5e, um braço de seis juntas rotativas muito usado em laboratórios. Os elos vêm um depois do outro, da base até a ferramenta: é uma **cadeia aberta**.',
          'À direita, a Stewart: seis cadeias que saem da base e se fecham no tampo, uma **cadeia fechada**.',
          'Cada tipo tem uma pergunta fácil e uma difícil, e elas são trocadas.',
        ],
        scene: { show: 'both', camera: 'both' },
        sceneSummary: 'O braço UR5e à esquerda e a Plataforma de Stewart à direita.',
        quiz: [{ q: 'O UR5e é um robô...', options: ['serial (cadeia aberta)', 'paralelo (cadeia fechada)'], correct: 0, explain: 'Os elos e juntas do UR5e vêm em sequência, da base até a ferramenta.' }],
      },
      {
        id: 'direta-serial',
        title: 'Direta no serial: seguir a cadeia',
        body: [
          'No serial, cada junta $i$ tem uma matriz ${}^{i-1}T_i$ que leva do referencial dela ao da próxima. Pela convenção de **Denavit–Hartenberg** (Craig, 2012), cada matriz depende de quatro números: o ângulo da junta $\\theta_i$ e três medidas do elo ($d_i$, $a_i$, $\\alpha_i$).',
          { eq: t`{}^{i-1}T_i = R_z(\theta_i)\,T_z(d_i)\,T_x(a_i)\,R_x(\alpha_i)`, label: 'Matriz de Denavit-Hartenberg da junta i' },
          'Para achar a ferramenta, basta **multiplicar as seis em sequência**:',
          { eq: t`{}^{0}T_6 = {}^{0}T_1\,{}^{1}T_2\,{}^{2}T_3\,{}^{3}T_4\,{}^{4}T_5\,{}^{5}T_6`, label: 'T zero seis igual ao produto das seis matrizes' },
          'Mexa nas juntas: os referenciais de cada junta aparecem encadeados no modelo e a matriz abaixo é recalculada. Sempre **uma resposta só**, sem nenhuma equação para resolver.',
        ],
        widgets: ['ur-fk'],
        scene: { show: 'ur5e', camera: 'ur' },
        sceneSummary: 'O UR5e com os referenciais de cada junta desenhados; os ângulos seguem os controles.',
        quiz: [{ q: 'Na direta de um robô serial, a posição da ferramenta sai...', options: ['multiplicando as matrizes das juntas em sequência', 'resolvendo seis equações acopladas por tentativa'], correct: 0, explain: 'É só percorrer a cadeia: uma multiplicação de matrizes por junta.' }],
      },
      {
        id: 'inversa-serial',
        title: 'Inversa no serial: o problema difícil',
        body: [
          'Agora ao contrário: dada a pose da ferramenta, quais ângulos a produzem? Comece por um braço de duas juntas no plano. Arraste o alvo:',
          'Para o mesmo ponto existem **duas soluções** (cotovelo para cima e para baixo), e fora do anel alcançável não existe nenhuma.',
          'No UR5e, com seis juntas, a inversa tem fórmula fechada (Hawkins, 2013), mas chega a **oito soluções**: ombro para a esquerda ou para a direita, cotovelo para cima ou para baixo, punho de um lado ou do outro. O programa ainda precisa escolher uma, respeitando limites e evitando colisões.',
        ],
        widgets: ['arm-2r', 'ur-ik'],
        scene: { show: 'ur5e', camera: 'ur' },
        sceneSummary: 'O UR5e com as outras soluções da inversa desenhadas como braços fantasma e o alvo da ferramenta marcado.',
        quiz: [{ q: 'Quantas soluções o UR5e pode ter para a mesma pose da ferramenta?', options: ['1', '2', 'até 8'], correct: 2, explain: '2 (ombro) × 2 (cotovelo) × 2 (punho) = até 8 conjuntos de ângulos.' }],
      },
      {
        id: 'paralelo',
        title: 'E no paralelo é o contrário',
        body: [
          'Na Stewart, a pose do tampo é a **entrada** mais natural. Com ela, cada perna se calcula **sozinha**:',
          { eq: t`L_i = \lVert \mathbf{p} + R\,\mathbf{b}_i - \mathbf{a}_i \rVert,\qquad i = 1,\dots,6`, label: 'L i igual à norma de p mais R b i menos a i' },
          'Clique no botão abaixo e veja o cálculo perna por perna: uma conta direta, uma resposta por perna. Essa é a **inversa**, e aqui ela é a fácil.',
          'Já a **direta** (conhecer os seis $L_i$ e achar a pose) exige resolver as seis equações **ao mesmo tempo**: todas dependem das mesmas seis incógnitas. Pode haver até **40 soluções** (Merlet e Gosselin, 2008), e não existe fórmula geral.',
        ],
        widgets: ['ik-legs'],
        scene: { show: 'stewart', overlays: { legs: 'all' }, camera: 'iso' },
        sceneSummary: 'As seis pernas da Stewart acendem uma a uma, cada uma com o comprimento calculado.',
        quiz: [{ q: 'Na Stewart, para calcular L₃ eu preciso...', options: ['só da pose e dos pontos a₃ e b₃', 'calcular L₁ e L₂ antes', 'resolver um sistema com as seis pernas'], correct: 0, explain: 'Na inversa, cada perna depende só da pose e dos seus dois pontos de fixação.' }],
      },
      {
        id: 'resumo',
        title: 'Resumo: quem é fácil em cada um',
        body: [
          {
            table: {
              caption: 'Comparação entre robôs seriais e paralelos',
              head: ['', 'Serial (UR5e)', 'Paralelo (Stewart)'],
              rows: [
                ['Estrutura', 'cadeia aberta', 'cadeias fechadas'],
                ['Cinemática direta', 'fácil: produto de matrizes, 1 solução', 'difícil: 6 equações acopladas, até 40 soluções, método numérico'],
                ['Cinemática inversa', 'difícil: até 8 soluções, pode não existir', 'fácil: fórmula fechada, 1 conta por perna'],
                ['Erros dos atuadores', 'se acumulam até a ponta', 'se dividem entre as pernas'],
                ['Rigidez e carga', 'menores', 'maiores'],
                ['Espaço de trabalho', 'grande', 'pequeno'],
              ],
            },
          },
          'A regra para lembrar: **o fácil é seguir a cadeia**. No serial, a cadeia vai das juntas para a ferramenta (direta). No paralelo, cada cadeia vai do tampo até a base, perna por perna (inversa).',
        ],
        scene: { show: 'both', camera: 'both' },
        sceneSummary: 'O braço UR5e e a Plataforma de Stewart lado a lado.',
        quiz: [{ q: 'Na Stewart, qual cinemática precisa de método numérico?', options: ['a direta', 'a inversa'], correct: 0, explain: 'A direta: as seis equações de comprimento são acopladas e não lineares.' }],
      },
    ],
  },
  {
    id: 'pose',
    title: 'Construindo a pose',
    summary: 'O vetor p, as matrizes de rotação, a ordem ZYX e a transformação homogênea.',
    steps: [
      {
        id: 'posicao',
        title: 'A posição: o vetor p',
        body: [
          'A posição do tampo é o vetor que vai da origem de $\\{B\\}$ até a origem de $\\{P\\}$:',
          { eq: t`\mathbf{p} = \begin{bmatrix} x \\ y \\ z \end{bmatrix}`, label: 'p igual ao vetor x, y, z' },
          'Na bancada, o home é $\\mathbf{p} = (0,\\ 0,\\ 530)$ mm: o tampo centrado, 530 mm acima da base.',
        ],
        widgets: ['pose-xyz'],
        scene: { show: 'stewart', overlays: { baseFrame: true, translation: true }, camera: 'iso' },
        sceneSummary: 'A seta amarela p, da origem de {B} até o centro do tampo.',
      },
      {
        id: 'rotacoes',
        title: 'As rotações elementares',
        body: [
          'Cada rotação em torno de um eixo tem a sua matriz. Mexa nos ângulos e veja os números mudarem:',
          'Numa matriz de rotação, cada **coluna** é um eixo do tampo escrito em $\\{B\\}$. Por isso as setas do tampo no modelo são as colunas de $R$.',
        ],
        widgets: ['pose-rpy', 'rotation-matrices'],
        scene: { show: 'stewart', overlays: { plateFrame: true }, camera: 'iso' },
        sceneSummary: 'Os eixos do tampo giram conforme roll, pitch e yaw.',
        quiz: [{ q: 'A primeira coluna de R é...', options: ['o eixo X do tampo escrito em {B}', 'a posição do tampo', 'o comprimento da perna 1'], correct: 0, explain: 'As colunas de R são os eixos X, Y e Z de {P} vistos de {B}.' }],
      },
      {
        id: 'ordem',
        title: 'A ordem importa: R = Rz·Ry·Rx',
        body: [
          'A rotação total é a composição das três. Na bancada, seguindo o TCC, a ordem é **ZYX**:',
          { eq: t`R(\phi,\theta,\psi) = R_z(\psi)\,R_y(\theta)\,R_x(\phi)`, label: 'R igual a Rz vezes Ry vezes Rx' },
          'Multiplicação de matrizes **não é comutativa**: trocar a ordem dá outra orientação. O fantasma roxo mostra onde o tampo estaria com a ordem trocada, $R_x R_y R_z$, usando os mesmos três ângulos.',
          'Use "Animar ZYX" para ver a composição: primeiro o yaw, depois o pitch, por fim o roll.',
        ],
        widgets: ['pose-rpy', 'zyx-order'],
        scene: { show: 'stewart', overlays: { plateFrame: true, ghosts: true }, camera: 'iso', pose: { roll: 12, pitch: -10, yaw: 25 } },
        sceneSummary: 'O tampo com a rotação ZYX e um tampo fantasma roxo com a mesma rotação na ordem trocada.',
        quiz: [{ q: 'Com os mesmos ângulos, trocar a ordem das rotações...', options: ['dá a mesma orientação', 'pode dar outra orientação'], correct: 1, explain: 'RzRyRx ≠ RxRyRz em geral: a ordem precisa ser combinada (aqui, ZYX).' }],
      },
      {
        id: 'homogenea',
        title: 'Tudo numa matriz só',
        body: [
          'Posição e rotação cabem numa **transformação homogênea** 4×4:',
          { eq: t`T = \begin{bmatrix} R & \mathbf{p} \\ \mathbf{0}^T & 1 \end{bmatrix},\qquad \begin{bmatrix} \mathbf{P}_i \\ 1 \end{bmatrix} = T \begin{bmatrix} \mathbf{b}_i \\ 1 \end{bmatrix} \iff \mathbf{P}_i = \mathbf{p} + R\,\mathbf{b}_i`, label: 'Transformação homogênea T com R e p; P i igual a p mais R b i' },
          'Essa é a peça que falta para a cinemática: ela leva cada ponto do tampo, $\\mathbf{b}_i$, para o referencial da base.',
        ],
        widgets: ['pose-all', 'homogeneous'],
        scene: { show: 'stewart', overlays: { plateFrame: true, translation: true, plate: 'P' }, camera: 'iso' },
        sceneSummary: 'O tampo com o referencial {P}, a seta p e os pontos P1 a P6 das juntas do tampo.',
      },
    ],
  },
  {
    id: 'inversa',
    title: 'Cinemática inversa',
    summary: 'Da pose aos seis comprimentos, passo a passo.',
    steps: [
      {
        id: 'problema',
        title: 'O problema',
        body: [
          'Entrada: a pose $(x, y, z, \\phi, \\theta, \\psi)$. Saída: os seis comprimentos $L_1, \\dots, L_6$.',
          'É o que a bancada faz o tempo todo: você escolhe a pose (nos controles, no joystick ou numa rotina) e ela precisa saber quanto esticar cada pistão.',
          'Mexa na pose e veja os seis comprimentos mudarem.',
        ],
        widgets: ['pose-all'],
        scene: { show: 'stewart', overlays: { legs: 'all' }, camera: 'iso' },
        sceneSummary: 'As seis pernas com o comprimento de cada uma, atualizado com a pose.',
      },
      {
        id: 'passo-a-passo',
        title: 'Passo a passo',
        body: [
          'Escolha uma perna e acompanhe a conta com os números de agora (as setas no modelo mostram cada termo):',
          { list: ['monte $R = R_z R_y R_x$;', 'gire o ponto do tampo: $R\\,\\mathbf{b}_i$;', 'leve para a base: $\\mathbf{P}_i = \\mathbf{p} + R\\,\\mathbf{b}_i$;', 'vetor da perna: $\\mathbf{s}_i = \\mathbf{P}_i - \\mathbf{a}_i$;', 'comprimento e curso: $L_i = \\lVert\\mathbf{s}_i\\rVert$ e $\\Delta_i = L_i - L_{\\min}$.'] },
        ],
        widgets: ['ik-steps', 'pose-all'],
        scene: { show: 'stewart', overlays: { legs: 'one', decomposition: true }, camera: 'iso', pose: { x: 15, y: -10, roll: 5, pitch: -4, yaw: 8 } },
        sceneSummary: 'A perna escolhida decomposta: seta amarela p, seta roxa R·bᵢ, seta cinza aᵢ e a seta colorida sᵢ.',
        quiz: [{ q: 'O vetor sᵢ = Pᵢ − aᵢ vai...', options: ['da junta da base até a junta do tampo', 'do centro da base ao centro do tampo'], correct: 0, explain: 'sᵢ é o próprio atuador: de aᵢ (base) até Pᵢ (tampo).' }],
      },
      {
        id: 'independentes',
        title: 'Uma perna de cada vez',
        body: [
          'Repare que a conta da perna 3 não usa nada das pernas 1 e 2: **cada perna é independente**. É por isso que a inversa da Stewart é rápida e tem uma resposta só por perna.',
          'Nas rotinas, a bancada faz essa conta **60 vezes por segundo** para as seis pernas.',
        ],
        widgets: ['ik-legs'],
        scene: { show: 'stewart', overlays: { legs: 'all' }, camera: 'iso' },
        sceneSummary: 'As pernas acendem uma a uma conforme o cálculo avança.',
      },
      {
        id: 'limites',
        title: 'Conferindo o curso',
        body: [
          'A conta sempre dá um número, mas nem todo número é possível. Depois de calcular, o sistema confere as seis pernas:',
          { eq: t`L_{\min} \le L_i \le L_{\max} \iff 0 \le \Delta_i \le 180\ \text{mm}`, label: 'L mínimo menor ou igual a L i menor ou igual a L máximo' },
          'Se uma perna sair do curso, a pose é recusada antes de ir para a bancada. Exagere nos controles para ver.',
        ],
        widgets: ['pose-wide'],
        scene: { show: 'stewart', overlays: { legs: 'all' }, camera: 'iso' },
        sceneSummary: 'As pernas que saem do curso ficam vermelhas.',
        quiz: [{ q: 'Se Δ₄ = 195 mm, a pose...', options: ['é aplicada normalmente', 'é recusada (fora do curso)'], correct: 1, explain: 'O curso vai de 0 a 180 mm.' }],
      },
      {
        id: 'na-bancada',
        title: 'Na bancada',
        body: [
          'O caminho de um comando:',
          { list: ['a página manda a pose para o backend;', 'o backend roda `inverse_kinematics` (a mesma conta desta aula) e confere o curso;', 'converte os $L_i$ em cursos $\\Delta_i$ e manda ao ESP32;', 'o PID de cada pistão leva a haste até lá.'] },
          'A formulação vetorial veio de Eisele (2019) e foi adaptada às medidas reais desta bancada.',
        ],
        scene: { show: 'stewart', showcase: true, camera: 'iso' },
        sceneSummary: 'A bancada faz a coreografia da página inicial.',
      },
    ],
  },
  {
    id: 'direta',
    title: 'Cinemática direta',
    summary: 'Dos seis comprimentos à pose: por que é difícil e como o sistema resolve.',
    steps: [
      {
        id: 'problema',
        title: 'O problema da cinemática direta',
        body: [
          'Agora ao contrário. Entrada: os seis comprimentos $L_1, \\dots, L_6$ (os potenciômetros medem os cursos). Saída: a pose $(x, y, z, \\phi, \\theta, \\psi)$.',
          {
            table: {
              caption: 'Inversa e direta lado a lado',
              head: ['', 'Inversa', 'Direta'],
              rows: [
                ['Entrada', 'pose (6 números)', '6 comprimentos'],
                ['Saída', '6 comprimentos', 'pose'],
                ['Na Stewart', 'fácil, uma conta por perna', 'difícil, as seis juntas'],
              ],
            },
          },
          'Por que precisamos dela? Para saber **onde o tampo realmente está** a partir do que os sensores medem: é ela que desenha o modelo "real" na interface.',
        ],
        scene: { show: 'stewart', overlays: { legs: 'all' }, camera: 'iso' },
        sceneSummary: 'As seis pernas com os comprimentos medidos.',
      },
      {
        id: 'experimento',
        title: 'Experimento: e se...?',
        body: ['Antes de qualquer conta, um palpite. Escolha o que você acha que acontece e clique em **Testar**.'],
        widgets: ['fk-experiment'],
        scene: { show: 'stewart', overlays: { legs: 'all', plateFrame: true }, camera: 'iso' },
        sceneSummary: 'O tampo se move conforme os comprimentos mudam no experimento; os eixos do tampo mostram se ele gira.',
      },
      {
        id: 'restricoes',
        title: 'Por que não existe uma conta simples?',
        body: [
          'Cada comprimento medido impõe uma **restrição geométrica**: a junta do tampo $\\mathbf{P}_i$ tem de estar a uma distância $L_i$ de $\\mathbf{a}_i$, ou seja, **em cima de uma esfera** de raio $L_i$ centrada em $\\mathbf{a}_i$.',
          { eq: t`\lVert \mathbf{p} + R(\phi,\theta,\psi)\,\mathbf{b}_i - \mathbf{a}_i \rVert = L_i,\qquad i = 1,\dots,6`, label: 'norma de p mais R b i menos a i igual a L i, para i de 1 a 6' },
          'Escolha um atuador para ver a esfera dele. O problema: $\\mathbf{P}_i$ depende das **seis** incógnitas ao mesmo tempo (a posição e os três ângulos, dentro de senos e cossenos). Mexer em qualquer uma mexe em todas as esferas, por isso as seis equações ficam **acopladas** e não dá para isolar uma incógnita de cada vez.',
        ],
        widgets: ['fk-constraints'],
        scene: { show: 'stewart', overlays: { legs: 'one', sphere: true, base: true }, camera: 'iso' },
        sceneSummary: 'Uma esfera translúcida de raio Li em torno da junta aᵢ; a junta do tampo Pᵢ fica na superfície dela.',
        quiz: [{ q: 'Cada comprimento Lᵢ obriga a junta Pᵢ a ficar...', options: ['numa reta', 'na superfície de uma esfera em torno de aᵢ', 'no centro do tampo'], correct: 1, explain: 'Todos os pontos a uma distância Lᵢ de aᵢ formam uma esfera.' }],
      },
      {
        id: 'multiplas',
        title: 'Várias respostas e singularidades',
        body: [
          'O sistema pode ter **mais de uma solução**: a mesma leitura dos seis sensores pode corresponder a poses diferentes. Uma Stewart de geometria geral chega a **40 soluções** (Merlet e Gosselin, 2008), e soluções analíticas só existem para geometrias muito especiais.',
          'Há ainda as **singularidades**: regiões em que pequenas mudanças nos comprimentos provocam grandes movimentos do tampo (ou o contrário). Perto delas, o erro dos sensores é amplificado e a plataforma perde rigidez.',
          'Por isso, na prática, a direta vira um problema de **minimização**: achar a pose cujos comprimentos previstos mais se parecem com os medidos.',
          { eq: t`\min_{\mathbf{p},\,\phi,\,\theta,\,\psi}\ \sum_{i=1}^{6} \left( \lVert \mathbf{p} + R\,\mathbf{b}_i - \mathbf{a}_i \rVert - L_i \right)^2`, label: 'Mínimo da soma dos quadrados dos erros de comprimento' },
        ],
        scene: { show: 'stewart', overlays: { legs: 'all' }, camera: 'iso' },
        sceneSummary: 'A bancada com as seis pernas.',
        quiz: [{ q: 'Uma Stewart de geometria geral pode ter quantas soluções na direta?', options: ['1', '8', 'até 40'], correct: 2, explain: 'Merlet e Gosselin mostram até 40 soluções reais para a Stewart–Gough geral.' }],
      },
      {
        id: 'solver',
        title: 'Como o sistema resolve',
        body: [
          'O solver faz um ciclo: parte de um **chute** para a pose, calcula com a **inversa** os comprimentos que esse chute daria, compara com os medidos e **corrige** a pose na direção que mais diminui o erro. Repete até o erro sumir.',
          'Escolha o chute e rode passo a passo. Os fantasmas no modelo mostram cada iteração convergindo.',
          { note: 'O backend usa o least_squares do SciPy; aqui roda o Levenberg–Marquardt de lib/forwardKinematics.ts, com o mesmo objetivo. Em tempo real, o chute é a pose anterior (que já está muito perto), e bastam 2 ou 3 iterações a cada leitura dos sensores.' },
        ],
        widgets: ['fk-solver'],
        scene: { show: 'stewart', overlays: { ghosts: true, legs: 'all' }, camera: 'iso' },
        sceneSummary: 'Tampos fantasma mostram as iterações do solver até a pose encontrada.',
        quiz: [
          {
            q: 'Por que o chute "pose anterior" converge tão rápido?',
            options: ['porque a pose muda pouco entre duas leituras', 'porque ele ignora o erro', 'porque usa só uma perna'],
            correct: 0,
            explain: 'A 30 Hz o tampo quase não se move entre leituras: o chute já começa perto da resposta.',
          },
        ],
      },
    ],
  },
];

export const CURRICULUM: Module[] = [
  { id: 'plataforma', title: 'Conhecendo a Plataforma', lessons: moduloPlataforma },
  { id: 'cinematica', title: 'Cinemática', lessons: moduloCinematica },
];

export interface StepRef {
  module: number;
  lesson: number;
  step: number;
}

/** Todas as etapas em ordem (para Anterior/Próxima atravessar as aulas). */
export const FLAT: StepRef[] = CURRICULUM.flatMap((m, mi) => m.lessons.flatMap((l, li) => l.steps.map((_, si) => ({ module: mi, lesson: li, step: si }))));

export const stepKey = (r: StepRef) => {
  const m = CURRICULUM[r.module];
  const l = m.lessons[r.lesson];
  return `${m.id}/${l.id}/${l.steps[r.step].id}`;
};

/** Caminho da etapa na URL: /aula/<módulo>/<aula>/<n> (n a partir de 1). */
export const stepPath = (r: StepRef) => `/aula/${CURRICULUM[r.module].id}/${CURRICULUM[r.module].lessons[r.lesson].id}/${r.step + 1}`;

export function findStep(moduleId?: string, lessonId?: string, n?: string): StepRef {
  const mi = CURRICULUM.findIndex((m) => m.id === moduleId);
  if (mi < 0) return FLAT[0];
  const li = CURRICULUM[mi].lessons.findIndex((l) => l.id === lessonId);
  if (li < 0) return { module: mi, lesson: 0, step: 0 };
  const steps = CURRICULUM[mi].lessons[li].steps.length;
  const si = Math.max(0, Math.min(steps - 1, (Number(n) || 1) - 1));
  return { module: mi, lesson: li, step: si };
}

export const flatIndex = (r: StepRef) => FLAT.findIndex((f) => f.module === r.module && f.lesson === r.lesson && f.step === r.step);
