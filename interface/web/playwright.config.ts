import { defineConfig } from '@playwright/test';

// Testes de ponta a ponta contra o build servido pelo próprio FastAPI, com o
// dispositivo virtual (SIMULADOR): não precisa de hardware.
//   npm run build && npm run test:e2e
// PYTHON aponta para o Python do venv do backend (padrão: "python").
const PYTHON = process.env.PYTHON ?? 'python';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8001',
    // Edge já vem no Windows; no CI (Linux) use PW_CHANNEL=chromium após `npx playwright install chromium`
    channel: process.env.PW_CHANNEL ?? 'msedge',
    locale: 'pt-BR',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: `"${PYTHON}" -m uvicorn app:app --app-dir ../backend --host 127.0.0.1 --port 8001`,
    url: 'http://127.0.0.1:8001/api/info',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
