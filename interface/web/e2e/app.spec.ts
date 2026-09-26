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
  ['/simulador-voo', 'Simulador de voo'],
  ['/orientacao-voo', 'Orientação do avião'],
  ['/gravar', 'Gravar e reproduzir'],
  ['/blocos', 'Programação em blocos'],
  ['/apresentacao', 'Apresentação da Plataforma de Stewart'],
  ['/aula', 'Aula de cinemática'],
  ['/jogo', 'Jogo da bolinha'],
  ['/espaco-de-trabalho', 'Espaço de trabalho'],
  ['/calibracao', 'Calibração'],
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
    await page.getByRole('link', { name: 'Cinemática', exact: true }).click();
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

test.describe('Apresentação', () => {
  test('o show troca de cena, arrastar passa o controle ao público e O abre o painel do operador', async ({ page }) => {
    await page.goto('/apresentacao?cena=voo');
    await expect(page.getByRole('heading', { name: 'Do simulador de voo para a bancada' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cinemática em tempo real' })).toBeVisible({ timeout: 15_000 });
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
    await expect.poll(async () => (await (await page.request.get('/motion/status')).json()).running, { timeout: 8_000 }).toBe(true);
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
    await expect.poll(async () => (await (await page.request.get('/cueing/status')).json()).replay?.id ?? null, { timeout: 8_000 }).not.toBeNull();
    // no voo o toque não assume o controle
    await page.mouse.move(700, 350);
    await page.mouse.down();
    await page.mouse.move(780, 320, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByRole('heading', { name: 'Você está no controle' })).toHaveCount(0);
    await page.keyboard.press('KeyO');
    const real = page.getByRole('switch', { name: 'Mover a plataforma de verdade' });
    await real.click();
    await expect.poll(async () => (await (await page.request.get('/cueing/status')).json()).mode, { timeout: 8_000 }).not.toBe('off');
    await page.keyboard.press('Escape');
    await expect(real).not.toBeChecked();
    await expect.poll(async () => (await (await page.request.get('/cueing/status')).json()).mode).toBe('off');
    // sair da página para o voo
    await page.goto('/');
    await expect.poll(async () => (await (await page.request.get('/cueing/status')).json()).replay).toBeNull();
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
    await expect(page.getByText('Acertou!')).toBeVisible({ timeout: 8_000 });
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
    await expect(page.getByText(/Convergiu em \d+ iterações para a pose real/)).toBeVisible({ timeout: 30_000 });
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
    await expect(page.getByText(/Pistão 1 subindo/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('listitem', { name: /Pistão 1, em teste/ })).toBeVisible();
    expect((await page.request.post('/apply_pose', { data: { z: 530 } })).status()).toBe(409);
    await expect(page.getByRole('heading', { name: /Relatório de/ })).toBeVisible({ timeout: 170_000 });
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
