'use strict';

const PREFS_IDS = ['language','fontSize','boldText','theme','debug','enableExternalChecks','enableVirusTotal','enablePhishTank','enableSafeBrowsing','enableUrlhaus','enableHIBP','enableML','enableQR','enableHover','enableVisual','enableSound','autoUpdateRules'];
const KEY_IDS = ['vtApiKey','phishTankAppKey','safeBrowsingApiKey','hibpApiKey'];

const $ = id => document.getElementById(id);

function applyTheme(theme) { document.body.classList.toggle('dark', theme === 'dark'); }

async function load() {
  const prefs = await new Promise(r => chrome.storage.sync.get({
    language: 'en', fontSize: 'normal', boldText: false, theme: 'light', debug: false,
    enableExternalChecks: false, enableVirusTotal: true, enablePhishTank: true,
    enableSafeBrowsing: true, enableUrlhaus: true, enableHIBP: false,
    enableML: true, enableQR: true, enableHover: true, enableVisual: true, enableSound: true,
    autoUpdateRules: false, cacheTtlMs: 6 * 60 * 60 * 1000, rateLimitPerMin: 4
  }, r));

  const keys = await new Promise(r => chrome.storage.local.get({
    vtApiKey: '', phishTankAppKey: '', safeBrowsingApiKey: '', hibpApiKey: ''
  }, r));

  for (const k of PREFS_IDS) if (prefs[k] !== undefined) { const el = $(k); if (el) el.checked !== undefined ? el.checked = prefs[k] : el.value = prefs[k]; }
  $('fontSize').value = prefs.fontSize;
  $('theme').value = prefs.theme;
  $('language').value = prefs.language;
  $('cacheTtlHours').value = Math.round((prefs.cacheTtlMs / 3600000) * 100) / 100;
  $('rateLimitPerMin').value = prefs.rateLimitPerMin;

  for (const k of KEY_IDS) $(k).value = keys[k] || '';

  applyTheme(prefs.theme);

  // Rules overrides
  const rulesOverride = (await chrome.storage.local.get({ rulesOverride: null })).rulesOverride;
  if (rulesOverride) {
    $('extraKeywords').value = (rulesOverride.keywords || []).join(', ');
    $('extraBrands').value = (rulesOverride.brands || []).join(', ');
    $('extraTlds').value = (rulesOverride.suspiciousTlds || []).join(', ');
  }

  // About
  $('aboutVersion').textContent = chrome.runtime.getManifest().version;
  try { const rules = await (await fetch(chrome.runtime.getURL('rules.json'))).json(); $('aboutRules').textContent = rules.version; } catch {}
  try { const ml = await (await fetch(chrome.runtime.getURL('ml/model.json'))).json(); $('aboutML').textContent = ml.version; } catch {}
  const hist = await new Promise(r => chrome.storage.local.get({ history: [] }, r));
  const wl = await new Promise(r => chrome.storage.local.get({ whitelist: [] }, r));
  $('aboutHistory').textContent = (hist.history || []).length;
  $('aboutWhitelist').textContent = (wl.whitelist || []).length;
}

async function save() {
  const prefs = {
    language: $('language').value,
    fontSize: $('fontSize').value,
    boldText: $('boldText').checked,
    theme: $('theme').value,
    debug: $('debug').checked,
    enableExternalChecks: $('enableExternalChecks').checked,
    enableVirusTotal: $('enableVirusTotal').checked,
    enablePhishTank: $('enablePhishTank').checked,
    enableSafeBrowsing: $('enableSafeBrowsing').checked,
    enableUrlhaus: $('enableUrlhaus').checked,
    enableHIBP: $('enableHIBP').checked,
    enableML: $('enableML').checked,
    enableQR: $('enableQR').checked,
    enableHover: $('enableHover').checked,
    enableVisual: $('enableVisual').checked,
    enableSound: $('enableSound').checked,
    autoUpdateRules: $('autoUpdateRules').checked,
    cacheTtlMs: Math.max(0, Number($('cacheTtlHours').value) || 0) * 3600000,
    rateLimitPerMin: Math.min(60, Math.max(1, Number($('rateLimitPerMin').value) || 4))
  };
  const keys = {};
  for (const k of KEY_IDS) keys[k] = $(k).value.trim();

  await new Promise(r => chrome.storage.sync.set(prefs, r));
  await new Promise(r => chrome.storage.local.set(keys, r));
  applyTheme(prefs.theme);

  // Reload prefs in tabs
  chrome.tabs.query({}, tabs => tabs.forEach(t => t.id && chrome.tabs.sendMessage(t.id, { type: 'COS_REFRESH_PREFS' }, () => chrome.runtime.lastError)));

  $('status').textContent = 'Saved';
  setTimeout(() => $('status').textContent = '', 1200);
}

function bindTabs() {
  document.querySelectorAll('.tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.querySelector(`.tab-panel[data-panel="${btn.dataset.tab}"]`).classList.add('active');
    });
  });
}

async function applyRulesOverride() {
  const base = await (await fetch(chrome.runtime.getURL('rules.json'))).json();
  const extraK = $('extraKeywords').value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const extraB = $('extraBrands').value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const extraT = $('extraTlds').value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!extraK.length && !extraB.length && !extraT.length) {
    await new Promise(r => chrome.storage.local.remove('rulesOverride', r));
    $('rulesStatus').textContent = 'Reset to default.';
    return;
  }
  const override = JSON.parse(JSON.stringify(base));
  override.version = base.version + '+local';
  override.keywords = Array.from(new Set((base.keywords || []).concat(extraK)));
  override.brands = Array.from(new Set((base.brands || []).concat(extraB)));
  override.suspiciousTlds = Array.from(new Set((base.suspiciousTlds || []).concat(extraT)));
  await new Promise(r => chrome.storage.local.set({ rulesOverride: override }, r));
  $('rulesStatus').textContent = 'Rules applied (version ' + override.version + ').';
}

function bindAdvanced() {
  $('clearHistory').addEventListener('click', () => chrome.storage.local.set({ history: [] }, () => load()));
  $('clearWhitelist').addEventListener('click', () => chrome.storage.local.set({ whitelist: [] }, () => load()));
  $('clearCache').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'COS_CLEAR_CACHE' }, () => {}));
  $('exportAudit').addEventListener('click', async () => {
    const prefs = await new Promise(r => chrome.storage.sync.get(null, r));
    const local = await new Promise(r => chrome.storage.local.get({ history: [], whitelist: [] }, r));
    const rules = await (await fetch(chrome.runtime.getURL('rules.json'))).json();
    delete local.vtApiKey; delete local.phishTankAppKey; delete local.safeBrowsingApiKey; delete local.hibpApiKey; delete local.encryptedKeys;
    const audit = {
      generatedAt: new Date().toISOString(),
      extension: { name: 'Cyber OMAN Shield 2040 v2', version: chrome.runtime.getManifest().version },
      rulesVersion: rules.version,
      prefs, history: local.history, whitelist: local.whitelist
    };
    const blob = new Blob([JSON.stringify(audit, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: 'cos-2040-audit.json' });
  });
  $('exportCsv').addEventListener('click', async () => {
    const { history = [] } = await new Promise(r => chrome.storage.local.get({ history: [] }, r));
    const rows = [['timestamp','subject','senderEmail','tier','score','rulesVersion']].concat(history.map(h => [new Date(h.ts).toISOString(), (h.subject||'').replace(/,/g,' '), h.senderEmail||'', h.tier||'', h.score||0, h.rulesVersion||'']));
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: 'cos-2040-history.csv' });
  });
}

function bindKeyTest() {
  $('testKeys').addEventListener('click', () => {
    $('testStatus').textContent = 'Testing…';
    chrome.runtime.sendMessage({ type: 'COS_TEST_PROVIDERS' }, r => {
      if (chrome.runtime.lastError || !r || !r.ok) return $('testStatus').textContent = 'Failed.';
      $('testStatus').textContent = (r.providers || []).map(p => `${p.provider}:${p.verdict}`).join(' · ') || 'No providers enabled.';
    });
  });
}

function bindEncryption() {
  $('encSet').addEventListener('click', async () => {
    const pwd = $('encPassword').value;
    if (!pwd || pwd.length < 6) return $('encStatus').textContent = 'Password too short (min 6).';
    const keys = await new Promise(r => chrome.storage.local.get({ vtApiKey:'', phishTankAppKey:'', safeBrowsingApiKey:'', hibpApiKey:'' }, r));
    const NS = window.COSShield;
    const bundle = await NS.crypto.encryptObject(keys, pwd);
    await new Promise(r => chrome.storage.local.set({ encryptedKeys: bundle }, r));
    await new Promise(r => chrome.storage.local.remove(['vtApiKey','phishTankAppKey','safeBrowsingApiKey','hibpApiKey'], r));
    $('encStatus').textContent = 'Keys encrypted. Enter password in the extension prompt when needed.';
  });
  $('encClear').addEventListener('click', async () => {
    const pwd = $('encPassword').value;
    const { encryptedKeys } = await new Promise(r => chrome.storage.local.get({ encryptedKeys: null }, r));
    if (!encryptedKeys) return $('encStatus').textContent = 'Nothing to remove.';
    try {
      const NS = window.COSShield;
      const keys = await NS.crypto.decryptObject(encryptedKeys, pwd);
      await new Promise(r => chrome.storage.local.set(keys, r));
      await new Promise(r => chrome.storage.local.remove('encryptedKeys', r));
      $('encStatus').textContent = 'Encryption removed. Keys are plaintext again.';
    } catch { $('encStatus').textContent = 'Wrong password.'; }
  });
}

bindTabs();
bindAdvanced();
bindKeyTest();
bindEncryption();
$('rulesSave').addEventListener('click', applyRulesOverride);
$('rulesReset').addEventListener('click', async () => { $('extraKeywords').value = ''; $('extraBrands').value = ''; $('extraTlds').value = ''; await applyRulesOverride(); });
document.getElementById('save').addEventListener('click', save);
load();