// Records the board in use: open it, watch it refresh, ack rows like a person would (aim, read, click).
// Usage: node scripts/record.mjs <board url> <out dir>
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';

const [url, outDir] = process.argv.slice(2);
const AIM_TO_CLICK_MS = 1500;
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
const note = (event) => { events.push({ at: at(), ...event }); console.log(JSON.stringify(events.at(-1))); };

page.on('console', (msg) => {
  const [kind, id, ackedAt, receipt] = msg.text().split(' ');
  if (kind === 'ack') note({ event: 'ack-reply', id, ackedAt, receipt });
});

await page.goto(url);
note({ event: 'open', loaderVisible: await page.getByTestId('loader').isVisible() });
await page.getByTestId('incident-row').first().waitFor();
note({ event: 'loaded', rows: await page.getByTestId('incident-row').count(), build: await page.getByTestId('build-sha').textContent() });

for (let round = 0; round < 6; round++) {
  await page.waitForTimeout(4000);
  const target = page.getByTestId('incident-row').filter({ has: page.getByTestId('ack') }).first();
  const aimedId = await target.getAttribute('data-id');
  const box = await target.getByTestId('ack').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 });
  note({ event: 'aim', aimedId, topId: await page.getByTestId('incident-row').first().getAttribute('data-id') });
  await page.waitForTimeout(AIM_TO_CLICK_MS);
  const underPointer = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid="incident-row"]')?.dataset.id, [box.x + box.width / 2, box.y + box.height / 2]);
  await page.mouse.down();
  await page.mouse.up();
  note({ event: 'click', aimedId, underPointer });
  await page.waitForTimeout(800);
}

await page.waitForTimeout(3000);
const video = page.video();
await context.close();
await browser.close();
const raw = await video.path();
renameSync(raw, `${outDir}/board.webm`);
writeFileSync(`${outDir}/events.json`, JSON.stringify(events, null, 2));
