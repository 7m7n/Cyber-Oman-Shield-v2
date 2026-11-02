'use strict';

function activeTab() {
  return new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, t => resolve(t[0])));
}

function applyTheme() {
  chrome.storage.sync.get({ theme: 'light' }, cfg => { if (cfg.theme === 'dark') document.body.classList.add('dark'); });
}

function renderResult(r) {
  const $ = id => document.getElementById(id);
  if (!r) {
    $('subject').textContent = '(Open a message)';
    $('tier').textContent = '—'; $('tier').className = 'tier-badge';
    $('score').textContent = '—'; $('findings').textContent = ''; $('mlBadge').textContent = '';
    return;
  }
  $('subject').textContent = r.subject || '(No subject)';
  $('sender').textContent = r.senderEmail ? `From: ${r.senderName || ''} <${r.senderEmail}>` : '';
  $('tier').textContent = r.trusted ? 'Trusted' : (r.tier[0].toUpperCase() + r.tier.slice(1));
  $('tier').className = 'tier-badge ' + (r.trusted ? 'safe' : r.tier);
  $('score').textContent = String(r.score);
  $('mlBadge').textContent = r.mlAvailable ? ` · ML ${r.mlScore}` : '';
  $('explain').textContent =
    r.tier === 'dangerous' ? 'Multiple phishing indicators detected.' :
    r.tier === 'suspicious' ? 'Some suspicious indicators.' :
    r.trusted ? 'Sender is trusted.' :
    'No strong indicators.';

  const findings = $('findings');
  findings.innerHTML = '';
  const list = r.findings || [];
  if (!list.length) {
    const d = document.createElement('div'); d.className = 'item small'; d.textContent = 'No findings.'; findings.appendChild(d);
  } else {
    for (const f of list.slice().sort((a,b)=>b.weight-a.weight)) {
      const d = document.createElement('div');
      d.className = 'item';
      d.innerHTML = `<strong>${f.label}</strong> <span class="danger">+${f.weight}</span> <span class="small">${f.evidence || ''}</span>`;
      findings.appendChild(d);
    }
  }
  if (r.external && r.external.length) {
    const h = document.createElement('div'); h.className = 'item'; h.innerHTML = '<strong>External</strong>';
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
      d.innerHTML = `<strong>#${m.index + 1}</strong> <span class="tier-badge ${m.tier}">${m.tier}</span> <span class="small">score ${m.score}</span>`;
      tl.appendChild(d);
    }
  } else {
    row.style.display = 'none';
  }
}

async function init() {
  applyTheme();
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
    if (!resp || !resp.ok) { alert('Open a mail thread first.'); return; }
    renderResult({ ...resp.result, subject: 'DEMO — ' + resp.result.subject, threadSummary: null });
  }));
  document.getElementById('sandbox').addEventListener('click', () => {
    chrome.storage.local.get({ lastUrl: '' }, (v) => {
      const url = v.lastUrl || prompt('URL to open in sandbox (incognito):');
      if (!url) return;
      chrome.runtime.sendMessage({ type: 'COS_OPEN_SANDBOX', url }, (r) => {
        if (!r || !r.ok) alert('Sandbox failed: ' + (r?.error || 'unknown'));
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
      for (const f of r.findings) lines.push(`⚠️ ${f.label} — ${f.evidence}`);
      document.getElementById('headerResult').innerHTML = lines.map(l => `<div>${l}</div>`).join('');
    });
  });
}

init();