import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { AppShell } from './AppShell';
import { Providers } from './providers';

// Páginas carregadas sob demanda: o bundle inicial não traz Chart.js/three de todas elas
const HomePage = lazy(() => import('@/pages/HomePage'));
const ActuatorsPage = lazy(() => import('@/pages/ActuatorsPage'));
const KinematicsPage = lazy(() => import('@/pages/KinematicsPage'));
const BenchPage = lazy(() => import('@/pages/BenchPage'));
const JoystickPage = lazy(() => import('@/pages/JoystickPage'));
const RoutinesPage = lazy(() => import('@/pages/RoutinesPage'));
const ImuPage = lazy(() => import('@/pages/ImuPage'));
const PidSettingsPage = lazy(() => import('@/pages/PidSettingsPage'));
const OrientationPage = lazy(() => import('@/pages/OrientationPage'));
const MotionCueingPage = lazy(() => import('@/pages/MotionCueingPage'));
const RecorderPage = lazy(() => import('@/pages/RecorderPage'));
const BlocksPage = lazy(() => import('@/pages/BlocksPage'));
const PresentationPage = lazy(() => import('@/pages/PresentationPage'));
const LessonPage = lazy(() => import('@/pages/LessonPage'));
const GamePage = lazy(() => import('@/pages/GamePage'));
const WorkspacePage = lazy(() => import('@/pages/WorkspacePage'));
const CalibrationPage = lazy(() => import('@/pages/CalibrationPage'));
const LimitsPage = lazy(() => import('@/pages/LimitsPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

function Loading() {
  return (
    <p role="status" className="text-sm text-muted">
      Carregando…
    </p>
  );
}

const page = (Component: React.ComponentType) => (
  <Suspense fallback={<Loading />}>
    <Component />
  </Suspense>
);

export const routes = [
  // tela de exposição: página inteira, sem cabeçalho nem menu
  { path: '/apresentacao', element: page(PresentationPage) },
  {
    element: <AppShell />,
    children: [
      { path: '/', element: page(HomePage) },
      { path: '/atuadores', element: page(ActuatorsPage) },
      { path: '/cinematica', element: page(KinematicsPage) },
      { path: '/bancada-3d', element: page(BenchPage) },
      { path: '/joystick', element: page(JoystickPage) },
      { path: '/rotinas', element: page(RoutinesPage) },
      { path: '/acelerometro', element: page(ImuPage) },
      { path: '/configuracoes', element: page(PidSettingsPage) },
      { path: '/simulador-voo', element: page(MotionCueingPage) },
      { path: '/orientacao-voo', element: page(OrientationPage) },
      // endereços antigos das duas telas
      { path: '/motion-cueing', element: <Navigate to="/simulador-voo" replace /> },
      { path: '/simulacao-voo', element: <Navigate to="/orientacao-voo" replace /> },
      { path: '/gravar', element: page(RecorderPage) },
      { path: '/blocos', element: page(BlocksPage) },
      { path: '/aula', element: page(LessonPage) },
      { path: '/aula/:module/:lesson/:step?', element: page(LessonPage) },
      { path: '/jogo', element: page(GamePage) },
      { path: '/espaco-de-trabalho', element: page(WorkspacePage) },
      { path: '/calibracao', element: page(CalibrationPage) },
      { path: '/limites', element: page(LimitsPage) },
      // o gêmeo digital passou a fazer parte da Calibração
      { path: '/gemeo-digital', element: <Navigate to="/calibracao" replace /> },
      { path: '*', element: page(NotFoundPage) },
    ],
  },
];

const router = createBrowserRouter(routes);

export function App() {
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  );
}
