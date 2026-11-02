'use strict';

function activeTab() {
  return new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, t => resolve(t[0])));
}

const I18N = window.COSShield.i18n;
const t = (k) => I18N.t(k);

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  I18N.applyDir(document.documentElement);
  document.body.style.textAlign = I18N.isRTL() ? 'right' : '';
}

// Creates an element with safe text (no innerHTML)
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function applyTheme() {
  chrome.storage.sync.get({ theme: 'light' }, cfg => { if (cfg.theme === 'dark') document.body.classList.add('dark'); });
}

function renderResult(r) {
  const $ = id => document.getElementById(id);
  if (!r) {
    $('subject').textContent = t('popup.openMessage');
    $('tier').textContent = '—'; $('tier').className = 'tier-badge';
    $('score').textContent = '—'; $('findings').textContent = ''; $('mlBadge').textContent = '';
    return;
  }
  $('subject').textContent = r.subject || t('popup.noSubject');
  $('sender').textContent = r.senderEmail ? `${t('popup.from')}: ${r.senderName || ''} <${r.senderEmail}>` : '';
  $('tier').textContent = r.trusted ? t('banner.trusted') : t('tier.' + r.tier);
  $('tier').className = 'tier-badge ' + (r.trusted ? 'safe' : r.tier);
  $('score').textContent = String(r.score);
  $('mlBadge').textContent = r.mlAvailable ? ` · ML ${r.mlScore}` : '';
  $('explain').textContent =
    r.tier === 'dangerous' ? t('popup.explain.dangerous') :
    r.tier === 'suspicious' ? t('popup.explain.suspicious') :
    r.trusted ? t('popup.explain.trusted') :
    t('popup.explain.none');

  const findings = $('findings');
  findings.innerHTML = '';
  const list = r.findings || [];
  if (!list.length) {
    const d = document.createElement('div'); d.className = 'item small'; d.textContent = t('popup.noFindings'); findings.appendChild(d);
  } else {
    for (const f of list.slice().sort((a,b)=>b.weight-a.weight)) {
      // textContent, not innerHTML: labels/evidence can contain email content (and "<iframe>" text)
      const d = el('div', 'item');
      d.append(el('strong', '', I18N.label(f.label)), ' ', el('span', 'danger', `+${f.weight}`), ' ', el('span', 'small', f.evidence || ''));
      findings.appendChild(d);
    }
  }
  if (r.external && r.external.length) {
    const h = document.createElement('div'); h.className = 'item'; h.append(el('strong', '', t('popup.external')));
    findings.appendChild(h);
    for (const p of r.external) {
      const d = document.createElement('div'); d.className = 'item small'; d.textContent = `${p.provider}: ${p.verdict}`; findings.appendChild(d);
    }
  }

  // Thread timeline (F3)
  const row = $('threadRow');
  const tl = $('threadTimeline');
  tl.innerHTML = '';
  if (r.threadSummary && r.threadSummary.perMessage.length > 1) {
    row.style.display = '';
    for (const m of r.threadSummary.perMessage) {
      const d = document.createElement('div'); d.className = 'item';
      d.append(el('strong', '', `#${m.index + 1}`), ' ', el('span', 'tier-badge ' + m.tier, t('tier.' + m.tier)), ' ', el('span', 'small', `${t('popup.score')} ${m.score}`));
      tl.appendChild(d);
    }
  } else {
    row.style.display = 'none';
  }
}

async function init() {
  applyTheme();
  await I18N.load();
  applyI18n();
  const tab = await activeTab();
  if (!tab?.id) return;

  chrome.tabs.sendMessage(tab.id, { type: 'COS_GET_LAST_RESULT' }, (resp) => {
    if (chrome.runtime.lastError) return renderResult(null);
    renderResult(resp?.ok ? resp.result : null);
  });

  const send = (type, cb) => chrome.tabs.sendMessage(tab.id, { type }, (r) => {
    if (chrome.runtime.lastError) return cb && cb(null); cb && cb(r);
  });

  document.getElementById('report').addEventListener('click', () => chrome.tabs.create({ url: 'https://support.google.com/mail/answer/8253' }));
  document.getElementById('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.getElementById('dashboard').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') }));
  document.getElementById('trust').addEventListener('click', () => send('COS_TRUST_SENDER', () => window.close()));
  document.getElementById('demo').addEventListener('click', () => send('COS_RUN_DEMO', (resp) => {
    if (!resp || !resp.ok) { alert(t('popup.openFirst')); return; }
    renderResult({ ...resp.result, subject: 'DEMO — ' + resp.result.subject, threadSummary: null });
  }));
  document.getElementById('sandbox').addEventListener('click', () => {
    chrome.storage.local.get({ lastUrl: '' }, (v) => {
      const url = v.lastUrl || prompt(t('popup.sandboxPrompt'));
      if (!url) return;
      chrome.runtime.sendMessage({ type: 'COS_OPEN_SANDBOX', url }, (r) => {
        if (!r || !r.ok) alert(t('popup.sandboxFailed') + ' ' + (r?.error || 'unknown'));
      });
    });
  });

  document.getElementById('threadToggle').addEventListener('click', () => {
    const tl = document.getElementById('threadTimeline');
    tl.style.display = tl.style.display === 'none' ? 'block' : 'none';
  });

  // Header parsing
  document.getElementById('checkHeaders').addEventListener('click', () => {
    const box = document.getElementById('headersBox');
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('headersBox').addEventListener('change', (e) => {
    chrome.tabs.sendMessage(tab.id, { type: 'COS_ANALYZE_HEADERS', text: e.target.value }, (resp) => {
      if (chrome.runtime.lastError || !resp || !resp.ok) return;
      const r = resp.result;
      const lines = [];
      lines.push(`SPF: ${r.auth.spf}`);
      lines.push(`DKIM: ${r.auth.dkim}`);
      lines.push(`DMARC: ${r.auth.dmarc}`);
      for (const f of r.findings) lines.push(`⚠️ ${I18N.label(f.label)} — ${f.evidence}`);
      const out = document.getElementById('headerResult');
      out.replaceChildren(...lines.map(l => el('div', '', l)));
    });
  });
}

init();
