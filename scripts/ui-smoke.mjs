/** Headless browser smoke test for presentation/boot/fallbacks. Run: npm run test:ui (server must be running). */
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { brotliDecompressSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.env.UI_URL ?? 'http://127.0.0.1:8080/';
mkdirSync('test-results', { recursive: true });

// @sparticuz/chromium ships Amazon Linux shared libs; expose them for headless launch.
const libDir = join(tmpdir(), 'rcdp-chromium-libs');
if (!existsSync(join(libDir, 'lib', 'libnss3.so'))) {
  const tarPath = join(tmpdir(), 'rcdp-al2023.tar');
  writeFileSync(tarPath, brotliDecompressSync(await import('node:fs/promises').then(fs => fs.readFile('node_modules/@sparticuz/chromium/bin/al2023.tar.br'))));
  mkdirSync(libDir, { recursive: true });
  execFileSync('tar', ['-xf', tarPath, '-C', libDir]);
}
process.env.LD_LIBRARY_PATH = `${join(libDir, 'lib')}:${process.env.LD_LIBRARY_PATH ?? ''}`;

const executablePath = await chromium.executablePath();
const browser = await puppeteer.launch({
  executablePath,
  args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  headless: true,
  defaultViewport: { width: 1280, height: 800 },
});

const errors = [];
function watch(page, tag) {
  page.on('pageerror', e => errors.push(`${tag} pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${tag} console: ${m.text()}`); });
  page.on('requestfailed', r => errors.push(`${tag} requestfailed: ${r.url()} ${r.failure()?.errorText}`));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function checkPage(page, tag) {
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('#nav button[data-tab]', { timeout: 10000 });
  await page.waitForSelector('#content .card', { timeout: 10000 });
  return page.evaluate(() => ({
    booted: window.__RCDP_BOOTED === true,
    bootErrorHidden: document.getElementById('bootError').hidden,
    navCount: document.querySelectorAll('#nav button[data-tab]').length,
    projectName: document.getElementById('projectName').value,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    shellDisplay: getComputedStyle(document.querySelector('.app-shell')).display,
    sidebarWidth: getComputedStyle(document.querySelector('.sidebar')).width,
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
    contentCards: document.querySelectorAll('#content .card').length,
    badge: document.getElementById('offlineBadge').textContent,
  }));
}

// 1. Normal desktop boot + design + analysis.
const page = await browser.newPage(); watch(page, 'desktop');
const desktop = await checkPage(page, 'desktop');
console.log('desktop', desktop);
await page.screenshot({ path: 'test-results/ui-desktop.png' });
await page.click('#runDesign'); await sleep(1200);
await page.click('#nav button[data-tab="analysis"]');
await page.waitForSelector('#content .check-item, #content .card', { timeout: 10000 });
const analysis = await page.evaluate(() => ({
  status: document.querySelector('#content .status')?.textContent ?? null,
  charts: document.querySelectorAll('canvas.chart').length,
  requiredAs: [...document.querySelectorAll('.kpi .value')].map(e => e.textContent).join('|'),
  overflowX: document.documentElement.scrollWidth > window.innerWidth,
}));
console.log('analysis', analysis);
await page.screenshot({ path: 'test-results/ui-analysis.png' });

// 2. Mobile layout.
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.click('#nav button[data-tab="column"]').catch(() => {}); await sleep(300);
const mobile = await page.evaluate(() => ({
  overflowX: document.documentElement.scrollWidth > window.innerWidth,
  menuVisible: getComputedStyle(document.getElementById('menuToggle')).display !== 'none',
}));
await page.click('#menuToggle'); await sleep(300);
const mobileOpen = await page.evaluate(() => document.getElementById('sidebar').classList.contains('open'));
console.log('mobile', { ...mobile, sidebarOpens: mobileOpen });
await page.screenshot({ path: 'test-results/ui-mobile.png' });
await page.close();

// 3. External stylesheet blocked: critical inline CSS must keep the shell usable.
{
  const p = await browser.newPage(); watch(p, 'css-fallback');
  const cdp = await p.createCDPSession();
  await cdp.send('Network.setBypassServiceWorker', { bypass: true });
  await p.setCacheEnabled(false);
  await p.setRequestInterception(true);
  p.on('request', req => { if (req.url().includes('styles.css')) req.abort(); else req.continue(); });
  const r = await checkPage(p, 'css-fallback');
  console.log('css-fallback', r);
  await p.screenshot({ path: 'test-results/ui-css-fallback.png' });
  if (!r.booted || r.shellDisplay !== 'flex' || r.contentCards < 1 || r.overflowX) throw new Error('CSS fallback presentation failed');
  await p.close();
}

// 4. IndexedDB blocked: app must still boot and render using fallback storage.
{
  const p = await browser.newPage(); watch(p, 'idb-fallback');
  const cdp = await p.createCDPSession();
  await cdp.send('Network.setBypassServiceWorker', { bypass: true });
  await p.setCacheEnabled(false);
  await p.evaluateOnNewDocument(() => {
    try { Object.defineProperty(window, 'indexedDB', { configurable: true, get() { throw new Error('IndexedDB blocked for test'); } }); } catch { }
  });
  const r = await checkPage(p, 'idb-fallback');
  console.log('idb-fallback', r);
  await p.screenshot({ path: 'test-results/ui-idb-fallback.png' });
  if (!r.booted || !r.bootErrorHidden || r.contentCards < 1 || r.overflowX) throw new Error('IndexedDB fallback boot failed');
  await p.close();
}

await browser.close();
const fatal = errors.filter(e => !/favicon|service worker|sw.js|styles\.css|IndexedDB blocked/i.test(e));
if (fatal.length) { console.error('Browser errors:\n' + fatal.join('\n')); process.exit(1); }
if (!desktop.booted || !desktop.bootErrorHidden || desktop.navCount < 11 || desktop.overflowX || desktop.shellDisplay !== 'flex' || desktop.contentCards < 1) throw new Error('Desktop presentation checks failed');
if (mobile.overflowX || !mobile.menuVisible || !mobileOpen) throw new Error('Mobile presentation checks failed');
console.log('UI smoke passed');
