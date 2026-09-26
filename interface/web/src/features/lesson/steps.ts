// Conteúdo da aula de cinemática (8 etapas). Cada etapa diz o que desenhar no
// 3D, quais eixos o aluno pode mexer e traz perguntas rápidas.
import type { PoseAxis } from '@/features/recorder/trajectory';

export interface Question {
  q: string;
  options: string[];
  correct: number;
  explain: string;
}

export interface Overlays {
  base?: boolean;
  plate?: boolean;
  plateFrame?: boolean;
  translation?: boolean;
  legs?: 'all' | 'one';
  decomposition?: boolean;
}

export interface LessonStep {
  id: string;
  title: string;
  paragraphs: string[];
  /** eixos com slider nesta etapa */
  axes: PoseAxis[];
  /** limites mais largos para poder sair do curso (etapa de limites) */
  wide?: boolean;
  overlays: Overlays;
  /** mostra o botão de animar a ordem ZYX */
  animateZyx?: boolean;
  /** texto que descreve o 3D para quem não o vê */
  sceneSummary: string;
  quiz: Question[];
}

export const STEPS: LessonStep[] = [
  {
    id: 'gdl',
    title: '1. Seis graus de liberdade',
    paragraphs: [
      'A plataforma de Stewart move o tampo em seis graus de liberdade: três translações (X, Y e Z) e três rotações (roll em torno de X, pitch em torno de Y e yaw em torno de Z).',
      'Mexa cada controle e veja como os seis pistões trabalham juntos: nenhum movimento do tampo usa um pistão só.',
    ],
    axes: ['x', 'y', 'z', 'roll', 'pitch', 'yaw'],
    overlays: { plateFrame: true },
    sceneSummary: 'Modelo da bancada com os eixos X (vermelho), Y (verde) e Z (azul) desenhados no centro do tampo.',
    quiz: [
      { q: 'Quantos graus de liberdade o tampo tem?', options: ['3', '6', '12'], correct: 1, explain: 'Três translações e três rotações: seis no total, um para cada pistão.' },
      { q: 'O roll é uma rotação em torno de qual eixo?', options: ['X', 'Y', 'Z'], correct: 0, explain: 'Roll gira em torno de X, pitch em torno de Y e yaw em torno de Z.' },
    ],
  },
  {
    id: 'base',
    title: '2. As juntas da base (bᵢ)',
    paragraphs: [
      'Cada pistão está preso à base por uma junta universal (cardã). Os seis pontos bᵢ ficam em pares, sob os três blocos azuis.',
      'Eles são medidos no sistema da base: origem no centro, Z para cima. Como a base não se mexe, os bᵢ são constantes.',
    ],
    axes: ['x', 'y', 'z', 'roll', 'pitch', 'yaw'],
    overlays: { base: true },
    sceneSummary: 'Esferas rotuladas b1 a b6 marcam as seis juntas da base, em três pares.',
    quiz: [{ q: 'Os pontos bᵢ mudam quando o tampo se move?', options: ['Sim', 'Não'], correct: 1, explain: 'A base é fixa: os bᵢ são sempre os mesmos.' }],
  },
  {
    id: 'plate',
    title: '3. As juntas do tampo (pᵢ)',
    paragraphs: [
      'No tampo há outras seis juntas. Os pontos pᵢ são escritos no sistema do próprio tampo, com origem no centro dele.',
      'Nesse sistema local eles nunca mudam. O que muda é onde o tampo está e como está girado em relação à base.',
    ],
    axes: ['x', 'y', 'z', 'roll', 'pitch', 'yaw'],
    overlays: { plate: true, plateFrame: true },
    sceneSummary: 'Esferas rotuladas p1 a p6 nas juntas do tampo, com o sistema de eixos local no centro do tampo.',
    quiz: [{ q: 'Em qual sistema de coordenadas os pᵢ são constantes?', options: ['No da base', 'No do tampo'], correct: 1, explain: 'Os pᵢ são fixos no tampo; vistos da base, eles se movem junto com ele.' }],
  },
  {
    id: 'translation',
    title: '4. A translação T',
    paragraphs: [
      'T = (x, y, z) é o vetor que vai do centro da base até o centro do tampo.',
      'No home o tampo está nivelado e centrado: x = y = 0 e z é a altura de home. Mova X, Y e Z e acompanhe a seta T.',
    ],
    axes: ['x', 'y', 'z'],
    overlays: { translation: true, plateFrame: true },
    sceneSummary: 'Uma seta T sai do centro da base e termina no centro do tampo.',
    quiz: [{ q: 'No home, o vetor T vale…', options: ['(0, 0, 0)', '(0, 0, altura de home)', 'depende do yaw'], correct: 1, explain: 'No home o tampo está centrado, só elevado na altura de home.' }],
  },
  {
    id: 'rotation',
    title: '5. A rotação R',
    paragraphs: [
      'A orientação do tampo é a matriz R = Rz(yaw) · Ry(pitch) · Rx(roll): primeiro gira o yaw, depois o pitch e por fim o roll, cada um em torno do eixo já girado do tampo.',
      'Use "Animar ZYX" para ver as três rotações uma depois da outra. A ordem importa: trocá-la dá outra orientação.',
    ],
    axes: ['roll', 'pitch', 'yaw'],
    overlays: { plateFrame: true },
    animateZyx: true,
    sceneSummary: 'Os eixos do tampo giram conforme roll, pitch e yaw; a animação aplica yaw, depois pitch, depois roll.',
    quiz: [{ q: 'Trocar a ordem das rotações muda a orientação final?', options: ['Sim, em geral', 'Nunca'], correct: 0, explain: 'Rotações em 3D não comutam: Rz·Ry·Rx é diferente de Rx·Ry·Rz, exceto em casos especiais.' }],
  },
  {
    id: 'leg',
    title: '6. A perna: Lᵢ = T + R·pᵢ − bᵢ',
    paragraphs: [
      'Juntando tudo: a junta i do tampo, vista da base, está em Pᵢ = T + R·pᵢ. O vetor da perna vai da junta da base até ela: Lᵢ = T + R·pᵢ − bᵢ.',
      'O comprimento que o pistão precisa ter é ‖Lᵢ‖. Escolha uma perna e veja cada termo da soma desenhado.',
    ],
    axes: ['x', 'y', 'z', 'roll', 'pitch', 'yaw'],
    overlays: { base: true, legs: 'one', decomposition: true },
    sceneSummary: 'Setas desenham T (base até o centro do tampo), R·pᵢ (centro do tampo até a junta) e Lᵢ (junta da base até a do tampo).',
    quiz: [{ q: 'O que o controle manda para cada pistão?', options: ['O comprimento ‖Lᵢ‖', 'O ângulo da perna', 'A pose inteira'], correct: 0, explain: 'Cada pistão só controla o próprio comprimento; a pose sai da combinação dos seis.' }],
  },
  {
    id: 'limits',
    title: '7. Limites de curso',
    paragraphs: [
      'Cada pistão só vai de um comprimento mínimo a um máximo (o curso). Se qualquer um dos seis precisar sair dessa faixa, a pose é impossível.',
      'Aqui os controles vão além do normal: force uma pose e veja a perna ficar vermelha.',
    ],
    axes: ['x', 'y', 'z', 'roll', 'pitch', 'yaw'],
    wide: true,
    overlays: { legs: 'all' },
    sceneSummary: 'As seis pernas aparecem com o comprimento; ficam vermelhas quando saem do curso.',
    quiz: [{ q: 'Se só um pistão sair do curso, a pose…', options: ['é impossível', 'funciona com um erro pequeno'], correct: 0, explain: 'Basta uma perna fora do curso para a pose não ser alcançável: o backend recusa.' }],
  },
  {
    id: 'ik-fk',
    title: '8. Inversa × direta',
    paragraphs: [
      'O que você fez até aqui é a cinemática inversa: da pose para os seis comprimentos. Ela tem fórmula fechada e é rápida.',
      'O caminho contrário, dos seis comprimentos medidos para a pose, é a cinemática direta. Ela não tem fórmula fechada: o sistema resolve por iteração numérica (mínimos quadrados, Levenberg–Marquardt). É assim que a telemetria e a Bancada 3D estimam a pose real.',
    ],
    axes: ['x', 'y', 'z', 'roll', 'pitch', 'yaw'],
    overlays: { legs: 'all' },
    sceneSummary: 'As seis pernas com os comprimentos calculados pela cinemática inversa.',
    quiz: [{ q: 'Qual das duas é resolvida por iteração numérica?', options: ['A inversa', 'A direta'], correct: 1, explain: 'A direta: dados os comprimentos, o solver procura a pose que os explica.' }],
  },
];
