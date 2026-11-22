/* Freeborn — interactive prototype (no backend, sample data) — v2 matched to reference */
'use strict';
const $ = (s, c) => (c || document).querySelector(s);
const $$ = (s, c) => [...(c || document).querySelectorAll(s)];
const phone = $('#phone');

const AV = name => `assets/avatars/${name.toLowerCase()}.jpg`;

/* ---------- routing ---------- */
const TAB_FOR = {
  discover: 'discover', 'profile-detail': 'discover', likes: 'likes', messages: 'messages',
  chat: 'none', 'my-profile': 'my-profile', settings: 'my-profile', preferences: 'none',
  notifications: 'messages', premium: 'none', onboarding: 'none', welcome: 'none',
  verification: 'none', privacy: 'my-profile', matches: 'likes'
};
const screens = $$('.screen');
const tabs = $$('.tabbar .tab');
function go(name) {
  screens.forEach(s => s.classList.toggle('active', s.dataset.screen === name));
  const tab = TAB_FOR[name] || 'none';
  phone.dataset.tab = tab;
  tabs.forEach(t => t.classList.toggle('active', t.dataset.nav === tab));
  const sc = $('.screen.active .scroll');
  if (sc) sc.scrollTop = 0;
  if (location.hash !== '#/' + name) history.replaceState(null, '', '#/' + name);
  if (name === 'messages') $('#tabMsgBadge').classList.add('hidden');
  if (name === 'notifications') $('#notifBadge').classList.add('hidden');
}
window.addEventListener('hashchange', () => {
  const name = location.hash.replace('#/', '');
  if (screens.some(s => s.dataset.screen === name)) go(name);
});
document.addEventListener('click', e => {
  const nav = e.target.closest('[data-nav]');
  if (nav) { e.preventDefault(); go(nav.dataset.nav); return; }
  const toastEl = e.target.closest('[data-toast]');
  if (toastEl) { showToast(toastEl.dataset.toast); return; }
});

/* ---------- toast ---------- */
const toast = $('#toast');
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

/* ---------- verified svg ---------- */
const VERIFIED = '<span class="verified"><svg viewBox="0 0 24 24"><path fill="#3b9df2" d="M12 1.8l2.6 2.5 3.6-.4 1.5 3.3 3.2 1.7-1.4 3.4 1.4 3.4-3.2 1.7-1.5 3.3-3.6-.4L12 22.2l-2.6-2.5-3.6.4-1.5-3.3-3.2-1.7 1.4-3.4-1.4-3.4 3.2-1.7 1.5-3.3 3.6.4L12 1.8z"/><path fill="#fff" d="M10.6 15.6l-3-3 1.5-1.5 1.5 1.5 4.3-4.3 1.5 1.5-5.8 5.8z"/></svg></span>';

/* ---------- LIKES ---------- */
const LIKES = [
  { name: 'Maya',  age: 26, role: 'Marketing Manager', dist: '0 miles away', tag: 'new nearby', verified: true },
  { name: 'Jordan',age: 29, role: 'Product Designer',  dist: '2 miles away', tag: 'nearby',     verified: false },
  { name: 'Lena',  age: 27, role: 'Photographer',      dist: '3 miles away', tag: 'new',        verified: true },
  { name: 'Sophie',age: 28, role: 'Yoga Instructor',   dist: '2 miles away', tag: 'similar',    verified: false },
  { name: 'Tessa', age: 25, role: 'UX Researcher',     dist: '5 miles away', tag: 'new similar',verified: true }
];
const likeList = $('#likeList');
function renderLikes(filter) {
  const items = LIKES.filter(p => filter === 'all' || p.tag.includes(filter));
  likeList.innerHTML = items.length ? items.map((p, i) => `
    <div class="like-row" style="animation-delay:${i * 70}ms">
      <img class="like-photo" src="${AV(p.name)}" alt="${p.name}">
      <div class="like-meta">
        <div class="like-name">${p.name}, ${p.age}${p.verified ? VERIFIED : ''}</div>
        <div class="like-role">${p.role}</div>
        <div class="like-dist">${p.dist}</div>
      </div>
      <button class="like-btn" data-like="${p.name}" aria-label="Like ${p.name} back"><svg viewBox="0 0 24 24" fill="none"><path d="M12 20s-6.8-4.6-9.1-9.5C1.9 7.4 4.6 4.7 7.4 4.7c1.8 0 3.3 1 4.6 2.3 1.3-1.3 2.8-2.3 4.6-2.3 2.8 0 5.5 2.7 4.5 5.8C18.8 15.4 12 20 12 20z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" fill="currentColor" fill-opacity=".92"/></svg></button>
    </div>`).join('') : `<div class="empty-state"><h3>Nothing here yet</h3><p>Check back soon — people like you every day.</p></div>`;
}
renderLikes('all');
$('#likeTabs').addEventListener('click', e => {
  const btn = e.target.closest('[data-like-filter]'); if (!btn) return;
  $$('#likeTabs .tab-chip').forEach(t => t.classList.toggle('active', t === btn));
  renderLikes(btn.dataset.likeFilter);
});
likeList.addEventListener('click', e => {
  const btn = e.target.closest('[data-like]'); if (!btn) return;
  btn.classList.toggle('liked');
  showToast(btn.classList.contains('liked') ? 'It’s mutual — say hello while the moment is warm.' : 'Like removed.');
});
$('#likesFilter').addEventListener('click', () => showToast('Spotlight: whoever likes you most right now'));

/* ---------- MESSAGES ---------- */
const STORIES = ['Maya', 'Jordan', 'Lena', 'Sophie'];
$('#storyRow').innerHTML = `
  <button class="story-item" id="yourStoryBtn" aria-label="Add to your story">
    <span class="story-add">+</span><span>Your story</span>
  </button>` + STORIES.map(n => `
  <button class="story-item" data-chat="${n}" aria-label="Open ${n}">
    <span class="story-ring"><img src="${AV(n)}" alt="${n}"></span><span>${n}</span>
  </button>`).join('');
$('#yourStoryBtn').addEventListener('click', () => showToast('Add to your story — camera / library (demo)'));

const THREADS = [
  { name: 'Maya',  snippet: 'That hike last weekend was…',          time: '9:24 PM',  unread: 2 },
  { name: 'Jordan',snippet: 'Sounds perfect! I love that spot.',    time: '6:41 PM',  unread: 1 },
  { name: 'Lena',  snippet: 'Sunset this weekend? ☀️',              time: 'Yesterday', gold: true },
  { name: 'Sophie',snippet: 'Haha that’s so true!',                 time: 'Yesterday' },
  { name: 'Tessa', snippet: 'You: Completely agree!',               time: 'May 8' },
  { name: 'Chris', snippet: 'Let’s grab a matcha sometime?',        time: 'May 7' },
  { name: 'Noah',  snippet: 'You: Great chat today!',               time: 'May 6' },
  { name: 'Elena', snippet: 'Shared a photo 📷',                    time: 'May 6' }
];
const threadList = $('#threadList');
function renderThreads(filter) {
  const q = (filter || '').trim().toLowerCase();
  const items = THREADS.filter(t => !q || t.name.toLowerCase().includes(q) || t.snippet.toLowerCase().includes(q));
  threadList.innerHTML = items.length ? items.map(t => `
    <button class="thread-row ${t.unread ? 'unread' : ''}" data-chat="${t.name}">
      <img class="thread-avatar" src="${AV(t.name)}" alt="${t.name}">
      <span class="thread-meta">
        <span class="thread-top"><b>${t.name}</b><time>${t.time}</time></span>
        <span class="thread-snippet"><p>${t.snippet}</p>${t.unread ? `<span class="unread-pill">${t.unread}</span>` : t.gold ? '<span class="gold-dot">☀️</span>' : ''}</span>
      </span>
    </button>`).join('') : `<div class="empty-state"><h3>No results for “${filter}”</h3><p>Try a different name or thread.</p></div>`;
}
renderThreads('');
$('#msgFilter').addEventListener('input', e => renderThreads(e.target.value));
$('#msgSearch').addEventListener('click', () => $('#msgFilter').focus());
$('#msgCompose').addEventListener('click', () => showToast('New message — pick someone from Likes or your matches'));
document.addEventListener('click', e => {
  const t = e.target.closest('[data-chat]');
  if (t) openChat(t.dataset.chat);
});

/* ---------- CHAT ---------- */
const chatBody = $('#chatBody');
const chatName = $('#chatName');
const chatAvatar = $('#chatAvatar');
const typing = $('#typingIndicator');
let currentChat = 'Maya';
const SCRIPTED = [
  { cls: 'in',  text: 'That hike last weekend was exactly what I needed 🌿' },
  { cls: 'out', text: 'Right? The view at the top was unreal.' },
  { cls: 'in',  text: 'We should find another trail before it gets too cold.' },
  { cls: 'out', text: 'I’m in. Maybe Saturday morning?' }
];
function bubbleHTML(m) { return `<div class="bubble ${m.cls}">${m.text}</div>`; }
function openChat(name) {
  currentChat = name;
  chatName.textContent = name;
  chatAvatar.src = AV(name);
  chatAvatar.alt = name;
  chatBody.innerHTML = '<div class="chat-day">TODAY</div>';
  if (name === 'Maya') {
    SCRIPTED.forEach(m => chatBody.insertAdjacentHTML('beforeend', bubbleHTML(m)));
    chatBody.insertAdjacentHTML('beforeend', '<div class="typing show" id="typingIndicator"><i></i><i></i><i></i></div>');
  } else {
    chatBody.insertAdjacentHTML('beforeend', bubbleHTML({ cls: 'out', text: `Hey ${name} — I really liked your profile.` }));
    chatBody.insertAdjacentHTML('beforeend', '<div class="typing show" id="typingIndicator"><i></i><i></i><i></i></div>');
  }
  chatBody.scrollTop = chatBody.scrollHeight;
  go('chat');
}
const REPLIES = [
  'That sounds perfect. Saturday morning works for me.',
  'Ha — I was hoping you’d say that.',
  'Deal. I know a trail with the best sunrise view.',
  'Good choice. I’ll bring the matcha.'
];
let replyIdx = 0;
$('#chatForm').addEventListener('submit', e => {
  e.preventDefault();
  const input = $('#chatInput');
  const text = input.value.trim(); if (!text) return;
  const t = $('#typingIndicator'); if (t) t.remove();
  chatBody.insertAdjacentHTML('beforeend', bubbleHTML({ cls: 'out', text: escapeHTML(text) }));
  input.value = '';
  chatBody.insertAdjacentHTML('beforeend', '<div class="typing show" id="typingIndicator"><i></i><i></i><i></i></div>');
  chatBody.scrollTop = chatBody.scrollHeight;
  setTimeout(() => {
    const t2 = $('#typingIndicator'); if (t2) t2.remove();
    chatBody.insertAdjacentHTML('beforeend', bubbleHTML({ cls: 'in', text: REPLIES[replyIdx++ % REPLIES.length] }));
    chatBody.scrollTop = chatBody.scrollHeight;
  }, 1600);
});
$('#chatPlus').addEventListener('click', () => showToast('Share photos, voice notes and your vibe (demo)'));
$('#chatMore').addEventListener('click', () => showToast('Mute, block or report — always in your control'));
function escapeHTML(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* ---------- DISCOVER deck ---------- */
const deckCard = $('#deckCard');
const deckEmpty = $('#deckEmpty');
$('#passBtn').addEventListener('click', () => {
  deckCard.classList.add('leaving');
  setTimeout(() => { deckCard.classList.add('hidden'); deckEmpty.classList.remove('hidden'); }, 330);
});
$('#deckReset').addEventListener('click', () => {
  deckCard.classList.remove('leaving', 'hidden');
  deckEmpty.classList.add('hidden');
});
$('#cardLike').addEventListener('click', function () { this.classList.toggle('liked'); showToast(this.classList.contains('liked') ? 'Added to your likes.' : 'Removed from your likes.'); });
$('#sparkBtn').addEventListener('click', () => showToast('Spark sent — if Aria feels it too, it’s a match.'));
$('#sayHelloBtn').addEventListener('click', () => { showToast('Opening a conversation with Aria…'); openChat('Aria'); });
$('#notifBell').addEventListener('click', () => go('notifications'));
$('#pdFab').addEventListener('click', function () { this.classList.toggle('liked'); showToast('You liked Aria. We’ll tell you if it’s mutual.'); });
$('#pdPass').addEventListener('click', () => { go('discover'); showToast('Passed.'); });
$('#pdSpark').addEventListener('click', () => showToast('Spark sent — if Aria feels it too, it’s a match.'));
$('#pdHello').addEventListener('click', () => { showToast('Opening a conversation with Aria…'); openChat('Aria'); });
$('#pdMore').addEventListener('click', () => showToast('Share, report or hide Aria’s profile'));

/* ---------- NOTIFICATIONS ---------- */
const NOTIFS = [
  { type: 'like',    icon: 'rose',   title: 'Maya liked your profile',  sub: '2 minutes ago',                              who: 'Maya' },
  { type: 'like',    icon: 'rose',   title: 'Jordan liked your profile',sub: '12 minutes ago',                             who: 'Jordan' },
  { type: 'message', icon: 'green',  title: 'Sophie sent you a message',sub: '“that hike was so true” · 1 hour ago',       who: 'Sophie' },
  { type: 'match',   icon: 'rose',   title: 'You and Tessa matched!',   sub: '3 hours ago',                                who: 'Tessa' },
  { type: 'like',    icon: 'purple', title: 'Your profile got 25 new views', sub: '5 hours ago',                             view: true },
  { type: 'system',  icon: 'gold',   title: 'New people near you',      sub: 'Check out 6 new profiles in Brooklyn · 1 day ago' }
];
const ICONS = {
  rose:   '<svg viewBox="0 0 24 24" fill="none"><path d="M12 20s-6.8-4.6-9.1-9.5C1.9 7.4 4.6 4.7 7.4 4.7c1.8 0 3.3 1 4.6 2.3 1.3-1.3 2.8-2.3 4.6-2.3 2.8 0 5.5 2.7 4.5 5.8C18.8 15.4 12 20 12 20z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  green:  '<svg viewBox="0 0 24 24" fill="none"><path d="M8 10h8M8 13.5h5M21 12c0 4-4 7-9 7a9.6 9.6 0 01-4-.8L3 20l1.6-4.2A7.4 7.4 0 013 12c0-4 4-7 9-7s9 3 9 7z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  purple: '<svg viewBox="0 0 24 24" fill="none"><path d="M2.5 12S6.5 6.3 12 6.3 21.5 12 21.5 12 17.5 17.7 12 17.7 2.5 12 2.5 12z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/></svg>',
  gold:   '<svg viewBox="0 0 24 24" fill="none"><path d="M18 9a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 19a2.2 2.2 0 004 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
};
const notifList = $('#notifList');
const notifEmpty = $('#notifEmpty');
let notifFilter = 'all';
function renderNotifs() {
  const items = NOTIFS.filter(n => notifFilter === 'all' || n.type === notifFilter);
  notifList.innerHTML = items.map((n, i) => `
    <div class="notif-row" style="animation-delay:${i * 60}ms">
      <span class="notif-ic ${n.icon}">${ICONS[n.icon]}</span>
      <div class="notif-text"><b>${n.title}</b><small>${n.sub}</small></div>
      ${n.who ? `<img class="notif-thumb" src="${AV(n.who)}" alt="${n.who}">` : ''}
    </div>`).join('');
  notifEmpty.classList.toggle('hidden', items.length > 0);
}
renderNotifs();
$('#notifTabs').addEventListener('click', e => {
  const btn = e.target.closest('[data-notif-filter]'); if (!btn) return;
  notifFilter = btn.dataset.notifFilter;
  $$('#notifTabs .tab-chip').forEach(t => t.classList.toggle('active', t === btn));
  renderNotifs();
});
$('#clearAllBtn').addEventListener('click', () => { NOTIFS.length = 0; notifFilter = 'all'; renderNotifs(); showToast('Notifications cleared.'); });

/* ---------- MATCHES ---------- */
const NEW_MATCHES = [
  { name: 'Maya',  time: '2 hours ago' },
  { name: 'Jordan',time: 'Yesterday' },
  { name: 'Lena',  time: '2 days ago' },
  { name: 'Sophie',time: '3 days ago' }
];
$('#newMatches').innerHTML = NEW_MATCHES.map(m => `
  <button class="match-card" data-chat="${m.name}">
    <img src="${AV(m.name)}" alt="${m.name}">
    <b>${m.name}</b><span>${m.time}</span>
  </button>`).join('');
$('#matchSayHello').addEventListener('click', () => { showToast('Opening a conversation with Tessa…'); openChat('Tessa'); });

/* ---------- PRIVACY toggles ---------- */
const TOGGLES = [
  { key: 'distance',    label: 'Show my distance',  note: 'Approximate distance only',        on: true },
  { key: 'active',      label: 'Show active status',note: 'Recent activity, never exact location', on: true },
  { key: 'discoverable',label: 'Discoverable',      note: 'Appear in other members’ decks',    on: true },
  { key: 'receipts',    label: 'Read receipts',     note: 'Let matches know when you’ve read', on: false }
];
const toggleList = $('#toggleList');
toggleList.innerHTML = TOGGLES.map(t => `
  <div class="toggle-row">
    <div class="toggle-text"><b>${t.label}</b><small>${t.note}</small></div>
    <button class="toggle ${t.on ? 'on' : ''}" role="switch" aria-checked="${t.on}" aria-label="${t.label}" data-toggle="${t.key}"></button>
  </div>`).join('');
toggleList.addEventListener('click', e => {
  const btn = e.target.closest('[data-toggle]'); if (!btn) return;
  btn.classList.toggle('on');
  btn.setAttribute('aria-checked', btn.classList.contains('on'));
});
$('#safetyCenterBtn').addEventListener('click', () => showToast('Safety center — block, report and review protections (demo)'));
$('#blockedBtn').addEventListener('click', () => showToast('You haven’t blocked anyone yet.'));

/* ---------- SETTINGS ---------- */
$('#logoutBtn').addEventListener('click', () => showToast('Logged out (demo). See you soon, Aria.'));

/* ---------- PREFERENCES ---------- */
const ageMin = $('#ageMin'), ageMax = $('#ageMax'), ageFill = $('#ageFill'), ageLabel = $('#ageLabel');
const distRange = $('#distRange'), distFill = $('#distFill'), distLabel = $('#distLabel');
function syncAge() {
  let a = +ageMin.value, b = +ageMax.value;
  if (a > b - 1) { if (document.activeElement === ageMin) { a = b - 1; ageMin.value = a; } else { b = a + 1; ageMax.value = b; } }
  const lo = ((a - 18) / 42) * 100, hi = ((b - 18) / 42) * 100;
  ageFill.style.left = lo + '%'; ageFill.style.width = (hi - lo) + '%';
  ageLabel.textContent = `${a} – ${b}`;
}
function syncDist() {
  distFill.style.width = distRange.value + '%';
  distLabel.textContent = `Within ${distRange.value} miles`;
}
ageMin.addEventListener('input', syncAge); ageMax.addEventListener('input', syncAge); distRange.addEventListener('input', syncDist);
syncAge(); syncDist();
[['#lookingForPills'], ['#showMePills']].forEach(([sel]) => {
  $(sel).addEventListener('click', e => {
    const b = e.target.closest('.pref-pill'); if (!b) return;
    $$('.pref-pill', $(sel)).forEach(p => p.classList.toggle('selected', p === b));
  });
});
$('#interestChips').addEventListener('click', e => {
  const b = e.target.closest('.i-chip'); if (!b) return;
  if (b.id === 'addInterestBtn') { showToast('Suggested: ceramics, live jazz, slow mornings (demo)'); return; }
  b.classList.toggle('on');
});
$('#savePrefsBtn').addEventListener('click', () => showToast('Preferences saved.'));

/* ---------- PREMIUM ---------- */
const FEATURES = ['See who likes you', 'Unlimited likes', 'Advanced filters', 'See profile views', 'Priority in discovery', 'Read receipts', 'Incognito mode'];
$('#featureGrid').innerHTML = FEATURES.map(f => `<div class="feature-item"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#e9c37c"/><path d="M8.3 12.4l2.5 2.5 4.9-5.1" stroke="#241a10" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg><span>${f}</span></div>`).join('');
let selectedPlan = { len: '3 months', price: '$14.99' };
$('#planRow').addEventListener('click', e => {
  const card = e.target.closest('.plan-card'); if (!card) return;
  $$('.plan-card').forEach(c => c.classList.toggle('selected', c === card));
  selectedPlan = { len: card.dataset.plan, price: card.dataset.price };
});
$('#upgradeBtn').addEventListener('click', () => showToast(`Welcome to Premium — ${selectedPlan.len} at ${selectedPlan.price}/mo (demo)`));

/* ---------- ONBOARDING ---------- */
$('#intentList').addEventListener('click', e => {
  const card = e.target.closest('.option-card'); if (!card) return;
  $$('.option-card').forEach(c => c.classList.toggle('selected', c === card));
});
$('#onboardContinue').addEventListener('click', () => {
  const pick = ($('.option-card.selected .option-text b') || {}).textContent || 'Something real';
  showToast(`Got it — “${pick}”. Finding your people…`);
  setTimeout(() => go('discover'), 350);
});

/* ---------- WELCOME ---------- */
$('#tabSignin').addEventListener('click', () => { $('#tabSignin').classList.add('active'); $('#tabCreate').classList.remove('active'); });
$('#tabCreate').addEventListener('click', () => { $('#tabCreate').classList.add('active'); $('#tabSignin').classList.remove('active'); });
$('#authContinue').addEventListener('click', () => {
  const email = $('#authEmail').value.trim(), pass = $('#authPass').value.trim();
  if (!email || !pass) { showToast('Enter your email and password to continue.'); return; }
  showToast($('#tabCreate').classList.contains('active') ? 'Welcome to Freeborn.' : 'Welcome back.');
  setTimeout(() => go('onboarding'), 350);
});

/* ---------- VERIFICATION ---------- */
$('#startVerifyBtn').addEventListener('click', function () {
  const btn = this, frame = $('#faceFrame'), hint = $('#faceHint');
  btn.disabled = true; btn.textContent = 'Scanning… hold still';
  frame.classList.add('scanning'); hint.textContent = 'Keep your face centered';
  setTimeout(() => {
    frame.classList.remove('scanning');
    hint.textContent = 'Match confirmed';
    btn.textContent = 'You’re verified';
    showToast('Verification complete — you’re the real thing.');
  }, 1800);
});

/* ---------- MY PROFILE misc ---------- */
$('#photoAddTile').addEventListener('click', () => showToast('Camera / library picker (demo)'));
$('#allPhotosBtn').addEventListener('click', () => showToast('All 6 photos (demo)'));
$('#editProfileBtn').addEventListener('click', () => showToast('Edit profile — demo'));
$('#viewProfileBtn').addEventListener('click', () => showToast('This is how others see you'));

/* ---------- boot ---------- */
const initial = (location.hash.replace('#/', '') || 'discover');
go(screens.some(s => s.dataset.screen === initial) ? initial : 'discover');
