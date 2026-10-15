// Regression checks against the real production export and an actual local IWAD.
// --baseline records the original defects without asserting repaired geometry.
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import LZMA from '../src/lzma.js';
const { chromium, firefox, webkit } = await import(process.env.IMD_PLAYWRIGHT || 'playwright');
const baseline = process.argv.includes('--baseline');
const directory = `test/scratch/layout-${baseline ? 'before' : 'after'}`;
fs.mkdirSync(directory, { recursive: true });
const root = path.resolve('dist');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.md': 'text/plain' };
const server = createServer((req, res) => {
  const file = path.resolve(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/preview\//, '') || 'index.html');
  if (!file.startsWith(root + '/')) return res.writeHead(403).end();
  fs.readFile(file, (error, bytes) => {
    if (error) return res.writeHead(404).end();
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(bytes);
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
const filename = 'MyCustomFreedoomPhaseOneReplacementBaseGameForPersonalUse.wad';
const wad = Buffer.from(LZMA.decompress(new Uint8Array(fs.readFileSync('dist/assets/freedoom1.wad.lzma'))));
const results = [];
function measure() {
  const box = selector => {
    const element = document.querySelector(selector), r = element.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  };
  const canvas = document.querySelector('#canvas');
  return {
    viewport: { width: innerWidth, height: innerHeight }, scrollWidth: document.documentElement.scrollWidth,
    label: box('#game-label'), state: box('#session-state'), row: box('.game-top'), screen: box('.screen'),
    canvas: box('#canvas'), fit: getComputedStyle(canvas).objectFit, labelText: document.querySelector('#game-label').textContent,
    toolbar: box('.game-toolbar'), touch: document.querySelector('#touch-controls').hidden ? null : box('#touch-controls'),
    fullscreen: !!document.fullscreenElement,
  };
}
try {
  for (const name of (process.env.IMD_TEST_BROWSERS || 'chromium,firefox').split(',')) {
    const browser = await ({ chromium, firefox, webkit }[name]).launch({ headless: true });
    const result = { browser: name, version: browser.version(), measurements: [], errors: [], requests: [] };
    results.push(result);
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      page.on('pageerror', e => result.errors.push(e.message));
      page.on('requestfailed', r => result.errors.push(r.failure()?.errorText));
      page.on('request', r => result.requests.push({ url: r.url().replace(url, './'), method: r.method() }));
      await page.goto(url);
      await page.locator('#base-file').setInputFiles({ name: filename, mimeType: 'application/octet-stream', buffer: wad });
      await page.waitForFunction(name => document.querySelector('#base-name').textContent === name, filename);
      await page.locator('#play').click();
      await page.waitForFunction(() => Number(document.querySelector('#canvas').dataset.ticks) > 60, {}, { timeout: 60000 });
      await page.locator('#pause').click();
      for (const [width, height] of [[390, 844], [320, 844], [1440, 900], [844, 390]]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(150);
        for (const fullscreen of [false, true]) {
          if (fullscreen) {
            await page.locator('#fullscreen').click();
            await page.waitForFunction(() => !!document.fullscreenElement);
            await page.waitForTimeout(200);
          }
          const state = await page.evaluate(measure);
          result.measurements.push(state);
          await page.screenshot({ path: `${directory}/${name}-${width}-${fullscreen ? 'fullscreen' : 'normal'}.png`, fullPage: !fullscreen });
          if (!baseline) {
            assert.equal(state.scrollWidth, state.viewport.width, 'Page must not overflow horizontally');
            if (!fullscreen) assert.equal(state.viewport.width, width, 'Requested page viewport applied');
            assert.equal(state.labelText, filename, 'Keep the full filename');
            assert.ok(state.label.right <= state.row.right && state.state.right <= state.row.right, 'Both header items must remain in the row');
            assert.ok(state.label.right + 1 <= state.state.x, 'Filename must not collide with state');
            assert.ok(state.label.height > 20 || state.viewport.width >= 844, 'Long filename must wrap on phones');
            assert.equal(state.fit, 'fill', 'Correct the 320×200 framebuffer to the display rectangle');
            assert.ok(Math.abs(state.canvas.width / state.canvas.height - 4 / 3) < 0.002, 'Visible image must be 4:3');
            if (fullscreen) {
              assert.ok(state.canvas.width > 0 && state.canvas.height > 0, 'Fullscreen image must remain visible');
              assert.ok(state.canvas.y >= state.row.bottom - 1 && state.canvas.bottom <= state.toolbar.y + 1, 'Toolbar stays outside image');
              assert.ok(state.toolbar.bottom <= state.viewport.height + 1, 'Fullscreen toolbar fits');
              if (state.touch) assert.ok(state.touch.bottom <= state.viewport.height + 1, 'Touch controls fit');
            }
          }
          if (fullscreen) {
            await page.locator('#fullscreen').click();
            await page.waitForFunction(() => !document.fullscreenElement);
          }
        }
      }
      assert.deepEqual(result.errors, []);
      assert.ok(result.requests.every(r => r.method === 'GET' && r.url.startsWith('./')));
      console.log(name, result.version, result.measurements.length, 'layout states', baseline ? '(baseline recorded)' : 'passed');
    } catch (error) {
      result.errors.push(error.message);
      throw error;
    } finally { await browser.close(); }
  }
} finally {
  server.close();
  fs.writeFileSync(`${directory}/results.json`, JSON.stringify(results, null, 2));
}
