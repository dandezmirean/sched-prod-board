// Records the board in use: open it, watch a new incident arrive, ack the top incident in its panel, then
// pick a row while the list moves and ack in the panel.
// Usage: node scripts/record.mjs <board url> <out dir>
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';

const [url, outDir] = process.argv.slice(2);
const AIM_TO_CLICK_MS = 1200;
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  locale: 'ro-RO',
  timezoneId: 'Europe/Bucharest',
  recordVideo: { dir: outDir, size: { width: 1280, height: 720 } },
});
// A visible pointer for the recording only; the board itself has none of this.
await context.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;z-index:9999;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(220,0,80,.55);border:2px solid #fff;pointer-events:none;left:-50px;top:-50px';
    document.body.append(dot);
    addEventListener('mousemove', (e) => { dot.style.left = `${e.clientX}px`; dot.style.top = `${e.clientY}px`; });
    addEventListener('mousedown', () => { dot.style.background = 'rgba(220,0,80,1)'; });
    addEventListener('mouseup', () => { dot.style.background = 'rgba(220,0,80,.55)'; });
  });
});

const page = await context.newPage();
const t0 = Date.now();
const at = () => {
  const s = Math.floor((Date.now() - t0) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const events = [];
const note = (event) => {
  events.push({ at: at(), wall: new Date().toISOString(), ...event });
  console.log(JSON.stringify(events.at(-1)));
};
const rows = page.getByTestId('incident-row');
const topId = () => rows.first().getAttribute('data-id');
const centerOf = async (locator) => {
  const box = await locator.boundingBox();
  return [box.x + box.width / 2, box.y + box.height / 2];
};
const rowIdAt = ([x, y]) =>
  page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('[data-testid="incident-row"]')?.dataset.id, [x, y]);
const waitForNewTop = async (previousTop) => {
  await page.waitForFunction((id) => document.querySelector('[data-testid="incident-row"]')?.dataset.id !== id, previousTop, { timeout: 30000, polling: 50 });
};
const panelId = () => page.getByTestId('incident-panel').locator('.panel-id').textContent();
const clickAt = async (point) => {
  await page.mouse.move(...point, { steps: 20 });
  await page.mouse.down();
  await page.mouse.up();
};

page.on('console', (msg) => {
  const [kind, id, ackedAt, receipt] = msg.text().split(' ');
  if (kind === 'ack') note({ event: 'ack-reply', id, ackedAt, receipt });
});

// open-board
await page.goto(url);
note({ event: 'open', loaderVisible: await page.getByTestId('loader').isVisible() });
await rows.first().waitFor();
note({ event: 'loaded', rows: await rows.count(), loaderCount: await page.getByTestId('loader').count(), rowAckButtons: await page.locator('[data-testid="incident-row"] [data-testid="ack"]').count(), build: await page.getByTestId('build-sha').textContent() });

// watch-board: a new incident arrives at the top without a reload
await waitForNewTop(await topId());
note({ event: 'new-top', topId: await topId(), rows: await rows.count() });
await page.waitForTimeout(1500);

// ack-incident: pick the top row, read its panel, Ack there
const firstId = await topId();
await clickAt(await centerOf(rows.first()));
await page.waitForTimeout(AIM_TO_CLICK_MS);
note({ event: 'panel', picked: firstId, panelNames: await panelId() });
await clickAt(await centerOf(page.getByTestId('panel-ack')));
await page.waitForTimeout(2500);

// ack-incident while the list moves: rest on the third row, a new incident pushes in at the top, click.
const third = rows.nth(2);
const thirdId = await third.getAttribute('data-id');
const point = await centerOf(third);
await page.mouse.move(...point, { steps: 20 });
const topBefore = await topId();
note({ event: 'aim', aimedId: thirdId });
await waitForNewTop(topBefore);
note({ event: 'new-top', topId: await topId() });
await page.waitForTimeout(250);
note({ event: 'click', aimedId: thirdId, underPointer: await rowIdAt(point) });
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(AIM_TO_CLICK_MS);
note({ event: 'panel', picked: thirdId, panelNames: await panelId() });
// The panel names another incident: pick the meant row again (it holds still now), then Ack in the panel.
await clickAt(await centerOf(page.locator(`[data-testid="incident-row"][data-id="${thirdId}"]`)));
await page.waitForTimeout(AIM_TO_CLICK_MS);
note({ event: 'panel', picked: thirdId, panelNames: await panelId() });
await clickAt(await centerOf(page.getByTestId('panel-ack')));
await page.waitForTimeout(1500);
note({ event: 'state', aimedRowAcked: await page.locator(`[data-testid="incident-row"][data-id="${thirdId}"] [data-testid="acked"]`).count() });
await page.mouse.move(1150, 650, { steps: 20 });
await page.waitForTimeout(3000);
const video = page.video();
await context.close();
await browser.close();
const raw = await video.path();
renameSync(raw, `${outDir}/board.webm`);
writeFileSync(`${outDir}/events.json`, JSON.stringify(events, null, 2));
