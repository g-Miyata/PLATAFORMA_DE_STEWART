import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const ROUTES = [
  ['/', 'Plataforma de Stewart'],
  ['/atuadores', 'Atuadores e PID'],
  ['/cinematica', 'Cinemática'],
  ['/bancada-3d', 'Bancada 3D'],
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

test.describe('Bancada 3D', () => {
  const lengthOf = async (page: Page) => (await page.getByRole('spinbutton', { name: 'Comprimento (milímetros)' }).inputValue()).replace(',', '.');

  test('pistão pelo teclado muda só ele; o ponto central gira a plataforma', async ({ page }) => {
    await page.goto('/bancada-3d');
    await expect(page.getByRole('heading', { level: 1, name: 'Bancada 3D' })).toBeVisible();

    await page.getByRole('button', { name: 'P2', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Pistão 2' })).toBeVisible();
    const before = Number(await lengthOf(page));
    await page.getByRole('application').focus();
    await page.keyboard.press('Shift+ArrowUp');
    await page.keyboard.press('Shift+ArrowUp');
    await expect.poll(async () => Number(await lengthOf(page))).toBeCloseTo(before + 20, 1);

    // tampo: R escolhe o roll e a seta gira 5°
    await page.keyboard.press('r');
    await expect(page.getByRole('heading', { name: 'Plataforma inteira' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Roll' })).toBeChecked();
    const roll = page.getByRole('spinbutton', { name: 'Roll (em torno de X) (graus)' });
    const r0 = Number((await roll.inputValue()).replace(',', '.'));
    await page.getByRole('application').focus();
    await page.keyboard.press('Shift+ArrowUp');
    await expect.poll(async () => Number((await roll.inputValue()).replace(',', '.'))).toBeCloseTo(r0 + 5, 1);

    // desfazer volta o roll
    await page.keyboard.press('Control+z');
    await expect.poll(async () => Number((await roll.inputValue()).replace(',', '.'))).toBeCloseTo(r0, 1);
  });

  test('aplicar no simulador: o modelo virtual segue o pistão editado', async ({ page }) => {
    await serial(page, 'open');
    await page.goto('/bancada-3d');
    await page.getByRole('button', { name: 'P4', exact: true }).click();
    await page.getByRole('application').focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowDown');
    const target = Number(await lengthOf(page)) - 500; // curso comandado do P4
    await page.getByRole('button', { name: 'Aplicar no simulador' }).click();
    await expect
      .poll(async () => ((await (await page.request.get('/telemetry')).json()).Y?.[3] ?? -1) as number, { timeout: 20_000 })
      .toBeGreaterThan(target - 2);
  });
});

test('Bancada 3D: tela cheia pelo botão e pela tecla F', async ({ page }) => {
  await page.goto('/bancada-3d');
  await page.getByRole('button', { name: 'Tela cheia' }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  // em tela cheia o botão Parar fica no próprio HUD
  await expect(page.getByRole('button', { name: /Parar/ }).first()).toBeVisible();
  await page.getByRole('application').focus();
  await page.keyboard.press('f');
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
});

test('início: a demonstração 3D pode ser pausada e retomada', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Plataforma de Stewart' })).toBeVisible();
  const pause = page.getByRole('button', { name: 'Pausar animação' });
  await pause.click();
  const resume = page.getByRole('button', { name: 'Retomar animação' });
  await expect(resume).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('img', { name: /Animação pausada/ })).toBeVisible();
  await resume.click();
  await expect(page.getByRole('button', { name: 'Pausar animação' })).toBeVisible();
});

test('início: reduzir movimento começa com a animação parada', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Retomar animação' })).toBeVisible();
  await ctx.close();
});
