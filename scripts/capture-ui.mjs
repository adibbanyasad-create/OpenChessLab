import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await page.goto(process.env.OPENCHESSLAB_URL ?? 'http://127.0.0.1:3001');
  await page.locator('.status-label').filter({ hasText: 'Complete' }).waitFor({ timeout: 30_000 });
  await mkdir('docs/images', { recursive: true });
  await page.screenshot({
    path: 'docs/images/workspace.jpg',
    fullPage: true,
    quality: 85,
    scale: 'css',
  });
  const mobile = await browser.newPage({ ...devices['Pixel 7'] });
  await mobile.goto(process.env.OPENCHESSLAB_URL ?? 'http://127.0.0.1:3001');
  await mobile
    .locator('.status-label')
    .filter({ hasText: 'Complete' })
    .waitFor({ timeout: 30_000 });
  await mobile.screenshot({
    path: 'docs/images/mobile.jpg',
    fullPage: true,
    quality: 85,
    scale: 'css',
  });
  console.log(
    'Captured desktop and mobile screenshots from real completed engine searches in docs/images.',
  );
} finally {
  await browser.close();
}
