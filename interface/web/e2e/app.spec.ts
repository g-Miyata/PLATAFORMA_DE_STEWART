import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const ROUTES = [
  ['/', 'Plataforma de Stewart'],
  ['/atuadores', 'Atuadores e PID'],
  ['/cinematica', 'Cinemática'],
  ['/joystick', 'Joystick'],
  ['/rotinas', 'Rotinas de movimento'],
  ['/acelerometro', 'IMU (roll/pitch/yaw)'],
  ['/configuracoes', 'Ganhos PID'],
  ['/simulacao-voo', 'Simulação de voo'],
] as const;

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('stewart-theme', t);
    } catch {
      /* ignore */
    }
  }, theme);
}

async function serial(page: Page, action: 'open' | 'close') {
  await page.request.post(`/serial/${action}`, action === 'open' ? { data: { port: 'SIMULADOR' } } : {});
}

test.afterEach(async ({ page }) => {
  await page.request.post('/motion/stop');
  await serial(page, 'close');
});

for (const theme of ['light', 'dark'] as const) {
  test.describe(`acessibilidade (tema ${theme})`, () => {
    for (const [path, title] of ROUTES) {
      test(`${path} sem violações sérias`, async ({ page }) => {
        await setTheme(page, theme);
        await serial(page, 'open');
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
        await page.waitForTimeout(600); // telemetria e consultas iniciais
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        expect(
          serious.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`),
        ).toEqual([]);
      });
    }
  });
}

test('modo simulação: conectar, aplicar pose e parar com Esc', async ({ page }) => {
  await page.goto('/cinematica');
  const badge = page.getByRole('status').filter({ hasText: /Desconectado|Simulação/ }).first();
  await expect(badge).toContainText('Desconectado');

  await page.getByRole('combobox', { name: 'Porta serial' }).first().selectOption('SIMULADOR');
  await page.getByRole('button', { name: 'Conectar', exact: true }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Simulação' }).first()).toBeVisible();

  await page.getByRole('spinbutton', { name: 'Roll (em torno de X) (graus)' }).fill('6');
  await page.getByRole('button', { name: 'Aplicar no simulador' }).click();

  // o modelo virtual converge para a pose (atraso de 1ª ordem dos atuadores)
  await expect
    .poll(async () => (await (await page.request.get('/telemetry')).json()).Y?.length ?? 0, { timeout: 10_000 })
    .toBe(6);
  await page.getByRole('switch', { name: 'Aplicar automaticamente' }).click();
  await expect(page.getByRole('switch', { name: 'Aplicar automaticamente' })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('switch', { name: 'Aplicar automaticamente' })).not.toBeChecked();
});

test('hardware real pede confirmação', async ({ page }) => {
  await page.route('**/serial/ports', (route) =>
    route.fulfill({
      json: {
        ports: [
          { device: 'COM7', description: 'USB', display_name: 'ESP32-S3 (USB Nativo)', is_esp32: true, confidence: 95 },
          { device: 'SIMULADOR', description: 'virtual', display_name: 'Simulador', is_esp32: false, confidence: 0, simulated: true },
        ],
      },
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Conectar hardware' }).first().click();
  const dialog = page.getByRole('alertdialog', { name: 'Conectar ao hardware real?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
});

test('navegação por teclado: pular para o conteúdo', async ({ page }) => {
  await page.goto('/rotinas');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Pular para o conteúdo' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#conteudo$/);
});
