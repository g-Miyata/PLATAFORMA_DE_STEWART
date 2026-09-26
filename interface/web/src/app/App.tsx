import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
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
const FlightSimPage = lazy(() => import('@/pages/FlightSimPage'));
const RecorderPage = lazy(() => import('@/pages/RecorderPage'));
const BlocksPage = lazy(() => import('@/pages/BlocksPage'));
const PresentationPage = lazy(() => import('@/pages/PresentationPage'));
const GamePage = lazy(() => import('@/pages/GamePage'));
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
      { path: '/simulacao-voo', element: page(FlightSimPage) },
      { path: '/gravar', element: page(RecorderPage) },
      { path: '/blocos', element: page(BlocksPage) },
      { path: '/apresentacao', element: page(PresentationPage) },
      { path: '/jogo', element: page(GamePage) },
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
