import { defineConfig } from '@playwright/test';

// Testes de ponta a ponta contra o build servido pelo próprio FastAPI, com o
// dispositivo virtual (SIMULADOR): não precisa de hardware.
//   npm run build && npm run test:e2e
// PYTHON aponta para o Python do venv do backend (padrão: "python").
const PYTHON = process.env.PYTHON ?? 'python';
// PW_PORT permite rodar num backend separado do que está em uso (ex.: 8011)
const PORT = Number(process.env.PW_PORT ?? 8001);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Edge já vem no Windows; no CI (Linux) use PW_CHANNEL=chromium após `npx playwright install chromium`
    channel: process.env.PW_CHANNEL ?? 'msedge',
    locale: 'pt-BR',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: `"${PYTHON}" -m uvicorn app:app --app-dir ../backend --host 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/info`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
