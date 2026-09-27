import { defineConfig } from '@playwright/test';

// Testes de ponta a ponta contra o build servido pelo próprio FastAPI, com o
// dispositivo virtual (SIMULADOR): não precisa de hardware.
//   npm run build && npm run test:e2e
// PYTHON aponta para o Python do venv do backend (padrão: "python").
const PYTHON = process.env.PYTHON ?? 'python';
// PW_PORT permite rodar num backend separado do que está em uso (ex.: 8011)
const PORT = Number(process.env.PW_PORT ?? 8001);
// No CI (Linux sem GPU) o 3D roda por software e divide a máquina com o backend: mais
// tempo, uma nova tentativa, e o WebGL por software ligado (o Chromium o desliga por padrão).
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  timeout: CI ? 120_000 : 60_000,
  expect: { timeout: CI ? 15_000 : 5_000 },
  retries: CI ? 1 : 0,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Edge já vem no Windows; no CI (Linux) use PW_CHANNEL=chromium após `npx playwright install chromium`
    channel: process.env.PW_CHANNEL ?? 'msedge',
    locale: 'pt-BR',
    viewport: { width: 1440, height: 900 },
    ...(CI && {
      launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
      navigationTimeout: 45_000,
      actionTimeout: 30_000,
    }),
  },
  webServer: {
    command: `"${PYTHON}" -m uvicorn app:app --app-dir ../backend --host 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/info`,
    // calibração encurtada nos testes (ver STEWART_CALIBRATION_FAST em app.py)
    env: { STEWART_CALIBRATION_FAST: '1' },
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
