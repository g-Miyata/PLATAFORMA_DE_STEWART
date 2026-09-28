import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// no CI (3D por software, máquina dividida com o backend) as esperas explícitas dobram
const T = (ms: number) => (process.env.CI ? ms * 2 : ms);

const ROUTES = [
  ['/', 'Plataforma de Stewart'],
  ['/atuadores', 'Atuadores e PID'],
  ['/cinematica', 'Cinemática'],
  ['/bancada-3d', 'Bancada 3D'],
  ['/joystick', 'Joystick'],
  ['/rotinas', 'Rotinas de movimento'],
  ['/acelerometro', 'IMU (roll/pitch/yaw)'],
  ['/configuracoes', 'Ganhos PID'],
  ['/simulador-voo', 'Simulador de voo'],
  ['/orientacao-voo', 'Orientação do avião'],
  ['/gravar', 'Gravar e reproduzir'],
  ['/blocos', 'Programação em blocos'],
  ['/apresentacao', 'Apresentação da Plataforma de Stewart'],
  ['/aula', 'Aula de cinemática'],
  ['/jogo', 'Jogo da bolinha'],
  ['/espaco-de-trabalho', 'Espaço de trabalho'],
  ['/calibracao', 'Calibração'],
  ['/limites', 'Limites da mecânica'],
  ['/laboratorio/calco', 'Laboratório: calço do cardã do tampo'],
  ['/celular', 'Controle pelo celular'],
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
  await page.request.post('/calibration/cancel');
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
    .poll(async () => (await (await page.request.get('/telemetry')).json()).Y?.length ?? 0, { timeout: T(10_000) })
    .toBe(6);
  await page.getByRole('switch', { name: 'Aplicar automaticamente' }).click();
  await expect(page.getByRole('switch', { name: 'Aplicar automaticamente' })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('switch', { name: 'Aplicar automaticamente' })).not.toBeChecked();
});

test('Esc para a rotina mesmo quando um componente da página segura a tecla', async ({ page }) => {
  await serial(page, 'open');
  await page.goto('/rotinas');
  await expect(page.getByRole('heading', { level: 1, name: 'Rotinas' })).toBeVisible();
  // um editor que trata o Esc e não o deixa passar (o Blockly faz isso com o foco nos blocos)
  await page.evaluate(() =>
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    }),
  );
  const start = await page.request.post('/motion/start', { data: { routine: 'sine_axis', axis: 'z', amp: 10, hz: 0.2, duration_s: 60 } });
  expect(start.ok()).toBe(true);
  await expect.poll(async () => (await (await page.request.get('/motion/status')).json()).running).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await (await page.request.get('/motion/status')).json()).running).toBe(false);
});

test('menu lateral: escondido, abre pelo botão ou pela borda e pode ser fixado', async ({ page }) => {
  await page.goto('/cinematica');
  const menu = page.locator('#menu-principal');
  const nav = page.getByRole('navigation', { name: 'Principal' });
  await expect(menu).toHaveAttribute('inert', '');
  // pelo botão: abre, e escolher uma página fecha
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await nav.getByRole('link', { name: 'Joystick' }).click();
  await expect(page).toHaveURL(/\/joystick$/);
  await expect(menu).toHaveAttribute('inert', '');
  // pela borda esquerda: abre com o mouse e fecha quando ele sai
  await page.mouse.move(1, 450);
  await expect(nav.getByRole('link', { name: 'Rotinas' })).toBeVisible();
  await page.mouse.move(900, 450);
  await expect(menu).toHaveAttribute('inert', '');
  // fixar: fica aberto ao lado do conteúdo, também depois de recarregar
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await nav.getByRole('button', { name: 'Fixar' }).click();
  await page.reload();
  await expect(nav.getByRole('link', { name: 'Rotinas' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir menu' })).toHaveCount(0);
  await nav.getByRole('button', { name: 'Soltar' }).click();
  await expect(menu).toHaveAttribute('inert', '');
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
      .poll(async () => ((await (await page.request.get('/telemetry')).json()).Y?.[3] ?? -1) as number, { timeout: T(20_000) })
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
    await page.getByRole('region', { name: 'Pose-chave 2' }).getByRole('spinbutton', { name: 'Z (altura) (milímetros)' }).fill('580');
    await expect(page.getByRole('list', { name: 'Lista de poses-chave' }).getByRole('listitem')).toHaveCount(2);
    await expect(page.getByText('Viável', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Reproduzir no simulador' }).click();
    await expect.poll(async () => (await (await page.request.get('/motion/status')).json()).routine, { timeout: T(5_000) }).toBe('trajectory');
    await expect(page.getByText('e2e ·')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await (await page.request.get('/motion/status')).json()).running).toBe(false);
  });

  test('ponto a ponto: posiciona a plataforma e grava os pontos na própria página', async ({ page }) => {
    await page.goto('/gravar');
    const create = page.getByRole('region', { name: '1. Criar' });
    const keys = page.getByRole('list', { name: 'Lista de poses-chave' }).getByRole('listitem');
    // o exemplo aberto não muda: o primeiro ponto começa uma rotina nova
    await create.getByRole('spinbutton', { name: 'Roll (em torno de X) (graus)' }).fill('5');
    await create.getByRole('button', { name: 'Gravar ponto 1' }).click();
    await expect(page.getByRole('heading', { level: 2, name: /^2\. Ajustar · Rotina / })).toBeVisible();
    await expect(keys).toHaveCount(1);
    await create.getByRole('spinbutton', { name: 'Roll (em torno de X) (graus)' }).fill('-5');
    await create.getByRole('spinbutton', { name: /^Tempo até este ponto/ }).fill('3');
    await create.getByRole('button', { name: 'Gravar ponto 2' }).click();
    await expect(keys).toHaveCount(2);
    await expect(keys.nth(1)).toContainText('3,0 s');
    await expect(keys.nth(1)).toContainText('roll -5,0°');
  });

  test('ao vivo: liga o controle, grava dirigindo e salva uma rotina nova', async ({ page }) => {
    await page.goto('/gravar');
    await page.getByRole('tab', { name: 'Ao vivo (controle)' }).click();
    const create = page.getByRole('region', { name: '1. Criar' });
    await create.getByRole('button', { name: 'Começar a gravar' }).click();
    await expect(create.getByRole('status').filter({ hasText: 'REC' })).toBeVisible();
    const stick = create.getByRole('application', { name: /Inclinar \(roll \/ pitch\)/ });
    const box = (await stick.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2, { steps: 6 });
    await page.waitForTimeout(700);
    await page.mouse.move(box.x + box.width / 2, box.y + 8, { steps: 6 });
    await page.waitForTimeout(700);
    await page.mouse.up();
    await create.getByRole('button', { name: 'Parar e salvar' }).click();
    await expect(page.getByText('Gravação salva')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /^2\. Ajustar · Gravação / })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Lista de poses-chave' }).getByRole('listitem').nth(1)).toBeVisible();
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
  await expect.poll(async () => (await (await page.request.get('/motion/status')).json()).routine, { timeout: T(5_000) }).toBe('trajectory');
  // com o foco nos blocos (o Blockly também usa o Esc), o Esc continua sendo a parada
  await page.locator('.blocklyBlockCanvas .blocklyText').first().click();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await (await page.request.get('/motion/status')).json()).running).toBe(false);
});

test.describe('Apresentação', () => {
  test('o show troca de cena, arrastar passa o controle ao público e O abre o painel do operador', async ({ page }) => {
    await page.goto('/apresentacao?cena=voo');
    await expect(page.getByRole('heading', { name: 'Do simulador de voo para a bancada' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Orientação do avião' })).toBeVisible({ timeout: T(15_000) });
    await page.mouse.move(700, 350);
    await page.mouse.down();
    await page.mouse.move(780, 320, { steps: 5 });
    await expect(page.getByRole('heading', { name: 'Você está no controle' })).toBeVisible();
    await page.mouse.up();
    await page.keyboard.press('KeyO');
    await expect(page.getByRole('complementary', { name: 'Painel do operador' })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} → ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
  });

  test('pelo painel do operador o quiosque move o simulador, e o Esc para tudo', async ({ page }) => {
    await serial(page, 'open');
    await page.goto('/apresentacao');
    await expect(page.getByRole('heading', { name: 'Plataforma de Stewart', exact: true })).toBeVisible();
    await page.keyboard.press('KeyO');
    const real = page.getByRole('switch', { name: 'Mover a plataforma de verdade' });
    await real.click();
    await expect(real).toBeChecked();
    await expect.poll(async () => (await (await page.request.get('/motion/status')).json()).running, { timeout: T(8_000) }).toBe(true);
    await page.keyboard.press('Escape');
    await expect(real).not.toBeChecked();
    await expect.poll(async () => (await (await page.request.get('/motion/status')).json()).running).toBe(false);
  });
});

test.describe('Apresentação: simulador de voo e tema', () => {
  test('toca o voo gravado pelo motion cueing, engata pelo painel e o Esc desengata', async ({ page }) => {
    await serial(page, 'open');
    await page.goto('/apresentacao?modo=voo');
    await expect(page.getByRole('heading', { name: 'Sinta o voo' })).toBeVisible();
    await expect.poll(async () => (await (await page.request.get('/cueing/status')).json()).replay?.id ?? null, { timeout: T(8_000) }).not.toBeNull();
    // no voo o toque não assume o controle
    await page.mouse.move(700, 350);
    await page.mouse.down();
    await page.mouse.move(780, 320, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByRole('heading', { name: 'Você está no controle' })).toHaveCount(0);
    await page.keyboard.press('KeyO');
    const real = page.getByRole('switch', { name: 'Mover a plataforma de verdade' });
    await real.click();
    await expect.poll(async () => (await (await page.request.get('/cueing/status')).json()).mode, { timeout: T(8_000) }).not.toBe('off');
    await page.keyboard.press('Escape');
    await expect(real).not.toBeChecked();
    await expect.poll(async () => (await (await page.request.get('/cueing/status')).json()).mode).toBe('off');
    // sair da página para o voo
    await page.goto('/');
    await expect.poll(async () => (await (await page.request.get('/cueing/status')).json()).replay).toBeNull();
  });

  test('orientação do avião: toca o voo no perfil attitude, engata e o Esc desengata', async ({ page }) => {
    await serial(page, 'open');
    await page.goto('/apresentacao?modo=orientacao');
    await expect(page.getByRole('heading', { name: 'O tampo copia o avião' })).toBeVisible();
    await expect.poll(async () => (await (await page.request.get('/cueing/status')).json()).replay?.profile ?? null, { timeout: T(8_000) }).toBe('attitude');
    await page.keyboard.press('KeyO');
    await expect(page.getByRole('radio', { name: /Orientação do avião/ })).toBeChecked();
    await page.getByRole('switch', { name: 'Mover a plataforma de verdade' }).click();
    await expect.poll(async () => (await (await page.request.get('/cueing/status')).json()).mode, { timeout: T(8_000) }).not.toBe('off');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await (await page.request.get('/cueing/status')).json()).mode).toBe('off');
  });

  test('o botão troca o tema da apresentação e continua acessível', async ({ page }) => {
    await setTheme(page, 'dark');
    await page.goto('/apresentacao');
    await page.getByRole('button', { name: 'Usar o tema claro' }).click();
    await expect(page.getByRole('button', { name: 'Usar o tema escuro' })).toBeVisible();
    await expect(page.locator('[data-theme="light"]').first()).toBeAttached();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} → ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
  });
});

test.describe('Celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('no PC mostra como conectar; o joystick na tela move o simulador e o PARAR para', async ({ page }) => {
    await serial(page, 'open');
    await page.goto('/celular');
    await expect(page.getByRole('heading', { level: 1, name: 'Controle pelo celular' })).toBeVisible();
    // sem o modo rede, o PC explica como ligar
    await expect(page.getByText('O celular ainda não enxerga este PC')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ligar o modo rede' })).toBeVisible();
    await page.getByRole('button', { name: 'Usar os controles aqui no PC mesmo' }).click();

    await page.getByRole('tab', { name: 'Joystick' }).click();
    await page.getByRole('button', { name: 'Iniciar joystick' }).click();
    const sent = page.waitForRequest((r) => r.url().endsWith('/apply_pose') && r.method() === 'POST');
    const stick = page.getByRole('application', { name: /Mover \(X \/ Y\)/ });
    const box = (await stick.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2, { steps: 5 });
    const body = (await sent).postDataJSON() as { x: number };
    await page.waitForTimeout(300);
    await page.mouse.up();
    expect(typeof body.x).toBe('number');
    await page.getByRole('button', { name: 'Parar', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Iniciar joystick' })).toBeVisible();
  });

  test('bancada por toque: escolher o pistão e segurar + muda o curso', async ({ page }) => {
    await page.goto('/celular');
    await page.getByRole('button', { name: 'Usar os controles aqui no PC mesmo' }).click();
    await page.getByRole('tab', { name: 'Bancada 3D' }).click();
    await page.getByRole('button', { name: 'P1', exact: true }).click();
    const label = page.getByText(/^Pistão 1: \d+ mm de curso$/);
    await expect(label).toBeVisible();
    const before = await label.textContent();
    await page.getByRole('button', { name: 'Aumentar' }).click();
    await page.getByRole('button', { name: 'Aumentar' }).click();
    await expect(label).not.toHaveText(before ?? '');
  });

  // o modo rede de verdade abre a porta na rede (e o Windows pergunta do firewall): aqui o backend é simulado
  const lanInfo = (devices: object[], waiting: object[] = []) => ({
    lan: true,
    mode: 'runtime',
    pin: '482913',
    https_port: 8443,
    urls: [{ ip: '192.168.0.10', https: 'https://192.168.0.10:8443/celular', http: null }],
    devices,
    waiting,
  });
  async function mockLan(page: import('@playwright/test').Page, info: object) {
    await page.route('**/lan/status', (r) => r.fulfill({ json: { lan: true, local: true, authorized: true, busy: false } }));
    await page.route('**/lan/info', (r) => r.fulfill({ json: info }));
  }

  test('modo rede no PC: QR code com o IP, PIN e quem está esperando', async ({ page }) => {
    await mockLan(page, lanInfo([], [{ ip: '192.168.0.55', agent: 'Mozilla/5.0 (iPhone)', seen_s: 1 }]));
    await page.goto('/celular');
    await expect(page.getByRole('img', { name: 'QR code para abrir https://192.168.0.10:8443/celular' })).toBeVisible();
    await expect(page.getByText('https://192.168.0.10:8443/celular', { exact: true })).toBeVisible();
    await expect(page.getByText('482913')).toBeVisible();
    await expect(page.getByText(/iPhone em 192\.168\.0\.55 abriu a página/)).toBeVisible();
  });

  test('com um celular já conectado, o PC pede para desconectar antes', async ({ page }) => {
    await mockLan(page, lanInfo([{ id: 'ab12', ip: '192.168.0.77', agent: 'Mozilla/5.0 (Linux; Android 14) Mobile', since_s: 125, seen_s: 2, active: true }]));
    let kicked = '';
    await page.route('**/lan/devices/*', (r) => {
      kicked = r.request().url();
      return r.fulfill({ json: lanInfo([]) });
    });
    await page.goto('/celular');
    await expect(page.getByText('Já tem um celular conectado')).toBeVisible();
    await expect(page.getByText(/Celular Android em 192\.168\.0\.77, conectado há 2 min/)).toBeVisible();
    await expect(page.getByRole('img', { name: /QR code/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Desconectar este celular' }).click();
    await expect.poll(() => kicked).toContain('/lan/devices/ab12');
  });

  test('segundo celular: avisa que outro está conectado e não deixa digitar o PIN', async ({ page }) => {
    await page.route('**/lan/status', (r) => r.fulfill({ json: { lan: true, local: false, authorized: false, busy: true } }));
    await page.goto('/celular');
    await expect(page.getByText('Outro celular está conectado')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Liberar' })).toBeDisabled();
  });

  test('backend antigo (sem /lan/status): no PC avisa para reiniciar em vez de mostrar os controles', async ({ page }) => {
    // o backend antigo devolve a página do app no lugar da rota que não conhece
    await page.route('**/lan/status', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html></html>' }));
    await page.goto('/celular');
    await expect(page.getByText('Não deu para ligar o celular agora')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Usar os controles aqui no PC mesmo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ativar o giroscópio' })).toHaveCount(0);
  });

  test('QR code com o PIN: o celular entra sozinho e o PIN some da barra de endereço', async ({ page }) => {
    let authorized = false;
    let sentPin = '';
    await page.route('**/lan/status', (r) => r.fulfill({ json: { lan: true, local: false, authorized, busy: false } }));
    await page.route('**/lan/auth', (r) => {
      sentPin = (r.request().postDataJSON() as { pin: string }).pin;
      authorized = true;
      return r.fulfill({ json: { ok: true } });
    });
    await page.goto('/celular#pin=123456');
    await expect.poll(() => sentPin).toBe('123456');
    await expect(page.getByRole('button', { name: 'Desconectar este celular' })).toBeVisible();
    expect(new URL(page.url()).hash).toBe('');
  });

  test('reabrir pelo QR já liberado e desconectar: pede o PIN de novo (não reconecta sozinho)', async ({ page }) => {
    let authorized = true;
    let auths = 0;
    await page.route('**/lan/status', (r) => r.fulfill({ json: { lan: true, local: false, authorized, busy: false } }));
    await page.route('**/lan/auth', (r) => {
      auths++;
      authorized = true;
      return r.fulfill({ json: { ok: true } });
    });
    await page.route('**/lan/logout', (r) => {
      authorized = false;
      return r.fulfill({ json: { ok: true } });
    });
    await page.goto('/celular#pin=123456');
    await page.getByRole('button', { name: 'Desconectar este celular' }).click();
    await expect(page.getByRole('heading', { name: 'Digite o PIN' })).toBeVisible();
    await page.waitForTimeout(1000);
    expect(auths).toBe(0);
  });

  test('bancada 3D: tela cheia com o PARAR à mão e volta', async ({ page }) => {
    await page.goto('/celular');
    await page.getByRole('button', { name: 'Usar os controles aqui no PC mesmo' }).click();
    await page.getByRole('tab', { name: 'Bancada 3D' }).click();
    await page.getByRole('button', { name: 'Bancada em tela cheia' }).click();
    const exit = page.getByRole('button', { name: 'Sair da tela cheia' });
    await expect(exit).toBeVisible();
    // o PARAR fica dentro da tela cheia (o cabeçalho some)
    await expect(page.getByRole('button', { name: /Parar/ }).last()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aumentar' })).toBeVisible();
    await exit.click();
    await expect(page.getByRole('button', { name: 'Bancada em tela cheia' })).toBeVisible();
  });

  test('resposta: o joystick mostra o modelo 3D e o curso dos pistões', async ({ page }) => {
    await page.goto('/celular');
    await page.getByRole('button', { name: 'Usar os controles aqui no PC mesmo' }).click();
    await page.getByRole('tab', { name: 'Joystick' }).click();
    await expect(page.getByRole('region', { name: 'Resposta da plataforma' })).toBeVisible();
    await expect(page.getByRole('img', { name: /Curso (medido )?dos pistões/ })).toBeVisible();
  });

  test('giroscópio pede para ativar o sensor', async ({ page }) => {
    await page.goto('/celular');
    await page.getByRole('button', { name: 'Usar os controles aqui no PC mesmo' }).click();
    await expect(page.getByRole('button', { name: 'Ativar o giroscópio' })).toBeVisible();
  });
});

test.describe('Apresentação com celular', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  const info = (devices: object[]) => ({
    lan: true,
    mode: 'runtime',
    pin: '482913',
    https_port: 8443,
    urls: [{ ip: '192.168.0.10', https: 'https://192.168.0.10:8443/celular', http: null }],
    devices,
    waiting: [],
  });

  test('modo rede: QR code na tela; com um celular conectado, foco na bancada e botão de desconectar', async ({ page }) => {
    let devices: object[] = [];
    let kicked = false;
    await page.route('**/lan/status', (r) => r.fulfill({ json: { lan: true, local: true, authorized: true, busy: false } }));
    await page.route('**/lan/info', (r) => r.fulfill({ json: info(devices) }));
    await page.route('**/lan/devices/*', (r) => {
      kicked = true;
      devices = [];
      return r.fulfill({ json: info([]) });
    });
    await page.goto('/apresentacao');
    await expect(page.getByRole('img', { name: 'QR code para controlar a plataforma pelo celular' })).toBeVisible();

    devices = [{ id: 'cc01', ip: '192.168.0.80', agent: 'Mozilla/5.0 (iPhone)', since_s: 3, seen_s: 1, active: true }];
    await expect(page.getByRole('heading', { name: 'Um visitante está no comando' })).toBeVisible({ timeout: T(8000) });
    await expect(page.getByRole('img', { name: /QR code para controlar/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Desconectar celular e voltar ao show' }).click();
    await expect.poll(() => kicked).toBe(true);
    await expect(page.getByRole('heading', { name: 'Um visitante está no comando' })).toHaveCount(0);
  });

  test('com a opção salva, a apresentação religa o modo rede sozinha', async ({ page }) => {
    let started = 0;
    await page.addInitScript(() => localStorage.setItem('stewart-exhibit-auto-lan', '1'));
    await page.route('**/lan/status', (r) => r.fulfill({ json: { lan: started > 0, local: true, authorized: true, busy: false } }));
    await page.route('**/lan/info', (r) => r.fulfill({ json: started ? info([]) : { lan: false, mode: null, pin: null, urls: [], https_port: 8443, devices: [], waiting: [] } }));
    await page.route('**/lan/start', (r) => {
      started++;
      return r.fulfill({ json: info([]) });
    });
    await page.goto('/apresentacao');
    await expect(page.getByRole('img', { name: 'QR code para controlar a plataforma pelo celular' })).toBeVisible({ timeout: T(10_000) });
    expect(started).toBe(1);
  });

  test('painel do operador liga o modo rede', async ({ page }) => {
    let started = false;
    await page.route('**/lan/status', (r) => r.fulfill({ json: { lan: started, local: true, authorized: true, busy: false } }));
    await page.route('**/lan/info', (r) => r.fulfill({ json: started ? info([]) : { lan: false, mode: null, pin: null, urls: [], https_port: 8443, devices: [], waiting: [] } }));
    await page.route('**/lan/start', (r) => {
      started = true;
      return r.fulfill({ json: info([]) });
    });
    await page.goto('/apresentacao');
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
    await page.keyboard.press('KeyO');
    await expect(page.getByRole('complementary', { name: 'Painel do operador' })).toBeVisible();
    await page.getByRole('button', { name: 'Ligar o modo rede' }).click();
    await expect.poll(() => started).toBe(true);
    await expect(page.getByRole('img', { name: 'QR code para controlar a plataforma pelo celular' })).toBeVisible();
  });
});

test.describe('Laboratório do calço', () => {
  test('compara hoje × calço, testa uma pose e baixa o STL (fora do menu)', async ({ page }) => {
    await page.goto('/laboratorio/calco');
    await expect(page.getByRole('heading', { level: 1, name: 'Laboratório: calço do cardã do tampo' })).toBeVisible();
    // não aparece no menu
    await expect(page.getByRole('navigation').getByRole('link', { name: /calço/i })).toHaveCount(0);
    const table = page.getByRole('region', { name: 'Comparação da montagem de hoje com o calço' });
    await expect(table.getByRole('columnheader', { name: 'Com calço de 12°' })).toBeVisible();
    await expect(table.getByText('cardã do tampo no limite')).toBeVisible();
    // demonstração lado a lado: o polar mostra as duas montagens e dá para trocar o movimento
    await expect(page.getByRole('img', { name: /Inclinação máxima por direção\. Hoje: de 12,\d a .* Com calço: de 19,\d/ })).toBeVisible();
    await page.getByRole('button', { name: 'Roll', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Roll', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Pausar a demonstração' }).click();
    await expect(page.getByRole('button', { name: 'Continuar a demonstração' })).toBeVisible();
    // modelo real: o encaixe de uma perna, com calço e hoje
    const real = page.getByRole('region', { name: 'No modelo real: o encaixe' });
    await expect(real.getByText(/P3: cardã do tampo \d+,\d°/)).toBeVisible();
    await real.getByRole('button', { name: 'Hoje', exact: true }).click();
    await expect(real.getByText('Hoje (sem calço)')).toBeVisible();
    await expect(real.getByText('pose aceita')).toBeVisible();
    // a pose de 16° de roll: recusada hoje, aceita com o calço
    await expect(page.getByText(/Hoje: recusada: cardã do tampo no limite · Com calço: aceita/)).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar calço (STL)' }).click();
    expect((await download).suggestedFilename()).toBe('calco-cardan-12graus-M8.stl');
  });
});

test.describe('Aula', () => {
  test('→ avança, a URL guarda a etapa e as perguntas dão retorno', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('stewart-lesson-v2'));
    await page.goto('/aula');
    await expect(page.getByRole('heading', { name: '1. Um robô de cadeia fechada' })).toBeVisible();
    await page.getByRole('radio', { name: '6', exact: true }).check();
    await page.getByRole('button', { name: 'Conferir' }).click();
    await expect(page.getByText('Isso!')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('heading', { name: '2. De onde ela veio' })).toBeVisible();
    await expect(page).toHaveURL(/\/aula\/plataforma\/o-que-e\/2$/);
    await page.reload();
    await expect(page.getByRole('heading', { name: '2. De onde ela veio' })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} → ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
  });

  test('direta: o experimento mostra a pose e o solver converge', async ({ page }) => {
    await page.goto('/aula/cinematica/direta/2');
    await page.getByRole('radio', { name: 'O tampo sobe, praticamente sem girar' }).check();
    await page.getByRole('button', { name: 'Testar' }).click();
    await expect(page.getByText('Acertou!')).toBeVisible({ timeout: T(8_000) });
    await expect(page.getByText('ΔZ')).toBeVisible();

    // restrições: a pose real (escondida por padrão) também é editável
    await page.goto('/aula/cinematica/direta/3');
    const real = page.locator('details', { hasText: 'Pose real da plataforma' });
    await real.getByText('Pose real da plataforma').click();
    const l1 = page.getByRole('list', { name: /Erro de cada perna/ }).getByRole('listitem').first();
    const before = await l1.textContent();
    await real.getByRole('spinbutton', { name: 'X (frente/trás) (milímetros)' }).fill('-25');
    await expect(l1).not.toHaveText(before ?? '');

    await page.goto('/aula/cinematica/direta/5');
    // a pose real é editável: o solver recomeça e converge para ela
    await page.getByRole('spinbutton', { name: 'X (frente/trás) (milímetros)' }).fill('-22');
    await page.getByRole('spinbutton', { name: 'Yaw (em torno de Z) (graus)' }).fill('-8');
    await page.getByRole('button', { name: 'Rodar' }).click();
    await expect(page.getByText(/Convergiu em \d+ iterações para a pose real/)).toBeVisible({ timeout: T(30_000) });
    await expect(page.getByRole('cell', { name: '< 0,01 mm' }).first()).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} → ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
  });

  test('seriais: o braço 2R mostra as duas soluções e o UR5e as da inversa', async ({ page }) => {
    await page.goto('/aula/cinematica/seriais-paralelos/3');
    await expect(page.getByText('Cotovelo para cima', { exact: true })).toBeVisible();
    await expect(page.getByText(/^\d soluções para o mesmo alvo$/)).toBeVisible();
    const arm = page.getByRole('application', { name: /Braço de duas juntas/ });
    await arm.focus();
    for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText('Fora do alcance: nenhuma solução.')).toBeVisible();
    // as setas no braço não trocam de etapa
    await expect(page.getByRole('heading', { name: '3. Inversa no serial: o problema difícil' })).toBeVisible();
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
  await expect(volume).toBeVisible({ timeout: T(20_000) });
  const litros = async () => Number((await volume.textContent())!.replace(' L', '').replace(',', '.'));
  const flat = await litros();
  await page.getByRole('spinbutton', { name: 'Roll (em torno de X) (graus)' }).fill('8');
  await expect.poll(litros, { timeout: T(10_000) }).toBeLessThan(flat);
  await page.getByRole('spinbutton', { name: 'X (frente/trás) (milímetros)' }).fill('25');
  await page.getByRole('button', { name: 'Abrir na Cinemática' }).click();
  await expect(page).toHaveURL(/\/cinematica\?x=25/);
  await expect(page.getByRole('spinbutton', { name: 'Roll (em torno de X) (graus)' })).toHaveValue('8');
});

test.describe('Calibração', () => {
  test('roda autoteste + recalibração no simulador, bloqueia o resto e mostra o relatório', async ({ page }) => {
    test.setTimeout(200_000);
    await serial(page, 'open');
    page.on('dialog', (d) => d.accept());
    await page.goto('/calibracao');
    await page.getByRole('button', { name: 'Iniciar calibração (simulador)' }).click();
    await expect(page.getByRole('progressbar', { name: 'Progresso da calibração' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Calibrando' })).toBeVisible();
    // mostra o que está sendo testado agora e o curso de cada pistão
    await expect(page.getByRole('region', { name: 'Agora', exact: true })).toBeVisible();
    await expect(page.getByText(/Pistão 1 subindo/)).toBeVisible({ timeout: T(30_000) });
    await expect(page.getByRole('listitem', { name: /Pistão 1, em teste/ })).toBeVisible();
    expect((await page.request.post('/apply_pose', { data: { z: 530 } })).status()).toBe(409);
    await expect(page.getByRole('heading', { name: /Relatório de/ })).toBeVisible({ timeout: T(170_000) });
    await expect(page.getByRole('row', { name: /^P6/ }).first()).toBeVisible();
    await expect(page.getByText('Nada a mudar')).toBeVisible();
    await page.getByRole('tab', { name: 'Relatórios' }).click();
    await expect(page.getByRole('button', { name: /Simulador/ }).first()).toBeVisible();
  });

  test('cancelar volta ao home e avisa', async ({ page }) => {
    await serial(page, 'open');
    page.on('dialog', (d) => d.accept());
    await page.goto('/calibracao');
    await page.getByRole('button', { name: /Iniciar calibração|Calibrar de novo/ }).click();
    await page.getByRole('button', { name: 'Cancelar e voltar ao home' }).click();
    await expect(page.getByText('A última calibração foi interrompida.')).toBeVisible();
  });

  test('comparar ensaio: importa o CSV das Rotinas e simula', async ({ page }) => {
    await page.goto('/calibracao');
    await page.getByRole('tab', { name: 'Comparar ensaio (CSV)' }).click();
    const cols = ['t_s', 'rotina', 'x_cmd', 'y_cmd', 'z_cmd', 'roll_cmd', 'pitch_cmd', 'yaw_cmd', ...[1, 2, 3, 4, 5, 6].map((p) => `L${p}_cmd_mm`), ...[1, 2, 3, 4, 5, 6].map((p) => `L${p}_real_mm`)];
    const rows = Array.from({ length: 120 }, (_, i) => {
      const t = i * 0.05;
      const cmd = 560 + 10 * Math.sin(t);
      return [t, 'sine_axis', 0, 0, 530, 0, 0, 0, ...Array(6).fill(cmd), ...Array(6).fill(cmd - 1)].map((v) => String(v).replace('.', ',')).join(';');
    });
    const csv = ['sep=;', cols.join(';'), ...rows].join(String.fromCharCode(13, 10));
    await page.getByLabel('Importar CSV de ensaio').setInputFiles({ name: 'ensaio.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.getByText(/ensaio\.csv: 120 amostras/)).toBeVisible();
  });
});
