'use strict';

async function getHistory() {
  return new Promise(r => chrome.storage.local.get({ history: [] }, v => r(v.history || [])));
}

function renderStats(history) {
  const total = history.length;
  const dangerous = history.filter(h => h.tier === 'dangerous').length;
  const suspicious = history.filter(h => h.tier === 'suspicious').length;
  const safe = history.filter(h => h.tier === 'safe').length;
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statDangerous').textContent = dangerous;
  document.getElementById('statSuspicious').textContent = suspicious;
  document.getElementById('statSafe').textContent = safe;
}

function renderTimeline(history) {
  const canvas = document.getElementById('timeline');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!history.length) {
    ctx.fillStyle = '#888'; ctx.fillText('No data.', 20, 30); return;
  }
  const buckets = 14; // last 14 days
  const now = Date.now();
  const DAY = 86400000;
  const data = new Array(buckets).fill(0).map(() => ({ safe: 0, suspicious: 0, dangerous: 0 }));
  for (const h of history) {
    const daysAgo = Math.floor((now - h.ts) / DAY);
    if (daysAgo < 0 || daysAgo >= buckets) continue;
    const idx = buckets - 1 - daysAgo;
    data[idx][h.tier] = (data[idx][h.tier] || 0) + 1;
  }
  const max = Math.max(1, ...data.map(d => d.safe + d.suspicious + d.dangerous));
  const w = canvas.width, h = canvas.height;
  const barW = Math.floor(w / buckets) - 6;
  data.forEach((d, i) => {
    const x = i * (barW + 6) + 6;
    let y = h - 20;
    const total = d.safe + d.suspicious + d.dangerous;
    const scale = (h - 40) / max;
    const drawSeg = (n, color) => {
      const seg = n * scale;
      ctx.fillStyle = color;
      ctx.fillRect(x, y - seg, barW, seg);
      y -= seg;
    };
    drawSeg(d.safe, '#7ecb8b');
    drawSeg(d.suspicious, '#f0c26b');
    drawSeg(d.dangerous, '#e37a7a');
    ctx.fillStyle = '#555'; ctx.font = '10px sans-serif';
    ctx.fillText(new Date(now - (buckets - 1 - i) * DAY).toLocaleDateString(), x, h - 6);
  });
}

function renderTopSenders(history) {
  const counts = {};
  for (const h of history) {
    const s = h.senderEmail || '(unknown)';
    counts[s] = counts[s] || { total: 0, bad: 0 };
    counts[s].total++;
    if (h.tier === 'dangerous') counts[s].bad++;
  }
  const top = Object.entries(counts).sort((a, b) => b[1].total - a[1].total).slice(0, 10);
  const ul = document.getElementById('topSenders');
  ul.innerHTML = '';
  for (const [s, c] of top) {
    const li = document.createElement('li');
    li.innerHTML = `<code>${s}</code> — ${c.total} email(s)${c.bad ? `, <span class="danger">${c.bad} dangerous</span>` : ''}`;
    ul.appendChild(li);
  }
}

function renderRecent(history) {
  const tbody = document.querySelector('#recent tbody');
  tbody.innerHTML = '';
  for (const h of history.slice(0, 200)) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${new Date(h.ts).toLocaleString()}</td><td>${escapeHtml(h.subject || '')}</td><td>${escapeHtml(h.senderEmail || '')}</td><td><span class="tier-badge ${h.tier}">${h.tier}</span></td><td>${h.score}</td>`;
    tbody.appendChild(tr);
  }
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

async function refresh() {
  const history = await getHistory();
  renderStats(history);
  renderTimeline(history);
  renderTopSenders(history);
  renderRecent(history);
}

document.getElementById('exportCsv').addEventListener('click', async () => {
  const history = await getHistory();
  const rows = [['timestamp','subject','senderEmail','tier','score','rulesVersion']].concat(history.map(h => [new Date(h.ts).toISOString(), (h.subject||'').replace(/,/g,' '), h.senderEmail||'', h.tier||'', h.score||0, h.rulesVersion||'']));
  const csv = rows.map(r => r.join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  chrome.downloads.download({ url, filename: 'cos-2040-history.csv' });
});

document.getElementById('exportJson').addEventListener('click', async () => {
  const history = await getHistory();
  const url = URL.createObjectURL(new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' }));
  chrome.downloads.download({ url, filename: 'cos-2040-history.json' });
});

document.getElementById('clearHistory').addEventListener('click', () => chrome.storage.local.set({ history: [] }, refresh));

refresh();