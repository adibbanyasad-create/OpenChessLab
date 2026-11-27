import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { BenchmarkResult, Job } from '../../src/shared/types';
import { verifyBundle, type ExperimentBundle } from '../../src/shared/bundles';
import { SUITE_V1 } from '../../src/shared/suites';

async function pauseAnalysis(page: Page) {
  await page.getByRole('checkbox', { name: 'Live analysis' }).uncheck();
}

async function freshBoard(page: Page) {
  await page.getByRole('button', { name: 'New analysis', exact: true }).click();
  await page.getByRole('button', { name: /Starting position/ }).click();
}

async function importPgn(page: Page, pgn: string) {
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await page.getByLabel('Paste your game notation').fill(pgn);
  await page.getByRole('button', { name: 'Open in workspace' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Think one move further.' })).toBeVisible();
});

test('toggles synthesized sounds without page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await pauseAnalysis(page);
  const toggle = page.getByRole('button', { name: /sounds/ });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toHaveAccessibleName('Enable sounds');
  expect(await page.evaluate(() => localStorage.getItem('ocl-sound-v1'))).toBe('off');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('loads a real UCI evaluation and configurable principal variations', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const depth = page.getByLabel('Search depth', { exact: true });
  await depth.focus();
  await depth.press('Home');
  for (let i = 0; i < 7; i++) await depth.press('ArrowRight');
  await expect(page.getByTestId('engine-score')).not.toHaveText('\u2014');
  await expect(page.locator('.variation')).toHaveCount(3);
  await expect(page.locator('.status-label')).toHaveText('Complete');
  await expect(page.locator('.error-message')).toHaveCount(0);
  const visibleMove = await page.locator('.notation-scroll').evaluate((parent) => {
    const active = parent.querySelector('[aria-current="step"]')!;
    return (
      active.getBoundingClientRect().top >= parent.getBoundingClientRect().top &&
      active.getBoundingClientRect().bottom <= parent.getBoundingClientRect().bottom
    );
  });
  expect(visibleMove).toBe(true);
  await page.screenshot({
    path: `artifacts/analysis-${info.project.name}.jpg`,
    fullPage: true,
    quality: 85,
    scale: 'css',
  });
  await page.getByText('Advanced settings', { exact: true }).click();
  await page.getByLabel('Analysis threads').selectOption('2');
  await page.getByLabel('Analysis hash').selectOption('32');
  await page.getByLabel('Principal variations').selectOption('2');
  await expect(page.locator('.variation')).toHaveCount(2);
  await expect(page.locator('.status-label')).toHaveText('Complete');
  expect(errors).toEqual([]);
});

test('plays legal moves, rejects an illegal destination, and persists the workspace', async ({
  page,
}) => {
  await pauseAnalysis(page);
  await freshBoard(page);
  await page.getByRole('button', { name: 'e2 White pawn', exact: true }).click();
  await page.getByRole('button', { name: 'e5 empty', exact: true }).click();
  await expect(page.getByRole('button', { name: 'e2 White pawn', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'e2 White pawn', exact: true }).click();
  await page.getByRole('button', { name: 'e4 empty, legal destination', exact: true }).click();
  await expect(page.getByRole('button', { name: 'e4 White pawn', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to move 1. e4', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'e4 White pawn', exact: true })).toBeVisible();
  await expect(page.locator('.move-position')).toHaveText('1 / 1');
});

test('supports desktop dragging and mobile touch selection', async ({ page, isMobile }) => {
  await pauseAnalysis(page);
  await freshBoard(page);
  if (isMobile) {
    await page.locator('#square-d2').tap();
    await page.locator('#square-d4').tap();
  } else {
    await page.locator('#square-d2').dragTo(page.locator('#square-d4'));
  }
  await expect(page.getByRole('button', { name: 'd4 White pawn', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to move 1. d4', exact: true })).toBeVisible();
});

test('copies the exact FEN to the clipboard', async ({ page, context }) => {
  await pauseAnalysis(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy FEN', exact: true }).click();
  const fen = await page.evaluate(() => navigator.clipboard.readText());
  expect(fen).toBe('rn2kb1r/pp2qppp/2p2n2/4p3/2B1P3/1QN5/PPP2PPP/R1B1K2R w KQkq - 0 9');
});

test('recovers from invalid saved browser data without crashing', async ({ page }) => {
  await pauseAnalysis(page);
  await page.evaluate(() => localStorage.setItem('ocl-workspace-v1', '{broken json'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Think one move further.' })).toBeVisible();
  await expect(page.locator('.move-position')).toHaveText('16 / 33');
  await pauseAnalysis(page);
});

test('navigates the main line, flips the board, and supports board keyboard input', async ({
  page,
}) => {
  await pauseAnalysis(page);
  await page.getByRole('button', { name: 'Previous move', exact: true }).click();
  await expect(page.locator('.move-position')).toHaveText('15 / 33');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.move-position')).toHaveText('16 / 33');
  await page.getByRole('button', { name: 'Flip board', exact: true }).click();
  await expect(page.locator('.square').first()).toHaveAttribute('id', 'square-h1');
  await freshBoard(page);
  await page.getByRole('button', { name: 'Flip board', exact: true }).click();
  await page.locator('#square-e2').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#square-e4')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'e4 White pawn', exact: true })).toBeVisible();
  await expect(page.locator('#square-e4')).toBeFocused();
  for (let step = 0; step < 3; step++) await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'e5 Black pawn', exact: true })).toBeVisible();
  await expect(page.locator('#square-e5')).toBeFocused();
  await page.keyboard.press('f');
  await expect(page.locator('.square').first()).toHaveAttribute('id', 'square-h1');
  await expect(page.locator('#square-e5')).toBeFocused();
  await page.keyboard.press('f');
  await expect(page.locator('#square-e5')).toBeFocused();
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' })));
  await expect(page.getByRole('heading', { name: 'Stay in the flow' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#square-e5')).toBeFocused();
});

test('imports a PGN file and downloads a real PGN export', async ({ page }) => {
  await pauseAnalysis(page);
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'test-game.pgn',
    mimeType: 'application/x-chess-pgn',
    buffer: Buffer.from('[White "Test White"]\n[Black "Test Black"]\n\n1. e4 e5 2. Nf3 Nc6 *'),
  });
  await expect(page.getByLabel('Paste your game notation')).toHaveValue(/Test White/);
  await page.getByRole('button', { name: 'Open in workspace' }).click();
  await expect(page.locator('.move-position')).toHaveText('4 / 4');
  await expect(page.getByText('Test White', { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PGN', exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('openchesslab-game.pgn');
});

test('validates FEN input and presents legal underpromotion choices', async ({ page }) => {
  await pauseAnalysis(page);
  await page.getByRole('button', { name: 'Load FEN', exact: true }).click();
  await page.getByLabel('Paste your FEN position').fill('invalid FEN');
  await page.getByRole('button', { name: 'Open in workspace' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('Paste your FEN position').fill('7k/P7/6K1/8/8/8/8/8 w - - 0 1');
  await page.getByRole('button', { name: 'Open in workspace' }).click();
  await page.getByRole('button', { name: 'a7 White pawn', exact: true }).click();
  await page.getByRole('button', { name: 'a8 empty, legal destination', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose your promotion' })).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('f');
  await expect(page.getByRole('heading', { name: 'Choose your promotion' })).toBeVisible();
  await expect(page.locator('.square').first()).toHaveAttribute('id', 'square-a8');
  await expect(page.locator('#square-a7')).toHaveAttribute('aria-label', 'a7 White pawn');
  await page.getByRole('button', { name: 'Promote to knight' }).click();
  await expect(page.getByRole('button', { name: 'a8 White knight', exact: true })).toBeVisible();
});

test('reviews a real game and visualizes its measured turning points', async ({ page }) => {
  await pauseAnalysis(page);
  await importPgn(page, '1. f3 e5 2. g4 Qh4# 0-1');
  await page.getByRole('button', { name: /Review this game/ }).click();
  await expect(page.getByRole('button', { name: /Review again/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to move 2. g4', exact: true })).toHaveClass(
    /blunder/,
  );
  await expect(
    page
      .getByRole('button', { name: 'Go to move 2. g4', exact: true })
      .getByRole('img', { name: 'Blunder' }),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: /Game evaluation by half-move/ })).toBeVisible();
  await expect(page.locator('.review-summary')).toContainText('blunders');
  await expect(page.locator('.review-summary .label-glyph.kind-blunder')).toBeVisible();
  await expect(page.locator('.chart-marker.bad')).not.toHaveCount(0);
  await expect(page.locator('.chart-marker.bad', { hasText: '??' })).toHaveCount(1);
  await expect(page.locator('.review-report')).toContainText('accuracy');
  await expect(page.locator('.review-opening')).toBeVisible();
  await expect(page.locator('.error-message')).toHaveCount(0);
  const optionsResponse = await page.request.get('/api/engines/stockfish-lite/options');
  expect(optionsResponse.ok()).toBe(true);
  const optionsBody = (await optionsResponse.json()) as {
    options: { name: string }[];
  };
  expect(optionsBody.options.map((option) => option.name)).toContain('Threads');
  const hardwareResponse = await page.request.get('/api/hardware/recommendations');
  expect(hardwareResponse.ok()).toBe(true);
  await page.getByText('Advanced settings', { exact: true }).click();
  await expect(page.getByText('Recommended for this machine')).toBeVisible();
  await page.getByText('Engine options', { exact: true }).click();
  await expect(page.getByText('Only advertised options are sent.')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export review CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^openchesslab-review-.*\.csv$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  const csv = Buffer.concat(chunks).toString('utf8');
  expect(csv.split('\r\n')[0]).toContain('uncertain');
  expect(csv).toContain('g4');
  expect(csv.trim().split('\r\n')).toHaveLength(6);
});

test('compares two real engines and exports measured JSON and CSV', async ({ page }, info) => {
  await pauseAnalysis(page);
  await page.getByRole('button', { name: 'Engine arena', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Benchmark depth' }).fill('6');
  await page.getByRole('button', { name: /Compare engines/ }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.locator('.error-message')).toHaveCount(0);
  await page.screenshot({
    path: `artifacts/engines-${info.project.name}.jpg`,
    fullPage: true,
    quality: 85,
    scale: 'css',
  });
  const jsonPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const download = await jsonPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  const result = JSON.parse(Buffer.concat(chunks).toString('utf8')) as BenchmarkResult;
  expect(result.rows).toHaveLength(2);
  expect(
    result.rows.every(
      (row) => row.nodes !== null && row.nodes > 0 && row.nps !== null && row.nps > 0,
    ),
  ).toBe(true);
  expect(result.settings.depth).toBe(6);
  expect(Object.keys(result.comparisons ?? {})).toHaveLength(1);
  await expect(page.locator('.agreement-row')).toHaveCount(1);
  await expect(page.locator('.agreement-row .mono').first()).toContainText('cp');
  const csvPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await csvPromise).suggestedFilename()).toMatch(/\.csv$/);
});

test('analyzes fully offline when the engine service is unreachable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('checkbox', { name: 'Live analysis' }).uncheck();
  await page.route('**/api/**', (route) => route.abort('failed'));
  await page.reload();
  await page.getByRole('checkbox', { name: 'Live analysis' }).uncheck();
  await expect(page.locator('.connection-status')).toContainText('Offline engine ready', {
    timeout: 15_000,
  });
  await expect(page.locator('#engine-select')).toHaveValue('stockfish-offline');
  await expect(page.locator('.engine-picker .tiny')).toContainText('On-device worker');
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await expect(page.getByTestId('engine-score')).not.toHaveText('—', { timeout: 45_000 });
  await expect(page.locator('.variation').first()).toBeVisible();
  await expect(page.locator('.status-label').first()).toHaveText('Complete');
  expect(errors).toEqual([]);
});

test('reviews a game fully offline with a dead API', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('checkbox', { name: 'Live analysis' }).uncheck();
  await page.route('**/api/**', (route) => route.abort('failed'));
  await page.reload();
  await page.getByRole('checkbox', { name: 'Live analysis' }).uncheck();
  await expect(page.locator('.connection-status')).toContainText('Offline engine ready', {
    timeout: 15_000,
  });
  await importPgn(page, '1. f3 e5 2. g4 Qh4# 0-1');
  await page.getByRole('button', { name: /Review this game/ }).click();
  await expect(page.getByRole('button', { name: /Review again/ })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('button', { name: 'Go to move 2. g4', exact: true })).toHaveClass(
    /blunder/,
  );
  await expect(
    page
      .getByRole('button', { name: 'Go to move 2. g4', exact: true })
      .getByRole('img', { name: 'Blunder' }),
  ).toBeVisible();
  await expect(page.locator('.review-summary')).toContainText('blunders');
  await expect(page.locator('.review-disclaimer')).toContainText('on this device');
  expect(errors).toEqual([]);
});

test('runs Suite v1 and downloads a verifiable experiment bundle', async ({ page }) => {
  await pauseAnalysis(page);
  await page.getByRole('button', { name: 'Benchmarks', exact: true }).click();
  await page.getByLabel('Position suite').selectOption('standard');
  await expect(page.getByText(`Hash ${SUITE_V1.sha256.slice(0, 12)}…`)).toBeVisible();
  await page.locator('.engine-option').nth(1).click();
  await page.getByRole('spinbutton', { name: 'Benchmark depth' }).fill('4');
  await page.getByRole('button', { name: /Run benchmark/ }).click();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.locator('.result-context')).toContainText(
    `Suite ${SUITE_V1.id} v${SUITE_V1.version}`,
  );
  const bundlePromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Bundle', exact: true }).click();
  const download = await bundlePromise;
  expect(download.suggestedFilename()).toMatch(/\.oclb\.json$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  const bundle = JSON.parse(Buffer.concat(chunks).toString('utf8')) as ExperimentBundle;
  const verified = verifyBundle(bundle);
  expect(verified.ok).toBe(true);
  if (verified.ok) {
    expect(verified.bundle.suite?.sha256).toBe(SUITE_V1.sha256);
    expect(verified.bundle.result.rows).toHaveLength(3);
  }
});

test('runs a real benchmark on a custom FEN entered in the interface', async ({ page }) => {
  await pauseAnalysis(page);
  await page.getByRole('button', { name: 'Benchmarks', exact: true }).click();
  await page.getByRole('button', { name: 'Connect another UCI engine' }).click();
  await expect(page.getByRole('heading', { name: 'Add your engine safely' })).toBeVisible();
  await page.getByLabel('Absolute executable path').fill('relative/engine');
  await page.getByRole('button', { name: 'Copy entry' }).click();
  await expect(page.getByRole('alert')).toContainText('absolute executable path');
  await page.keyboard.press('Escape');
  await page.getByLabel('Position suite').selectOption('custom');
  await page.getByLabel('Custom position FEN').fill('invalid FEN');
  await page.getByLabel('Custom position name').fill('Custom endgame');
  await page.getByRole('button', { name: /Run benchmark/ }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Invalid FEN: must contain six space-delimited fields',
  );
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('Custom position FEN').fill('8/5pk1/6p1/3R3p/7P/5KP1/8/6r1 w - - 0 1');
  await page.getByRole('spinbutton', { name: 'Benchmark depth' }).fill('5');
  await page.locator('.engine-option').nth(1).click();
  await page.getByRole('button', { name: /Run benchmark/ }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr').first()).toContainText('Custom endgame');
  await expect(page.locator('.agreement-row')).toHaveCount(1);
  await expect(page.locator('.error-message')).toHaveCount(0);
});

test('retains real benchmark results across navigation and reload, then clears only history', async ({
  page,
}) => {
  await pauseAnalysis(page);
  await page.getByRole('button', { name: 'Benchmarks', exact: true }).click();
  await page.locator('.engine-option').nth(1).click();
  await page.getByRole('spinbutton', { name: 'Benchmark depth' }).fill('5');
  await page.getByRole('button', { name: /Run benchmark/ }).click();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.locator('.table-footer')).toContainText('1 run saved locally');
  await page.getByRole('button', { name: 'Engine arena', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await page.reload();
  await pauseAnalysis(page);
  await page.getByRole('button', { name: 'Benchmarks', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.locator('.table-footer')).toContainText('1 run saved locally');
  await page.getByRole('button', { name: 'Clear saved benchmark history' }).click();
  await page.keyboard.press('a');
  await expect(page.getByRole('heading', { name: 'Clear saved benchmark history?' })).toBeVisible();
  const confirmation = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(confirmation.violations.map((violation) => violation.id)).toEqual([]);
  await page.getByRole('button', { name: 'Clear history', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
  await expect(page.getByLabel('Position suite')).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('ocl-benchmarks-v1'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('ocl-workspace-v1'))).not.toBeNull();
});

test('stops an in-progress analysis on the server', async ({ page }) => {
  await pauseAnalysis(page);
  await page.getByLabel('Search depth', { exact: true }).focus();
  await page.keyboard.press('End');
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/analysis') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  const id = ((await created).json() as Promise<Job>).then((job) => job.id);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect
    .poll(
      async () => ((await (await page.request.get(`/api/jobs/${await id}`)).json()) as Job).status,
    )
    .toBe('cancelled');
  await expect(page.getByRole('checkbox', { name: 'Live analysis' })).not.toBeChecked();
  await expect(page.locator('.status-label')).toHaveText('Stopped');
});

test('cancels manual analysis when navigating to a different position', async ({ page }) => {
  await pauseAnalysis(page);
  await page.getByLabel('Search depth', { exact: true }).focus();
  await page.keyboard.press('End');
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/analysis') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  const job = (await (await created).json()) as Job;
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect
    .poll(
      async () => ((await (await page.request.get(`/api/jobs/${job.id}`)).json()) as Job).status,
    )
    .toBe('cancelled');
  await expect(page.getByTestId('engine-score')).toHaveText('\u2014');
});

test('cleans up a real job when cancellation happens before its creation response arrives', async ({
  page,
}) => {
  await pauseAnalysis(page);
  await freshBoard(page);
  await page.getByLabel('Search depth', { exact: true }).focus();
  await page.keyboard.press('End');
  let id: string | undefined;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/analysis', async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(202);
    id = ((await response.json()) as Job).id;
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole('button', { name: 'Analyze', exact: true }).click();
    await expect.poll(() => id).toBeTruthy();
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    release();
    await expect
      .poll(async () => ((await (await page.request.get(`/api/jobs/${id}`)).json()) as Job).status)
      .toBe('cancelled');
    await expect(page.locator('.status-label')).toHaveText('Stopped');
    await expect(page.getByTestId('engine-score')).toHaveText('\u2014');
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('allows editing a benchmark depth without silently replacing an empty or invalid value', async ({
  page,
}) => {
  await pauseAnalysis(page);
  await page.getByRole('button', { name: 'Benchmarks', exact: true }).click();
  const depth = page.getByRole('spinbutton', { name: 'Benchmark depth' });
  await depth.fill('');
  await expect(depth).toHaveValue('');
  await expect(page.getByRole('button', { name: /Run benchmark/ })).toBeDisabled();
  await depth.fill('25');
  await expect(depth).toHaveAttribute('aria-invalid', 'true');
  await depth.fill('10');
  await expect(depth).toHaveValue('10');
  await expect(page.getByRole('button', { name: /Run benchmark/ })).toBeEnabled();
});

test('shows missing measurements and the recorded engine name in historical data', async ({
  page,
}) => {
  await pauseAnalysis(page);
  // This is a storage/rendering fixture, never an application demo or a measured benchmark.
  await page.evaluate(() =>
    localStorage.setItem(
      'ocl-benchmarks-v1',
      JSON.stringify({
        version: 1,
        runs: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            createdAt: '2026-11-25T00:00:00.000Z',
            settings: { depth: 8, threads: 1, hash: 16, multiPv: 1 },
            environment: { platform: 'linux', arch: 'x64', cpus: 2, node: 'v22.23.1' },
            rows: [
              {
                engineId: 'stockfish-lite',
                engineName: 'Historical fixture engine 1.0',
                position: 'Rendering test only',
                fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                depth: null,
                requestedDepth: 8,
                depthLimited: true,
                nodes: null,
                nps: null,
                engineTimeMs: null,
                wallTimeMs: 100,
                score: { type: 'cp', value: 0 },
                bestMove: 'e2e4',
                effectiveOptions: {},
                warnings: ['Test fixture: measurements not reported.'],
              },
            ],
          },
        ],
      }),
    ),
  );
  await page.getByRole('button', { name: 'Benchmarks', exact: true }).click();
  const row = page.locator('tbody tr').first();
  await expect(row).toContainText('Historical fixture engine 1.0');
  await expect(row.locator('td').nth(4)).toHaveText('\u2014');
  await expect(row.locator('td').nth(5)).toHaveText('\u2014');
  await expect(page.locator('.metric-card').nth(1).locator('strong')).toHaveText('\u2014');
});

test('recovers from corrupted saved benchmark data without losing the game', async ({ page }) => {
  await pauseAnalysis(page);
  await page.evaluate(() => localStorage.setItem('ocl-benchmarks-v1', '{broken'));
  await page.getByRole('button', { name: 'Benchmarks', exact: true }).click();
  await expect(page.getByText(/Saved history is unavailable or invalid/)).toBeVisible();
  await page.getByRole('button', { name: 'Clear saved benchmark history' }).click();
  await page.getByRole('button', { name: 'Clear history', exact: true }).click();
  await expect(page.getByText(/Saved history is unavailable or invalid/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Analysis board', exact: true }).click();
  await expect(page.locator('.move-position')).toHaveText('16 / 33');
});

test('opens usable documentation and keeps all workspace views within the viewport', async ({
  page,
  isMobile,
}) => {
  await pauseAnalysis(page);
  const box = await page.locator('.chessboard').boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs(box!.width - box!.height)).toBeLessThan(1);
  for (const name of ['Analysis board', 'Engine arena', 'Benchmarks', 'Documentation']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  }
  await expect(page.getByRole('heading', { name: 'Welcome to OpenChessLab' })).toBeVisible();
  await page.getByRole('button', { name: 'Getting started', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Installation', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'API reference', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'API Reference', exact: true })).toBeVisible();
  if (!isMobile) {
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const name of ['Analysis board', 'Engine arena', 'Documentation']) {
        await page.getByRole('button', { name, exact: true }).click();
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
          .toBe(true);
      }
    }
  }
});

test('passes automated accessibility checks for the analysis workspace and import dialog', async ({
  page,
}, info) => {
  await pauseAnalysis(page);
  const workspace = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  await info.attach('workspace-accessibility.json', {
    body: JSON.stringify(workspace.violations, null, 2),
    contentType: 'application/json',
  });
  expect(
    workspace.violations.map((item) => ({
      id: item.id,
      nodes: item.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
    })),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Import game', exact: true }).click();
  const dialog = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  await info.attach('dialog-accessibility.json', {
    body: JSON.stringify(dialog.violations, null, 2),
    contentType: 'application/json',
  });
  expect(
    dialog.violations.map((item) => ({
      id: item.id,
      nodes: item.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
    })),
  ).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Import game', exact: true })).toBeFocused();
});

test('keeps experiment and documentation views accessible and internal guides navigable', async ({
  page,
  isMobile,
}) => {
  await pauseAnalysis(page);
  if (!isMobile) {
    await page.setViewportSize({ width: 900, height: 900 });
    const collapsed = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(collapsed.violations.map((violation) => violation.id)).toEqual([]);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  for (const name of ['Engine arena', 'Benchmarks', 'Documentation']) {
    await page.getByRole('button', { name, exact: true }).click();
    if (isMobile && name !== 'Documentation') {
      await page.getByRole('region', { name: 'Engine search results' }).focus();
      await page.keyboard.press('ArrowRight');
      await expect
        .poll(() => page.locator('.table-scroll').evaluate((element) => element.scrollLeft))
        .toBeGreaterThan(0);
    }
    const report = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      report.violations.map((violation) => ({
        id: violation.id,
        targets: violation.nodes.map((node) => node.target),
      })),
    ).toEqual([]);
  }
  await page.getByRole('button', { name: 'Contribute to the project', exact: true }).click();
  await page.getByRole('button', { name: 'Code of Conduct', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Code of Conduct', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Development guide', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Development Guide', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Maintenance & updates', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Maintaining OpenChessLab', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'API reference', exact: true }).click();
  await page.getByRole('button', { name: 'Reproducible experiments', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Reproducible Experiments', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'UCI pitfalls for engine authors', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'UCI Pitfalls for Engine Authors', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'API reference', exact: true }).click();
  await page.getByRole('button', { name: 'migration notes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Migrating to 0.2', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'verification report', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Verification Report: 0.5.0', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.prose table')).toHaveCount(2);
  const tables = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    tables.violations.map((violation) => ({
      id: violation.id,
      targets: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
});
