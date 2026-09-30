import { Axis3d, Box, ShieldCheck, Smartphone, CircleDot, Clapperboard, Compass, GraduationCap, Orbit, Stethoscope, Presentation, Puzzle, Gamepad2, Gauge, Home, Move3d, Plane, Repeat, SlidersHorizontal, type LucideIcon } from 'lucide-react';

export type NavGroup = 'inicio' | 'controlar' | 'criar' | 'mostrar' | 'ajustes';

export const NAV_GROUPS: { id: NavGroup; label: string | null }[] = [
  { id: 'inicio', label: null },
  { id: 'controlar', label: 'Controlar' },
  { id: 'criar', label: 'Criar' },
  { id: 'mostrar', label: 'Aprender e mostrar' },
  { id: 'ajustes', label: 'Ajustes' },
];

export interface NavItem {
  path: string;
  label: string;
  description: string;
  Icon: LucideIcon;
  group: NavGroup;
}

export const NAV: NavItem[] = [
  { path: '/', label: 'Início', description: 'Visão geral e primeiros passos', Icon: Home, group: 'inicio' },
  { path: '/atuadores', label: 'Atuadores e PID', description: 'Telemetria, setpoints e comando manual de cada pistão', Icon: Gauge, group: 'controlar' },
  { path: '/bancada-3d', label: 'Bancada 3D', description: 'Modelo detalhado: clique num pistão ou no tampo e arraste para mover', Icon: Box, group: 'controlar' },
  { path: '/cinematica', label: 'Cinemática', description: 'Monte uma pose (X, Y, Z, roll, pitch, yaw), valide e aplique', Icon: Move3d, group: 'controlar' },
  { path: '/joystick', label: 'Joystick', description: 'Controle em tempo real por gamepad Xbox/PlayStation', Icon: Gamepad2, group: 'controlar' },
  { path: '/rotinas', label: 'Rotinas', description: 'Movimentos automáticos (senoide, círculo, hélice, onda)', Icon: Repeat, group: 'controlar' },
  { path: '/acelerometro', label: 'IMU (roll/pitch/yaw)', description: 'Plataforma segue a orientação do sensor MPU-6050/BNO085', Icon: Compass, group: 'controlar' },
  { path: '/simulador-voo', label: 'Simulador de voo', description: 'Sinta o voo do FlightGear na plataforma (motion cueing), com o avião voando na tela ao lado', Icon: Plane, group: 'controlar' },
  { path: '/orientacao-voo', label: 'Orientação do avião', description: 'A plataforma copia a inclinação (roll/pitch) do avião no FlightGear', Icon: Axis3d, group: 'controlar' },
  { path: '/celular', label: 'Celular', description: 'Controle pelo celular na rede local: giroscópio, joystick na tela e Bancada 3D por toque', Icon: Smartphone, group: 'controlar' },
  { path: '/gravar', label: 'Gravar e reproduzir', description: 'Grave movimentos, edite poses-chave numa linha do tempo e reproduza', Icon: Clapperboard, group: 'criar' },
  { path: '/blocos', label: 'Programação em blocos', description: 'Monte sequências encaixando blocos, como no Scratch', Icon: Puzzle, group: 'criar' },
  { path: '/aula', label: 'Aula de cinemática', description: 'Curso guiado: a plataforma, robôs seriais × paralelos, cinemática inversa e direta', Icon: GraduationCap, group: 'mostrar' },
  { path: '/apresentacao', label: 'Apresentação', description: 'Tela cheia para feiras e exposições: show automático e o público controla', Icon: Presentation, group: 'mostrar' },
  { path: '/jogo', label: 'Jogo da bolinha', description: 'Incline o tampo e leve a bolinha ao alvo, desviando dos buracos', Icon: CircleDot, group: 'mostrar' },
  { path: '/espaco-de-trabalho', label: 'Espaço de trabalho', description: 'Volume que o tampo alcança e inclinação máxima em cada direção', Icon: Orbit, group: 'mostrar' },
  { path: '/configuracoes', label: 'Ganhos PID', description: 'Kp, Ki, Kd, zona morta e PWM mínimo', Icon: SlidersHorizontal, group: 'ajustes' },
  { path: '/limites', label: 'Limites da mecânica', description: 'Curso, ângulo dos cardãs e folga entre pernas: o máximo da bancada e a margem de operação', Icon: ShieldCheck, group: 'ajustes' },
  { path: '/calibracao', label: 'Calibração', description: 'Autoteste dos pistões e recalibração do simulador (gêmeo digital), com relatório', Icon: Stethoscope, group: 'ajustes' },
];
