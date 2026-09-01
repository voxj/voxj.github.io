const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

console.log('[renderer] start');

/* ─── STATE ─── */
let tabs = [];
let activeTabId = null;
let tabCounter = 0;
let registry = {};

/* ─── DOM ─── */
const tabsEl = document.getElementById('tabs');
const contentEl = document.getElementById('content');
const omnibox = document.getElementById('omnibox');
const modeBtn = document.getElementById('mode-toggle');
const btnBack = document.getElementById('nav-back');
const btnFwd = document.getElementById('nav-fwd');
const btnReload = document.getElementById('nav-reload');

/* ─── REGISTRY ───
   Fresh copy is pulled from GitHub on every startup.
   Falls back to the bundled registry.json if offline or the fetch fails. */
const REGISTRY_URL = 'https://raw.githubusercontent.com/voxj/voxj.github.io/refs/heads/main/registry.json';
const FALLBACK_PATH = path.join(__dirname, 'registry.json');

function loadRegistry() {
  return new Promise((resolve) => {
    console.log('[registry] fetching fresh copy…');
    https.get(REGISTRY_URL, (res) => {
      if (res.statusCode !== 200) {
        console.error('[registry] HTTP', res.statusCode, '- using fallback');
        loadLocalRegistry();
        resolve();
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          registry = JSON.parse(data);
          console.log('[registry] fresh', Object.keys(registry));
          // Cache it to temp so the fallback is also up-to-date when possible
          const tmp = path.join(os.tmpdir(), 'fictional-browser-registry.json');
          fs.writeFileSync(tmp, data);
        } catch (e) {
          console.error('[registry] parse error:', e.message);
          loadLocalRegistry();
        }
        resolve();
      });
    }).on('error', (err) => {
      console.error('[registry] fetch error:', err.message);
      loadLocalRegistry();
      resolve();
    });
  });
}

function loadLocalRegistry() {
  try {
    registry = JSON.parse(fs.readFileSync(FALLBACK_PATH, 'utf8'));
    console.log('[registry] fallback (local)', Object.keys(registry));
  } catch (e) {
    registry = {};
    console.error('[registry] fallback failed:', e.message);
  }
}

/* ─── UTILS ─── */
function getHost(url) {
  return url.replace(/^https?:\/\//, '').split('/')[0];
}

function resolve(domain) {
  const entry = registry[domain];
  return entry ? entry.url.replace(/\/$/, '') : null;
}

/* ─── TABS ─── */
function createTab(startUrl, startMode) {
  tabCounter++;
  const id = tabCounter;

  const tab = {
    id, title: 'New Tab', mode: startMode || 'fiction',
    displayUrl: '', realUrl: '',
    canBack: false, canFwd: false
  };
  tabs.push(tab);

  // Tab UI
  const el = document.createElement('div');
  el.className = 'tab';
  el.dataset.id = id;
  el.innerHTML = '<span class="t-fav">🌐</span><span class="t-title">New Tab</span><span class="t-close">×</span>';
  el.querySelector('.t-close').onclick = (e) => { e.stopPropagation(); closeTab(id); };
  el.onclick = () => switchTab(id);
  tabsEl.appendChild(el);

  // Webview with preload
  const wv = document.createElement('webview');
  wv.className = 'wv';
  wv.dataset.id = id;
  wv.setAttribute('nodeintegration', 'false');
  wv.setAttribute('allowpopups', 'false');
  wv.setAttribute('webpreferences', 'sandbox=no');

  const rawPath = path.join(__dirname, 'webview-preload.js').replace(/\\/g, '/');
  const preloadPath = 'file://' + (rawPath.startsWith('/') ? '' : '/') + rawPath;
  console.log('[renderer] preload:', preloadPath);
  wv.setAttribute('preload', preloadPath);

  // Spawn the guest immediately so later navigations don't abort
  wv.setAttribute('src', 'about:blank');

  contentEl.appendChild(wv);

  attachListeners(wv, tab);
  switchTab(id);

  // Give Electron ~250 ms to finish attaching the guest, then navigate
  setTimeout(() => go(id, startUrl || 'otv.ex'), 250);

  return id;
}

function attachListeners(wv, tab) {
  wv.addEventListener('page-title-updated', (e) => {
    tab.title = e.title;
    updateTabUI(tab.id);
  });

  wv.addEventListener('page-favicon-updated', (e) => {
    if (e.favicons?.[0]) {
      const fav = document.querySelector(`.tab[data-id="${tab.id}"] .t-fav`);
      if (fav) fav.innerHTML = `<img src="${e.favicons[0]}" onerror="this.textContent='🌐'">`;
    }
  });

  wv.addEventListener('ipc-message', (e) => {
    if (e.channel === 'navigate') {
      console.log('[ipc-message] navigate:', e.args[0]);
      handleClick(tab.id, e.args[0]);
    }
  });

  wv.addEventListener('new-window', (e) => {
    e.preventDefault();
    createTab(e.url, tab.mode);
  });

  wv.addEventListener('did-start-loading', () => {
    btnReload.textContent = '✕';
    btnReload.title = 'Stop';
  });
  wv.addEventListener('did-stop-loading', () => {
    btnReload.textContent = '↻';
    btnReload.title = 'Reload';
    tab.canBack = wv.canGoBack();
    tab.canFwd = wv.canGoForward();
    updateNav();
  });

  wv.addEventListener('did-fail-load', (e) => {
    if (e.errorCode === -3) return;
    console.error('[fail]', e.errorCode, e.errorDescription, e.validatedURL);
  });
}

function switchTab(id) {
  activeTabId = id;
  const tab = tabs.find(t => t.id === id);
  if (!tab) return;

  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', parseInt(t.dataset.id) === id));
  document.querySelectorAll('.wv').forEach(w => w.classList.toggle('active', parseInt(w.dataset.id) === id));

  omnibox.value = tab.displayUrl || '';
  updateModeBtn(tab.mode);
  updateNav();
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  tabs.splice(idx, 1);
  document.querySelector(`.tab[data-id="${id}"]`)?.remove();
  document.querySelector(`.wv[data-id="${id}"]`)?.remove();
  if (activeTabId === id) {
    if (tabs.length) switchTab(tabs[Math.min(idx, tabs.length - 1)].id);
    else createTab();
  }
}

function updateTabUI(id) {
  const t = document.querySelector(`.tab[data-id="${id}"] .t-title`);
  if (t) t.textContent = tabs.find(x => x.id === id)?.title || 'New Tab';
}

/* ─── NAVIGATION ─── */
function go(id, url) {
  const tab = tabs.find(t => t.id === id);
  const wv = document.querySelector(`.wv[data-id="${id}"]`);
  if (!tab || !wv) return;

  console.log('[go]', url, 'mode:', tab.mode);
  const domain = getHost(url);

  let targetUrl;
  if (tab.mode === 'fiction') {
    const base = resolve(domain);
    if (base) {
      const pathPart = url.replace(/^https?:\/\//, '').replace(domain, '');
      targetUrl = base + (pathPart || '/');
      tab.displayUrl = url;
      tab.realUrl = targetUrl;
      console.log('[go] fiction:', url, '->', targetUrl);
    } else {
      tab.displayUrl = url;
      tab.realUrl = null;
      console.log('[go] 404:', domain);
      showError(wv, domain);
      return;
    }
  } else {
    tab.displayUrl = url;
    targetUrl = url.startsWith('http') ? url : 'https://' + url;
    tab.realUrl = targetUrl;
    console.log('[go] real:', targetUrl);
  }

  if (wv.getAttribute('src') === targetUrl) {
    console.log('[go] already on', targetUrl);
    return;
  }

  wv.setAttribute('src', targetUrl);
  if (id === activeTabId) omnibox.value = tab.displayUrl;
}

function handleClick(id, rawUrl) {
  const tab = tabs.find(t => t.id === id);
  if (!tab) return;

  let target = rawUrl;

  if (/^(javascript|mailto|tel|data|blob):/i.test(rawUrl)) return;

  if (tab.mode === 'fiction' && tab.displayUrl) {
    const fictionDomain = getHost(tab.displayUrl);
    try {
      if (/^https?:\/\//i.test(rawUrl)) {
        const clicked = new URL(rawUrl);
        const currentReal = tab.realUrl ? new URL(tab.realUrl) : null;
        if (currentReal && clicked.host === currentReal.host) {
          target = fictionDomain + clicked.pathname + clicked.search + clicked.hash;
        }
      } else if (rawUrl.startsWith('//')) {
        const clickedHost = rawUrl.replace(/^\/\//, '').split('/')[0];
        const currentReal = tab.realUrl ? new URL(tab.realUrl) : null;
        if (currentReal && clickedHost === currentReal.host) {
          target = fictionDomain + rawUrl.replace(/^\/\/[^\/]+/, '');
        } else {
          target = 'https:' + rawUrl;
        }
      } else {
        const fictionBase = tab.displayUrl.match(/^https?:\/\//)
          ? tab.displayUrl
          : 'https://' + tab.displayUrl;
        const resolved = new URL(rawUrl, fictionBase);
        target = resolved.host + resolved.pathname + resolved.search + resolved.hash;
      }
    } catch (e) {
      // keep original
    }
  } else if (tab.realUrl && !/^https?:\/\//i.test(rawUrl)) {
    if (rawUrl.startsWith('//')) {
      target = 'https:' + rawUrl;
    } else {
      try {
        target = new URL(rawUrl, tab.realUrl).href;
      } catch (e) {
        // keep original
      }
    }
  }

  console.log('[click]', rawUrl, '->', target);
  go(id, target);
}

function showError(wv, domain) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>404</title>
<style>
body{background:#0f0f0f;color:#e4e4e7;font-family:system-ui,sans-serif;padding:60px;max-width:600px;margin:0 auto}
h1{color:#ef4444;font-size:28px;margin-bottom:16px}
p{color:#a1a1aa;font-size:15px;line-height:1.6}
code{background:#27272a;padding:2px 6px;border-radius:4px;color:#ddd6fe}
</style></head>
<body><h1>404 — Not in Registry</h1><p>The domain <code>${domain}</code> is not registered.<br><br>
Add it to <code>registry.json</code> or switch to <b>Real World</b> mode.</p></body></html>`;
  wv.setAttribute('src', 'data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

/* ─── MODE ─── */
function toggleMode() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;
  tab.mode = tab.mode === 'fiction' ? 'real' : 'fiction';
  updateModeBtn(tab.mode);
  if (tab.displayUrl) go(activeTabId, tab.displayUrl);
}

function updateModeBtn(mode) {
  if (mode === 'fiction') {
    modeBtn.className = 'mode-btn fiction';
    modeBtn.innerHTML = '<span class="mode-icon">✦</span><span class="mode-text">FICTION</span>';
    modeBtn.title = 'Click to switch to Real World';
    omnibox.style.borderColor = '#8b5cf6';
  } else {
    modeBtn.className = 'mode-btn real';
    modeBtn.innerHTML = '<span class="mode-icon">🌍</span><span class="mode-text">REAL</span>';
    modeBtn.title = 'Click to switch to Fictional Net';
    omnibox.style.borderColor = '#22c55e';
  }
}

function updateNav() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;
  btnBack.disabled = !tab.canBack;
  btnFwd.disabled = !tab.canFwd;
}

/* ─── EVENTS ─── */
omnibox.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const v = omnibox.value.trim();
    if (v) go(activeTabId, v);
  }
});

modeBtn.addEventListener('click', toggleMode);
btnBack.onclick = () => document.querySelector('.wv.active')?.goBack();
btnFwd.onclick = () => document.querySelector('.wv.active')?.goForward();
btnReload.onclick = () => {
  const wv = document.querySelector('.wv.active');
  if (wv) wv.isLoading() ? wv.stop() : wv.reload();
};

document.getElementById('btn-newtab').onclick = () => createTab();
document.getElementById('btn-min').onclick = () => ipcRenderer.send('win-minimize');
document.getElementById('btn-max').onclick = () => ipcRenderer.send('win-maximize');
document.getElementById('btn-close').onclick = () => ipcRenderer.send('win-close');

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 't') { e.preventDefault(); createTab(); }
    if (e.key === 'w') { e.preventDefault(); closeTab(activeTabId); }
    if (e.key === 'l') { e.preventDefault(); omnibox.focus(); omnibox.select(); }
  }
});

/* ─── INIT ─── */
loadRegistry().then(() => {
  createTab('otv.ex', 'fiction');
  console.log('[renderer] ready');
});
