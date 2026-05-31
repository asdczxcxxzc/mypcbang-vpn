// ============ 설정 ============
const API_BASE = window.API_BASE || 'http://localhost:3000';
const IN_WEBVIEW = !!(window.chrome && window.chrome.webview);
let token = '';
let selectedGame = null;
let connected = false, curGameName = null, curStop = null;
let hbTimer = null;
const $ = (s) => document.querySelector(s);

// ============ C++ 브리지 ============
function bridge(action, payload) {
  return new Promise((resolve, reject) => {
    if (!IN_WEBVIEW) return reject(new Error('no-bridge'));
    const id = Math.random().toString(36).slice(2);
    const handler = (e) => {
      const m = e.data;
      if (m && m.__id === id) {
        window.chrome.webview.removeEventListener('message', handler);
        if (m.ok) resolve(m.data); else reject({ status: m.status, data: m.error });
      }
    };
    window.chrome.webview.addEventListener('message', handler);
    window.chrome.webview.postMessage({ __id: id, action, payload });
  });
}
async function api(path, method = 'GET', body) {
  if (IN_WEBVIEW) return bridge('api', { path, method, body });
  const res = await fetch(API_BASE + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text(); const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw { status: res.status, data };
  return data;
}

// ============ 유틸 ============
function fmtTime(sec) {
  if (sec == null) return '-';
  if (sec <= 0) return '0' + (lang === 'ko' ? '분' : lang === 'zh' ? '分' : 'm');
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  const H = lang === 'ko' ? '시간 ' : lang === 'zh' ? '小时' : 'h ', M = lang === 'ko' ? '분' : lang === 'zh' ? '分' : 'm';
  if (h > 0) return `${h}${H}${m}${M}`; if (m > 0) return `${m}${M}`;
  return `${sec}${lang === 'ko' ? '초' : lang === 'zh' ? '秒' : 's'}`;
}
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.remove('hidden'); el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.classList.add('hidden'), 250); }, 2200); }
let popupYes = null;
function popup(title, msg) { popupYes = null; $('#popupCancel').classList.add('hidden'); $('#popupTitle').textContent = title; $('#popupMsg').textContent = msg; $('#popup').classList.remove('hidden'); }
function confirmDlg(title, msg, onYes) { popupYes = onYes; $('#popupCancel').classList.remove('hidden'); $('#popupTitle').textContent = title; $('#popupMsg').textContent = msg; $('#popup').classList.remove('hidden'); }

// ============ 언어 ============
$('#langSelect').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setLang(b.dataset.lang); });
window.onLangChanged = () => {
  if (!$('#app').classList.contains('hidden')) { updateVpnUi(connected, curGameName); loadStatus(); loadGames(); }
  if (!$('#warnModal').classList.contains('hidden')) buildWarnSlides();
};

// ============ 로그인 ============
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('#lid').value.trim(), pw = $('#lpw').value;
  $('#loginErr').classList.add('hidden');
  try {
    const r = await api('/auth/login', 'POST', { username: id, password: pw });
    // 차단/정지 계정은 입장 막고 팝업
    if (r.user && r.user.blocked) { if (IN_WEBVIEW) { try { await bridge('logout'); } catch {} } popup(t('acc_blocked_title'), t('acc_blocked_msg')); return; }
    if (r.user && r.user.suspended) { if (IN_WEBVIEW) { try { await bridge('logout'); } catch {} } popup(t('acc_suspended_title'), t('acc_suspended_msg')); return; }
    if (!IN_WEBVIEW) token = r.accessToken;
    // 자동 로그인: 체크 시 토큰을 C++가 DPAPI로 암호화 저장
    const remember = $('#rememberChk').checked;
    localStorage.setItem('remember', remember ? '1' : '0');
    if (IN_WEBVIEW) { try { await bridge(remember ? 'remember-session' : 'forget-session'); } catch {} }
    enterApp(r.user ? r.user.username : id);
  } catch (err) {
    const d = err.data || {};
    const code = d.code || d.message?.code;
    const msg = (d.message && d.message.message) || d.message || t('conn_fail');
    if (code === 'LOCKED') { popup(t('locked_title'), typeof msg === 'string' ? msg : t('conn_fail')); return; }
    showLoginErr(typeof msg === 'string' ? msg : t('conn_fail'));
  }
});

// 강제 로그아웃 (차단/정지/다른 기기 로그인) — 터널 해제 + 로그인 화면 + 팝업
function forceLogout(reason) {
  stopHeartbeat(); stopPolling();
  connected = false; curGameName = null; selectedGame = null; token = '';
  if (IN_WEBVIEW) { try { bridge('logout'); } catch {} }
  $('#app').classList.add('hidden'); $('#login').classList.remove('hidden');
  const M = { blocked: ['acc_blocked_title', 'acc_blocked_msg'], suspended: ['acc_suspended_title', 'acc_suspended_msg'], session: ['session_title', 'session_msg'] };
  const [tt, tm] = M[reason] || M.session;
  popup(t(tt), t(tm));
}
function showLoginErr(m) { const e = $('#loginErr'); e.textContent = m; e.classList.remove('hidden'); }

function enterApp(name) {
  $('#login').classList.add('hidden');
  const app = $('#app'); app.classList.remove('hidden'); app.classList.add('enter');
  $('#uName').textContent = name; $('#heroName').textContent = name;
  $('#uAvatar').textContent = (name[0] || 'M').toUpperCase();
  refreshAll();
  startPolling();   // 이용권/시간/정지 등 실시간 반영
}
function refreshAll() { return Promise.all([loadStatus(), loadGames(), loadUsage()]); }

// ============ 사용 시간 그래프 ============
async function loadUsage() {
  try { const data = await api('/me/usage'); renderChart($('#usageChart'), data); } catch {}
}
function renderChart(el, data) {
  if (!el || !data || !data.length) return;
  const W = 300, H = 120, pad = 8, base = H - 22;
  const max = Math.max(1, ...data.map((d) => d.minutes));
  const n = data.length;
  const xs = (i) => pad + (i * (W - pad * 2)) / (n - 1);
  const ys = (v) => 14 + (base - 14) * (1 - v / max);
  const pts = data.map((d, i) => [xs(i), ys(d.minutes)]);
  // 부드러운 곡선 (Catmull-Rom → 베지어)
  let path = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    path += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]}`;
  }
  const area = path + ` L ${pts[n - 1][0]} ${base} L ${pts[0][0]} ${base} Z`;
  const peak = data.reduce((a, b, i) => (b.minutes > data[a].minutes ? i : a), 0);
  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:130px">
      <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--accent)" stop-opacity=".42"/>
        <stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
      </linearGradient></defs>
      <path d="${area}" fill="url(#cg)"/>
      <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round"/>
      ${data[peak].minutes > 0 ? `<circle cx="${pts[peak][0]}" cy="${pts[peak][1]}" r="3.5" fill="var(--accent)"/>` : ''}
      ${data.map((d, i) => `<text x="${xs(i)}" y="${H - 4}" fill="var(--dim)" font-size="8" text-anchor="middle">${d.label}</text>`).join('')}
    </svg>`;
}

// ============ 상태 ============
async function loadStatus() {
  try {
    const s = await api('/me/status');
    // 차단/정지되면 즉시 강제 로그아웃 + 팝업
    if (s.blocked) return forceLogout('blocked');
    if (s.suspended) return forceLogout('suspended');
    connected = s.connected; curGameName = s.currentGame;
    $('#uTime').textContent = s.planType ? fmtTime(s.remainingSeconds) + ' ' + t('remain_suffix') : t('no_plan');
    $('#kvPlan').textContent = s.planType === 'time' ? t('plan_time') : s.planType === 'monthly' ? t('plan_monthly') : t('plan_none');
    $('#kvRemain').textContent = s.planType === 'monthly' ? (s.expiresAt ? new Date(s.expiresAt).toLocaleDateString() + ' ' + t('until') : '-') : fmtTime(s.remainingSeconds);
    curStop = s.stop || null;
    if (s.stop) { $('#kvStopRow').classList.remove('hidden'); $('#kvStop').textContent = `${s.stop.stopsRemaining}${t('times')}${s.stop.timePenalty ? ' (' + t('penalty') + ')' : ''}`; }
    else $('#kvStopRow').classList.add('hidden');
    updateVpnUi(s.connected, s.currentGame);
  } catch (err) {
    // 401 = 토큰 무효(다른 기기 로그인 등) → 강제 로그아웃
    if (err && err.status === 401 && !$('#app').classList.contains('hidden')) forceLogout('session');
  }
}

async function loadGames(animate = true) {
  try {
    const games = await api('/me/games');
    const grid = $('#gameGrid'); grid.innerHTML = '';
    games.forEach((g, i) => {
      const el = document.createElement('button');
      el.className = 'game-card' + (animate ? ' pop-in' : '') + (g.available ? '' : ' full') + (selectedGame?.id === g.id ? ' selected' : '');
      if (animate) el.style.animationDelay = (i * 0.03) + 's';
      el.disabled = !g.available && selectedGame?.id !== g.id;
      el.innerHTML =
        `<div class="game-img" ${g.image ? `style="background-image:url('img/${g.image}')"` : ''}></div>
         <div class="game-shade"></div>
         <div class="game-info">
           <div class="gname">${gameName(g.name)}</div>
           <div>${g.available ? `<span class="badge ok">${t('slot_open')}</span>` : `<span class="badge full">${t('slot_full')}</span>`}</div>
         </div>`;
      el.onclick = () => { if (!g.available) return; selectedGame = { id: g.id, name: g.name }; loadGames(); updateVpnUi(connected, curGameName); };
      grid.appendChild(el);
    });
  } catch {}
}

// ============ VPN ON/OFF ============
function updateVpnUi(isOn, gName) {
  $('#statusRing').classList.toggle('on', isOn);
  $('#statusLabel').textContent = isOn ? t('connected') : t('disconnected');
  $('#statusGame').textContent = isOn && gName ? gameName(gName) : (selectedGame ? gameName(selectedGame.name) + ' ' + t('selected') : t('no_game'));
  $('#vpnBtnText').textContent = isOn ? t('vpn_off') : t('vpn_on');
  $('#vpnState').textContent = isOn ? t('protected') : '';
  $('#vpnState').style.color = 'var(--accent)';
  $('#vpnBtn').classList.toggle('on', isOn);
}

$('#vpnBtn').addEventListener('click', () => {
  if (connected) {
    // 남은 정지 횟수 0이면 한번 더 확인
    if (curStop && curStop.stopsRemaining === 0) { confirmDlg(t('stop0_title'), t('stop0_msg'), () => vpnOff()); return; }
    return vpnOff();
  }
  if (!selectedGame) return toast(t('pick_game_first'));
  showWarning();   // 경고 3슬라이드 → 확인 시 doConnect()
});

// 실제 연결 (경고 확인 후)
async function doConnect() {
  try {
    const r = await api('/me/connect', 'POST', { gameId: selectedGame.id });
    // VPN 다이얼 실패 (공유기 접속 불가)
    if (r.dialed === false) {
      popup(t('conn_fail'), t('conn_fail_msg'));
      return;
    }
    connected = true; curGameName = r.game;
    updateVpnUi(true, r.game); startHeartbeat();
    toast(`${gameName(r.game)} ${t('conn_done')}`); loadStatus();
  } catch (err) {
    const d = err.data?.message; const code = d?.code || err.data?.code;
    const msg = (d && d.message) || d || '';
    if (err.status === 409 && (code === 'NO_SLOT' || String(msg).includes('자리') || String(msg).toLowerCase().includes('slot'))) popup(t('noslot_title'), t('noslot_msg'));
    else popup(t('conn_fail'), msg || t('conn_fail_msg'));
  }
}

// ===== 혜택받기 경고 슬라이더 =====
const WARN_ICONS = [
  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M12 3v9"/><path d="M6.4 6.4a8 8 0 1 0 11.2 0"/></svg>',
  '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
];
let warnIdx = 0;
function buildWarnSlides() {
  const track = $('#warnTrack'); track.innerHTML = '';
  const dots = $('#warnDots'); dots.innerHTML = '';
  [1, 2, 3].forEach((n, i) => {
    const s = document.createElement('div'); s.className = 'warn-slide';
    s.innerHTML = `<div class="warn-ico">${WARN_ICONS[i]}</div><h4>${t('warn_t' + n)}</h4><p>${t('warn' + n)}</p>`;
    track.appendChild(s);
    const dot = document.createElement('i'); dot.onclick = () => warnGo(i); dots.appendChild(dot);
  });
  warnGo(0);
}
function warnGo(i) {
  warnIdx = Math.max(0, Math.min(2, i));
  $('#warnTrack').style.transform = `translateX(-${warnIdx * 100}%)`;
  [...$('#warnDots').children].forEach((d, k) => d.classList.toggle('active', k === warnIdx));
  $('#warnPrev').disabled = warnIdx === 0;
  $('#warnNext').disabled = warnIdx === 2;
}
function showWarning() {
  buildWarnSlides();
  $('#warnChk').checked = false; $('#warnOk').disabled = true;
  $('#warnModal').classList.remove('hidden');
}
$('#warnPrev').addEventListener('click', () => warnGo(warnIdx - 1));
$('#warnNext').addEventListener('click', () => warnGo(warnIdx + 1));
$('#warnChk').addEventListener('change', (e) => { $('#warnOk').disabled = !e.target.checked; });
$('#warnOk').addEventListener('click', () => { if (!$('#warnChk').checked) return; $('#warnModal').classList.add('hidden'); doConnect(); });
async function vpnOff() {
  try { await api('/me/disconnect', 'POST'); } catch {}
  connected = false; curGameName = null; stopHeartbeat(); updateVpnUi(false); loadStatus();
}
function startHeartbeat() {
  stopHeartbeat();
  hbTimer = setInterval(async () => {
    try {
      const r = await api('/me/heartbeat', 'POST');
      if (r.expired) { popup(t('expired_title'), t('expired_msg')); vpnOff(); return; }
      if (r.remainingSeconds != null) { $('#kvRemain').textContent = fmtTime(r.remainingSeconds); $('#uTime').textContent = fmtTime(r.remainingSeconds) + ' ' + t('remain_suffix'); }
      if (r.stop) { curStop = r.stop; $('#kvStop').textContent = `${r.stop.stopsRemaining}${t('times')}${r.stop.timePenalty ? ' (' + t('penalty') + ')' : ''}`; }
    } catch (e) { if (e.status === 400) vpnOff(); }
  }, 30000);
}
function stopHeartbeat() { if (hbTimer) clearInterval(hbTimer); hbTimer = null; }

// 로그인 상태에서 상태를 주기적으로 갱신 → 관리자 이용권 부여/충전/정지수정/차단이
// 프로그램 재시작 없이 실시간(수 초 내) 반영됨.
let pollTimer = null, pollN = 0;
function startPolling() {
  stopPolling(); pollN = 0;
  pollTimer = setInterval(() => {
    if ($('#app').classList.contains('hidden')) return;   // 로그아웃 상태면 skip
    loadStatus();
    if (pollN++ % 5 === 0) loadGames(false);              // 자리(가용) 갱신은 천천히(애니메이션 없이)
  }, 6000);
}
function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

$('#navLogout').addEventListener('click', async () => { if (connected) await vpnOff(); stopPolling(); token = ''; selectedGame = null; if (IN_WEBVIEW) { try { await bridge('logout'); } catch {} } $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); });
$('#popupClose').addEventListener('click', () => { $('#popup').classList.add('hidden'); const fn = popupYes; popupYes = null; if (fn) fn(); });
$('#popupCancel').addEventListener('click', () => { popupYes = null; $('#popup').classList.add('hidden'); });

// 창 컨트롤
$('#winClose').addEventListener('click', () => { if (IN_WEBVIEW) bridge('window', 'close'); });
$('#winMin').addEventListener('click', () => { if (IN_WEBVIEW) bridge('window', 'minimize'); });
// 창 드래그 — 빈 영역(.dragzone)을 누르면 이동. 인터랙티브 요소는 제외.
document.addEventListener('mousedown', (e) => {
  if (!IN_WEBVIEW || e.button !== 0) return;
  if (e.target.closest('input,textarea,select,button,a,label,.game-card,.swatch,.palette,.modal,.traffic,.user-chip')) return;
  if (e.target.closest('.dragzone')) bridge('window', 'drag');
});

// ============ 테마(색상/라디우스) ============
const PRESETS = ['#ff5fa8', '#4f8cff', '#37d39b', '#ffb648', '#a06bff', '#ff6b5d', '#16e0c0', '#ffffff'];
function applyTheme(t2) {
  if (t2.accent) { document.documentElement.style.setProperty('--accent', t2.accent); document.documentElement.style.setProperty('--accent-2', lighten(t2.accent, 22)); }
  if (t2.radius != null) { document.documentElement.style.setProperty('--radius', t2.radius + 'px'); document.documentElement.style.setProperty('--radius-sm', Math.max(8, t2.radius - 8) + 'px'); $('#radiusVal').textContent = t2.radius + 'px'; $('#radiusRange').value = t2.radius; }
}
function lighten(hex, amt) { const n = parseInt(hex.slice(1), 16); let r = Math.min(255, (n >> 16) + amt), g = Math.min(255, ((n >> 8) & 255) + amt), b = Math.min(255, (n & 255) + amt); return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0'); }
let theme = JSON.parse(localStorage.getItem('theme') || '{"accent":"#ff5fa8","radius":26}');
applyTheme(theme);
function saveTheme() { localStorage.setItem('theme', JSON.stringify(theme)); }
function buildPalette() {
  const p = $('#palette'); p.innerHTML = '';
  PRESETS.forEach((c) => { const sw = document.createElement('div'); sw.className = 'swatch' + (c.toLowerCase() === theme.accent.toLowerCase() ? ' active' : ''); sw.style.background = c; sw.onclick = () => { theme.accent = c; applyTheme(theme); saveTheme(); buildPalette(); }; p.appendChild(sw); });
}
function openSettings() { buildPalette(); $('#customColor').value = theme.accent; $('#settingsModal').classList.remove('hidden'); }
$('#paletteBtn').addEventListener('click', openSettings);
$('#navSettings').addEventListener('click', openSettings);
$('#settingsClose').addEventListener('click', () => $('#settingsModal').classList.add('hidden'));
$('#customColor').addEventListener('input', (e) => { theme.accent = e.target.value; applyTheme(theme); saveTheme(); buildPalette(); });
$('#radiusRange').addEventListener('input', (e) => { theme.radius = +e.target.value; applyTheme(theme); saveTheme(); });

// ============ 시작 ============
setLang(lang); // i18n 적용 + 언어버튼 활성화
$('#rememberChk').checked = localStorage.getItem('remember') === '1';

// 자동 로그인: 저장된 세션(DPAPI 토큰)이 유효하면 바로 입장
if (IN_WEBVIEW) {
  bridge('try-autologin').then((u) => { if (u && u.username) enterApp(u.username); }).catch(() => {});
}

// (개발용) 자동 로그인 — ?u=&p= (스크린샷 검증용: 애니메이션 즉시완료)
(function () { const q = new URLSearchParams(location.search); const u = q.get('u'), p = q.get('p'); if (u && p) { document.documentElement.classList.add('no-anim'); $('#lid').value = u; $('#lpw').value = p; $('#loginForm').dispatchEvent(new Event('submit')); } })();

// C++ → JS 이벤트
if (IN_WEBVIEW) {
  window.chrome.webview.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.event === 'duplicate') popup(t('dup_title'), t('dup_msg'));
    if (m.event === 'vpn-dropped') { connected = false; stopHeartbeat(); updateVpnUi(false); popup(t('dropped_title'), t('dropped_msg')); }
  });
}
