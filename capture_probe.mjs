import fs from 'fs';
import { chromium } from 'rebrowser-playwright-core';

const env = fs.readFileSync('.env', 'utf-8');
const cookie = env.match(/SUNO_COOKIE=(.*)/)?.[1]?.trim() || '';
const pairs = {};
for (const part of cookie.split(';')) { const idx = part.indexOf('='); if (idx > 0) pairs[part.slice(0, idx).trim()] = part.slice(idx + 1).trim(); }
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const SONG = process.argv[2] || 'a3446975-7cd8-4baf-a327-e3d6c05bdabb';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 800 } });
const cookies = [];
if (pairs.__client) cookies.push({ name: '__session', value: pairs.__client, domain: '.suno.com', path: '/' });
for (const [k, v] of Object.entries(pairs)) { if (k !== '__session') cookies.push({ name: k, value: v, domain: '.suno.com', path: '/' }); }
await ctx.addCookies(cookies);
const page = await ctx.newPage();

await page.addInitScript(() => {
  const log = (m) => console.log('[HOOK] ' + m);
  // hook decodeAudioData
  const origDecode = (window.AudioContext && window.AudioContext.prototype.decodeAudioData) ? window.AudioContext.prototype.decodeAudioData.bind(window.AudioContext.prototype) : null;
  if (origDecode) {
    window.AudioContext.prototype.decodeAudioData = function (buf, ...rest) {
      log('decodeAudioData called, byteLength=' + (buf.byteLength || buf.length));
      return origDecode.call(this, buf, ...rest);
    };
  }
  // hook fetch
  const origFetch = window.fetch;
  window.fetch = function (url, opts) {
    const u = String(url);
    if (/audio|media|clip|m4a|webm|stream/i.test(u)) log('fetch: ' + u.slice(0, 160));
    return origFetch.apply(this, arguments);
  };
  // hook media element src
  const origSetSrc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src').set;
  Object.defineProperty(HTMLMediaElement.prototype, 'src', {
    set(v) { log('media.src set: ' + String(v).slice(0, 160)); return origSetSrc.call(this, v); },
    get() { return origSetSrc.get ? origSetSrc.get.call(this) : ''; }
  });
});

page.on('console', (m) => { const t = m.text(); if (/HOOK|decode|fetch:|media\.src/.test(t)) console.log(t); });
page.on('request', (r) => { if (/audio|media|clip|m4a|webm|stream|audiopipe|cloudfront/i.test(r.url())) console.log('[REQ] ' + r.url().slice(0, 160)); });

await page.goto(`https://suno.com/song/${SONG}`, { waitUntil: 'domcontentloaded', timeout: 0 });
await page.waitForTimeout(6000);

// try to click play
for (const sel of ['button[aria-label="Play"]', '[data-testid="play"]', 'button:has-text("Play")', '.react-aria-Button']) {
  try {
    const btn = page.locator(sel).first();
    if (await btn.count()) { await btn.click({ force: true, timeout: 4000 }); console.log('clicked play via', sel); break; }
  } catch (e) {}
}
await page.waitForTimeout(8000);
console.log('DONE investigating');
await browser.close().catch(() => {});
