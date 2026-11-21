import { chromium } from 'playwright';
import fs from 'fs';

const routes = [
  ['01', 'welcome'], ['02', 'onboarding'], ['03', 'discover'], ['04', 'profile-detail'],
  ['05', 'likes'], ['06', 'messages'], ['07', 'my-profile'], ['08', 'notifications'],
  ['09', 'settings'], ['10', 'preferences'], ['11', 'premium'], ['12', 'matches'],
  ['13', 'chat'], ['14', 'verification'], ['15', 'privacy']
];
fs.mkdirSync('/home/user/freeborn/screenshots', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
for (const [num, route] of routes) {
  await page.goto(`http://127.0.0.1:8080/#/${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(450);
  const file = `/home/user/freeborn/screenshots/${num}-${route}.png`;
  await page.screenshot({ path: file });
  console.log('shot', file);
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO_CONSOLE_ERRORS');
await browser.close();
