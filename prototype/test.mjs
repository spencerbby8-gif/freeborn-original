import { chromium } from 'playwright';
const B = 'http://127.0.0.1:8080/#/';
const results = [];
const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));

// 1. Welcome flow -> onboarding
await page.goto(B + 'welcome', { waitUntil: 'networkidle' });
await page.click('#authContinue'); // empty -> toast, stays
await page.fill('#authEmail', 'aria@freeborn.app');
await page.fill('#authPass', 'sunset-matcha-2026');
await page.click('#authContinue');
await page.waitForTimeout(600);
ok('Welcome Continue routes to onboarding', await page.locator('.screen[data-screen="onboarding"].active').count() === 1);

// 2. Onboarding select + continue -> discover
await page.click('[data-intent="New friends"]');
await page.click('#onboardContinue');
await page.waitForTimeout(700);
ok('Onboarding Continue routes to discover', await page.locator('.screen[data-screen="discover"].active').count() === 1);

// 3. Discover: pass -> empty state -> reset
await page.click('#passBtn');
await page.waitForTimeout(500);
ok('Pass hides card and shows empty state', await page.locator('#deckEmpty:not(.hidden)').count() === 1);
await page.click('#deckReset');
ok('Reset deck restores the card', await page.locator('#deckCard:not(.hidden)').count() === 1);

// 4. Say hello -> chat with Aria; send message; fake reply arrives
await page.click('#sayHelloBtn');
await page.waitForTimeout(300);
ok('Say hello opens chat with Aria', (await page.textContent('#chatName')) === 'Aria');
await page.fill('#chatInput', 'Hey Aria! Saturday sounds perfect.');
await page.click('.send-btn');
await page.waitForTimeout(300);
ok('Outgoing bubble appended', (await page.locator('.bubble.out').count()) >= 2);
await page.waitForTimeout(1800);
ok('Aria auto-replies', (await page.locator('.bubble.in').count()) >= 1);

// 5. Likes filter + like-back toast
await page.goto(B + 'likes', { waitUntil: 'networkidle' });
await page.click('[data-like-filter="new"]');
const newCount = await page.locator('.like-row').count();
ok('Likes "New" filter shows only new (3)', newCount === 3);
await page.click('#likeList .like-btn');
ok('Like button toggles state', await page.locator('#likeList .like-btn').first().evaluate(el => el.classList.contains('liked')));

// 6. Messages: filter + open Lena chat
await page.goto(B + 'messages', { waitUntil: 'networkidle' });
await page.fill('#msgFilter', 'chris');
ok('Search narrows threads to Chris', (await page.locator('.thread-row').count()) === 1);
await page.fill('#msgFilter', 'lena');
ok('Search “lena” matches Lena + Elena (substring)', (await page.locator('.thread-row').count()) === 2);
await page.click('.thread-row');
await page.waitForTimeout(300);
ok('Thread opens Lena chat', (await page.textContent('#chatName')) === 'Lena');

// 7. Notifications: filter + clear all
await page.goto(B + 'notifications', { waitUntil: 'networkidle' });
await page.click('[data-notif-filter="match"]');
ok('Matches tab shows 1 match notif', (await page.locator('.notif-row').count()) === 1);
await page.click('[data-notif-filter="all"]');
await page.click('#clearAllBtn');
ok('Clear all empties the list', (await page.locator('.notif-row').count()) === 0);

// 8. Settings -> Premium: plan select + upgrade toast
await page.goto(B + 'settings', { waitUntil: 'networkidle' });
await page.click('.upgrade-banner');
await page.waitForTimeout(300);
ok('Upgrade banner opens Premium', await page.locator('.screen[data-screen="premium"].active').count() === 1);
await page.click('[data-plan="6 months"]');
await page.click('#upgradeBtn');
await page.waitForTimeout(150);
ok('Upgrade shows toast with plan', (await page.textContent('#toast')).includes('6 months'));

// 9. Verification flow
await page.goto(B + 'verification', { waitUntil: 'networkidle' });
await page.click('#startVerifyBtn');
await page.waitForTimeout(2200);
ok('Verification completes', (await page.textContent('#startVerifyBtn')).includes('verified'));

// 10. Privacy toggle
await page.goto(B + 'privacy', { waitUntil: 'networkidle' });
const receipts = page.locator('[data-toggle="receipts"]');
const before = await receipts.evaluate(el => el.classList.contains('on'));
await receipts.click();
const after = await receipts.evaluate(el => el.classList.contains('on'));
ok('Read receipts toggle flips', before !== after);

// 11. Preferences: age slider clamp + save toast
await page.goto(B + 'preferences', { waitUntil: 'networkidle' });
const label = await page.textContent('#ageLabel');
ok('Age range label renders', /2\d – 3\d/.test(label.trim()));
await page.click('#savePrefsBtn');
ok('Save preferences toasts', (await page.textContent('#toast')).includes('saved'));

// 12. Hash deep-linking for all 15 screens
const routes = ['welcome','onboarding','discover','profile-detail','likes','messages','my-profile','notifications','settings','preferences','premium','matches','chat','verification','privacy'];
let routeOK = 0;
for (const r of routes) {
  await page.goto(B + r, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(80);
  if (await page.locator(`.screen[data-screen="${r}"].active`).count() === 1) routeOK++;
}
ok(`All 15 routes deep-link (${routeOK}/15)`, routeOK === 15);

console.log(results.join('\n'));
console.log(errors.length ? 'JS ERRORS:\n' + errors.join('\n') : 'NO_PAGE_ERRORS');
await browser.close();
