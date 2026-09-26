import { Box, Clapperboard, Compass, Presentation, Puzzle, Gamepad2, Gauge, Home, Move3d, Plane, Repeat, SlidersHorizontal, type LucideIcon } from 'lucide-react';

export type NavGroup = 'inicio' | 'controlar' | 'criar' | 'mostrar' | 'analisar';

export const NAV_GROUPS: { id: NavGroup; label: string | null }[] = [
  { id: 'inicio', label: null },
  { id: 'controlar', label: 'Controlar' },
  { id: 'criar', label: 'Criar' },
  { id: 'mostrar', label: 'Aprender e mostrar' },
  { id: 'analisar', label: 'Analisar' },
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
  { path: '/configuracoes', label: 'Ganhos PID', description: 'Kp, Ki, Kd, zona morta e PWM mínimo', Icon: SlidersHorizontal, group: 'controlar' },
  { path: '/simulacao-voo', label: 'Simulação de voo', description: 'Integração com o FlightGear', Icon: Plane, group: 'controlar' },
  { path: '/gravar', label: 'Gravar e reproduzir', description: 'Grave movimentos, edite poses-chave numa linha do tempo e reproduza', Icon: Clapperboard, group: 'criar' },
  { path: '/blocos', label: 'Programação em blocos', description: 'Monte sequências encaixando blocos, como no Scratch', Icon: Puzzle, group: 'criar' },
  { path: '/apresentacao', label: 'Apresentação e aula', description: 'Demonstração em tela cheia e aula guiada de cinemática com vetores no 3D', Icon: Presentation, group: 'mostrar' },
];
