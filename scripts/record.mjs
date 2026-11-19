// Records the board in use: open it, watch a new incident arrive, ack the top row, then ack a row while the
// list moves.
// Usage: node scripts/record.mjs <board url> <out dir>
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';

const [url, outDir] = process.argv.slice(2);
const AIM_TO_CLICK_MS = 1200;
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
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
const ackCenter = async (row) => {
  const box = await row.getByTestId('ack').boundingBox();
  return [box.x + box.width / 2, box.y + box.height / 2];
};
const rowIdAt = ([x, y]) =>
  page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('[data-testid="incident-row"]')?.dataset.id, [x, y]);
const waitForNewTop = async (previousTop) => {
  await page.waitForFunction((id) => document.querySelector('[data-testid="incident-row"]')?.dataset.id !== id, previousTop, { timeout: 30000, polling: 50 });
};

page.on('console', (msg) => {
  const [kind, id, ackedAt, receipt] = msg.text().split(' ');
  if (kind === 'ack') note({ event: 'ack-reply', id, ackedAt, receipt });
});

// open-board
await page.goto(url);
note({ event: 'open', loaderVisible: await page.getByTestId('loader').isVisible() });
await rows.first().waitFor();
note({ event: 'loaded', rows: await rows.count(), loaderCount: await page.getByTestId('loader').count(), build: await page.getByTestId('build-sha').textContent() });

// watch-board: a new incident arrives at the top without a reload
await waitForNewTop(await topId());
note({ event: 'new-top', topId: await topId(), rows: await rows.count() });
await page.waitForTimeout(1500);

// ack-incident: aim at the top row's Ack, read it, click
const first = rows.first();
const firstId = await first.getAttribute('data-id');
let point = await ackCenter(first);
await page.mouse.move(...point, { steps: 20 });
note({ event: 'aim', aimedId: firstId });
await page.waitForTimeout(AIM_TO_CLICK_MS);
note({ event: 'click', aimedId: firstId, underPointer: await rowIdAt(point) });
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(2500);

// ack-incident again, on the third row, while the list keeps moving: the pointer rests on its Ack while
// reading the row, a refresh pushes a new incident in at the top, and the click lands on that moment.
const third = rows.nth(2);
const thirdId = await third.getAttribute('data-id');
point = await ackCenter(third);
await page.mouse.move(...point, { steps: 20 });
const topBefore = await topId();
note({ event: 'aim', aimedId: thirdId, rowAbove: await rows.nth(1).getAttribute('data-id') });
await waitForNewTop(topBefore);
note({ event: 'new-top', topId: await topId() });
await page.waitForTimeout(250);
note({ event: 'click', aimedId: thirdId, underPointer: await rowIdAt(point) });
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(1500);
note({ event: 'state', aimedRowHasAck: await page.locator(`[data-testid="incident-row"][data-id="${thirdId}"] [data-testid="ack"]`).count() });
await page.mouse.move(1150, 650, { steps: 20 });
await page.waitForTimeout(3000);
const video = page.video();
await context.close();
await browser.close();
const raw = await video.path();
renameSync(raw, `${outDir}/board.webm`);
writeFileSync(`${outDir}/events.json`, JSON.stringify(events, null, 2));
