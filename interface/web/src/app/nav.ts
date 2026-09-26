import { Box, Compass, Gamepad2, Gauge, Home, Move3d, Plane, Repeat, SlidersHorizontal, type LucideIcon } from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  description: string;
  Icon: LucideIcon;
}

export const NAV: NavItem[] = [
  { path: '/', label: 'Início', description: 'Visão geral e primeiros passos', Icon: Home },
  { path: '/atuadores', label: 'Atuadores e PID', description: 'Telemetria, setpoints e comando manual de cada pistão', Icon: Gauge },
  { path: '/bancada-3d', label: 'Bancada 3D', description: 'Modelo detalhado: clique num pistão ou no tampo e arraste para mover', Icon: Box },
  { path: '/cinematica', label: 'Cinemática', description: 'Monte uma pose (X, Y, Z, roll, pitch, yaw), valide e aplique', Icon: Move3d },
  { path: '/joystick', label: 'Joystick', description: 'Controle em tempo real por gamepad Xbox/PlayStation', Icon: Gamepad2 },
  { path: '/rotinas', label: 'Rotinas', description: 'Movimentos automáticos (senoide, círculo, hélice, onda)', Icon: Repeat },
  { path: '/acelerometro', label: 'IMU (roll/pitch/yaw)', description: 'Plataforma segue a orientação do sensor MPU-6050/BNO085', Icon: Compass },
  { path: '/configuracoes', label: 'Ganhos PID', description: 'Kp, Ki, Kd, zona morta e PWM mínimo', Icon: SlidersHorizontal },
  { path: '/simulacao-voo', label: 'Simulação de voo', description: 'Integração com o FlightGear', Icon: Plane },
];
