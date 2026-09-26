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
  ['/gravar', 'Gravar e reproduzir'],
  ['/blocos', 'Programação em blocos'],
  ['/apresentacao', 'Apresentação'],
  ['/jogo', 'Jogo da bolinha'],
  ['/espaco-de-trabalho', 'Espaço de trabalho'],
  ['/gemeo-digital', 'Gêmeo digital'],
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

test.describe('Gravar e reproduzir', () => {
  test('monta poses-chave, confere a viabilidade e reproduz no simulador', async ({ page }) => {
    await serial(page, 'open');
    await page.goto('/gravar');
    await page.getByRole('button', { name: 'Nova', exact: true }).click();
    await page.getByRole('textbox', { name: 'Nome' }).fill('e2e');
    // 2ª pose-chave: 3 s depois, 10 mm mais alta
    await page.getByRole('button', { name: 'No instante' }).click();
    await page.getByRole('spinbutton', { name: 'Z (altura) (milímetros)' }).fill('540');
    await expect(page.getByRole('list', { name: 'Lista de poses-chave' }).getByRole('listitem')).toHaveCount(2);
    await expect(page.getByText('Viável', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Reproduzir no simulador' }).click();
    await expect.poll(async () => (await (await page.request.get('/motion/status')).json()).routine, { timeout: 5_000 }).toBe('trajectory');
    await expect(page.getByText('e2e ·')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await (await page.request.get('/motion/status')).json()).running).toBe(false);
  });

  test('grava comandos de outra página com o indicador REC', async ({ page }) => {
    await serial(page, 'open');
    await page.goto('/gravar');
    await page.getByRole('button', { name: 'Começar a gravar' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'REC' })).toBeVisible();
    await page.getByRole('link', { name: 'Cinemática' }).click();
    await page.getByRole('spinbutton', { name: 'Roll (em torno de X) (graus)' }).fill('3');
    await page.getByRole('button', { name: 'Aplicar no simulador' }).click();
    await page.waitForTimeout(600);
    await page.getByRole('spinbutton', { name: 'Roll (em torno de X) (graus)' }).fill('-3');
    await page.getByRole('button', { name: 'Aplicar no simulador' }).click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Parar', exact: true }).click();
    await expect(page.getByText('Gravação salva')).toBeVisible();
    await page.getByRole('link', { name: 'Gravar e reproduzir' }).click();
    await expect(page.getByRole('list', { name: 'Lista de poses-chave' }).getByRole('listitem').first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /Gravação / })).toBeVisible();
  });
});

test('programação em blocos: abre um exemplo, mostra os passos e reproduz no simulador', async ({ page }) => {
  await serial(page, 'open');
  page.on('dialog', (d) => d.accept());
  await page.goto('/blocos');
  await page.getByRole('combobox', { name: 'Exemplos' }).selectOption('quadrado');
  const steps = page.getByRole('list', { name: 'Passos do programa' });
  await expect(steps).toContainText('Mover para X 20 · Y -20');
  await expect(steps).toContainText('Repetir 2 vezes:');
  await expect(page.getByText('Viável', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Reproduzir no simulador' }).click();
  await expect.poll(async () => (await (await page.request.get('/motion/status')).json()).routine, { timeout: 5_000 }).toBe('trajectory');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await (await page.request.get('/motion/status')).json()).running).toBe(false);
});

test.describe('Apresentação e aula', () => {
  test('quiosque move o simulador de verdade e o Esc para tudo', async ({ page }) => {
    await serial(page, 'open');
    await page.goto('/apresentacao');
    const real = page.getByRole('switch', { name: 'Mover a plataforma de verdade' });
    await real.click();
    await expect(real).toBeChecked();
    await expect.poll(async () => (await (await page.request.get('/motion/status')).json()).running, { timeout: 8_000 }).toBe(true);
    await page.keyboard.press('Escape');
    await expect(real).not.toBeChecked();
    await expect.poll(async () => (await (await page.request.get('/motion/status')).json()).running).toBe(false);
  });

  test('aula: → avança de etapa e as perguntas dão retorno', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('stewart-lesson'));
    await page.goto('/apresentacao');
    await page.getByRole('tab', { name: 'Aula' }).click();
    await expect(page.getByRole('heading', { name: '1. Seis graus de liberdade' })).toBeVisible();
    await page.getByRole('radio', { name: '6', exact: true }).check();
    await page.getByRole('button', { name: 'Conferir' }).first().click();
    await expect(page.getByText('Isso!').first()).toBeVisible();
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('heading', { name: '2. As juntas da base (bᵢ)' })).toBeVisible();
    await page.getByRole('button', { name: /^6\./ }).click();
    await expect(page.getByText(/‖L1‖ = \d/)).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} → ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
  });
});

test('jogo da bolinha: setas começam, espaço pausa e o espelhamento desliga no Esc', async ({ page }) => {
  await serial(page, 'open');
  await page.goto('/jogo');
  const status = page.getByRole('status').filter({ hasText: /Incline|Valendo|Pausado|Chegou|Caiu/ });
  await expect(status).toHaveText('Incline para começar');
  await page.keyboard.down('ArrowRight');
  await expect(status).toHaveText('Valendo!');
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Space');
  await expect(status).toHaveText('Pausado');
  await page.keyboard.press('Space');
  await expect(status).toHaveText('Valendo!');

  const mirror = page.getByRole('switch', { name: 'Espelhar na plataforma' });
  await mirror.click();
  await expect(mirror).toBeChecked();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await expect(mirror).not.toBeChecked();
});

test('espaço de trabalho: inclinar encolhe o volume e a pose vai para a Cinemática', async ({ page }) => {
  await page.goto('/espaco-de-trabalho');
  const volume = page.getByText(/^\d+,\d+ L$/);
  await expect(volume).toBeVisible({ timeout: 10_000 });
  const litros = async () => Number((await volume.textContent())!.replace(' L', '').replace(',', '.'));
  const flat = await litros();
  await page.getByRole('spinbutton', { name: 'Roll (em torno de X) (graus)' }).fill('8');
  await expect.poll(litros, { timeout: 10_000 }).toBeLessThan(flat);
  await page.getByRole('spinbutton', { name: 'X (frente/trás) (milímetros)' }).fill('25');
  await page.getByRole('button', { name: 'Abrir na Cinemática' }).click();
  await expect(page).toHaveURL(/\/cinematica\?x=25/);
  await expect(page.getByRole('spinbutton', { name: 'Roll (em torno de X) (graus)' })).toHaveValue('8');
});

test.describe('Gêmeo digital', () => {
  test('ao vivo: recebe o simulador sombra e compara', async ({ page }) => {
    await serial(page, 'open');
    await page.goto('/gemeo-digital');
    await expect(page.getByText('Recebendo')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('row', { name: /P1 .* mm/ })).toBeVisible();
  });

  test('ensaio: importa o CSV das Rotinas e simula', async ({ page }) => {
    await page.goto('/gemeo-digital');
    await page.getByRole('tab', { name: 'Ensaio (CSV)' }).click();
    const cols = ['t_s', 'rotina', 'x_cmd', 'y_cmd', 'z_cmd', 'roll_cmd', 'pitch_cmd', 'yaw_cmd', ...[1, 2, 3, 4, 5, 6].map((p) => `L${p}_cmd_mm`), ...[1, 2, 3, 4, 5, 6].map((p) => `L${p}_real_mm`)];
    const rows = Array.from({ length: 120 }, (_, i) => {
      const t = i * 0.05;
      const cmd = 560 + 10 * Math.sin(t);
      return [t, 'sine_axis', 0, 0, 530, 0, 0, 0, ...Array(6).fill(cmd), ...Array(6).fill(cmd - 1)].map((v) => String(v).replace('.', ',')).join(';');
    });
    const csv = ['sep=;', cols.join(';'), ...rows].join('\r\n');
    await page.getByLabel('Importar CSV de ensaio').setInputFiles({ name: 'ensaio.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.getByText(/ensaio\.csv: 120 amostras/)).toBeVisible();
    await expect(page.getByRole('row', { name: /P1 .* mm/ })).toBeVisible();
  });
});
