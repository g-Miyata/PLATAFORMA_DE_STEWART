import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const BACKEND = 'http://127.0.0.1:8001';

// Rotas da API FastAPI (servidas na raiz). Em dev o Vite repassa para o backend;
// em produção o próprio FastAPI serve o build, então tudo é same-origin.
// Regex ancorada: "/config" não pode capturar a rota da SPA "/configuracoes",
// nem "/joystick/pose" a página "/joystick". "/antigo" é o frontend legado servido pelo FastAPI.
const API_ROUTES =
  '^/(serial|pid|motion|calculate|apply_pose|mpu|joystick/pose|flight-simulation|telemetry|emergency-stop|api|docs|openapi[.]json|config|antigo|twin|calibration)(/|[?]|$)';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      [API_ROUTES]: BACKEND,
      '/ws': { target: BACKEND, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
