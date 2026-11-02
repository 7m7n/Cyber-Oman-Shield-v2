'use strict';
importScripts(
  'lib/logger.js',
  'lib/storage.js',
  'lib/cache.js',
  'lib/rate-limiter.js',
  'lib/url-analysis.js',
  'lib/rule-updates.js'
);

const NS = self.COSShield;
const { storage, createCache, createRateLimiter, urlAnalysis, ruleUpdates } = NS;

let cache = createCache({ ttlMs: 6 * 60 * 60 * 1000, maxEntries: 1000 });
let limiter = null;

async function getLimiter() {
  if (!limiter) {
    const prefs = await storage.getPrefs();
    limiter = createRateLimiter({ perMin: prefs.rateLimitPerMin || 4 });
  }
  return limiter;
}

async function fetchWithTimeout(url, opts, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

async function checkVirusTotal(url, apiKey) {
  try {
    const res = await fetchWithTimeout('https://www.virustotal.com/api/v3/urls', {
      method: 'POST',
      headers: { 'x-apikey': apiKey, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ url })
    });
    if (!res.ok) return { provider: 'virustotal', verdict: 'unknown', reason: `http ${res.status}` };
    const data = await res.json();
    const id = data?.data?.id;
    if (!id) return { provider: 'virustotal', verdict: 'unknown' };
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const rep = await fetchWithTimeout(`https://www.virustotal.com/api/v3/analyses/${id}`, { headers: { 'x-apikey': apiKey } });
      if (!rep.ok) continue;
      const j = await rep.json();
      if (j?.data?.attributes?.status !== 'completed') continue;
      const stats = j.data.attributes.stats || {};
      const bad = (stats.malicious || 0) + (stats.suspicious || 0);
      return { provider: 'virustotal', verdict: bad > 0 ? 'malicious' : 'clean', detail: stats };
    }
    return { provider: 'virustotal', verdict: 'unknown', reason: 'analysis not ready' };
  } catch (e) { return { provider: 'virustotal', verdict: 'error', reason: e.message }; }
}

async function checkPhishTank(url, appKey) {
  try {
    const res = await fetchWithTimeout('https://checkurl.phishtank.com/checkurl/', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, app_key: appKey, format: 'json' })
    });
    if (!res.ok) return { provider: 'phishtank', verdict: 'unknown', reason: `http ${res.status}` };
    const j = await res.json();
    const r = j?.results;
    return { provider: 'phishtank', verdict: (r?.in_database && r?.valid) ? 'malicious' : 'clean' };
  } catch (e) { return { provider: 'phishtank', verdict: 'error', reason: e.message }; }
}

async function checkSafeBrowsing(urls, apiKey) {
  try {
    const body = {
      client: { clientId: 'cos-2040', clientVersion: '3.0.0' },
      threatInfo: {
        threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'],
        platformTypes: ['ANY_PLATFORM'],
        threatEntryTypes: ['URL'],
        threatEntries: urls.map(u => ({ url: u }))
      }
    };
    const res = await fetchWithTimeout(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(apiKey)}`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) return { provider: 'safebrowsing', verdict: 'unknown', reason: `http ${res.status}` };
    const j = await res.json();
    const matches = j?.matches || [];
    return { provider: 'safebrowsing', verdict: matches.length ? 'malicious' : 'clean', detail: matches };
  } catch (e) { return { provider: 'safebrowsing', verdict: 'error', reason: e.message }; }
}

async function checkUrlhaus(urls) {
  try {
    let flagged = 0;
    for (const u of urls.slice(0, 3)) {
      const res = await fetchWithTimeout('https://urlhaus-api.abuse.ch/v1/url/', {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ url: u })
      });
      if (!res.ok) continue;
      const j = await res.json();
      if (j?.query_status === 'ok' && j?.url_status === 'online') flagged++;
    }
    return { provider: 'urlhaus', verdict: flagged > 0 ? 'malicious' : 'clean' };
  } catch (e) { return { provider: 'urlhaus', verdict: 'error', reason: e.message }; }
}

async function checkHIBP(email, apiKey) {
  try {
    if (!email) return { provider: 'hibp', verdict: 'unknown', reason: 'no email' };
    const res = await fetchWithTimeout(`https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=true`,
      { headers: { 'hibp-api-key': apiKey, 'user-agent': 'COS-2040' } });
    if (res.status === 404) return { provider: 'hibp', verdict: 'clean' };
    if (res.status === 401) return { provider: 'hibp', verdict: 'error', reason: 'invalid key' };
    if (!res.ok) return { provider: 'hibp', verdict: 'unknown', reason: `http ${res.status}` };
    const j = await res.json();
    return { provider: 'hibp', verdict: Array.isArray(j) && j.length ? 'malicious' : 'clean', detail: j };
  } catch (e) { return { provider: 'hibp', verdict: 'error', reason: e.message }; }
}

async function getEffectiveKeys() {
  const plain = await storage.getKeys();
  const bundle = (await chrome.storage.local.get({ encryptedKeys: null })).encryptedKeys;
  if (!bundle) return plain;
  // If encrypted, defer to in-memory cache set by options password flow
  const mem = (await chrome.storage.session?.get?.({ decryptedKeys: null }))?.decryptedKeys || null;
  return mem || plain;
}

async function runChecks({ urls = [], senderEmail = '' }) {
  const [prefs, keys] = await Promise.all([storage.getPrefs(), getEffectiveKeys()]);
  if (!prefs.enableExternalChecks) return { ok: true, skipped: true, providers: [] };

  const normUrls = Array.from(new Set(urls.filter(urlAnalysis.isHttpUrl).map(urlAnalysis.normalizeUrl))).slice(0, 10);
  const cacheKey = JSON.stringify({ normUrls, senderEmail, prefs: { hibp: prefs.enableHIBP, vt: prefs.enableVirusTotal, pt: prefs.enablePhishTank, sb: prefs.enableSafeBrowsing, uh: prefs.enableUrlhaus } });
  const hit = cache.get(cacheKey);
  if (hit) return { ok: true, cached: true, providers: hit };

  const gate = await getLimiter();
  const providers = [];

  if (prefs.enableVirusTotal && keys.vtApiKey) for (const u of normUrls.slice(0, 3)) { await gate(); providers.push(await checkVirusTotal(u, keys.vtApiKey)); }
  if (prefs.enablePhishTank && keys.phishTankAppKey) for (const u of normUrls.slice(0, 3)) { await gate(); providers.push(await checkPhishTank(u, keys.phishTankAppKey)); }
  if (prefs.enableSafeBrowsing && keys.safeBrowsingApiKey && normUrls.length) { await gate(); providers.push(await checkSafeBrowsing(normUrls, keys.safeBrowsingApiKey)); }
  if (prefs.enableUrlhaus && normUrls.length) { await gate(); providers.push(await checkUrlhaus(normUrls)); }
  if (prefs.enableHIBP && keys.hibpApiKey && senderEmail) { await gate(); providers.push(await checkHIBP(senderEmail, keys.hibpApiKey)); }

  cache.set(cacheKey, providers);
  return { ok: true, providers };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'COS_API_CHECKS') { runChecks(msg).then(r => sendResponse(r)).catch(e => sendResponse({ ok: false, error: String(e) })); return true; }
  if (msg.type === 'COS_ADD_HISTORY') { storage.addHistory(msg.entry).then(() => sendResponse({ ok: true })); return true; }
  if (msg.type === 'COS_GET_STATE') {
    Promise.all([storage.getPrefs(), storage.getKeys(), storage.getWhitelist(), storage.getHistory()])
      .then(([prefs, keys, whitelist, history]) => sendResponse({ ok: true, prefs, keys, whitelist, history }));
    return true;
  }
  if (msg.type === 'COS_TEST_PROVIDERS') {
    runChecks({ urls: ['http://example.com'], senderEmail: 'test@example.com' })
      .then(r => sendResponse(r)).catch(e => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg.type === 'COS_CLEAR_CACHE') { cache = createCache({ ttlMs: 6 * 60 * 60 * 1000, maxEntries: 1000 }); sendResponse({ ok: true }); return true; }
  if (msg.type === 'COS_CHECK_RULES_UPDATE') { ruleUpdates.checkForUpdate().then(r => sendResponse({ ok: true, ...r })); return true; }
  if (msg.type === 'COS_GET_EFFECTIVE_RULES') { ruleUpdates.getEffectiveRules().then(r => sendResponse({ ok: true, rules: r })); return true; }
});

// Periodic rule check
chrome.runtime.onInstalled.addListener(() => { ruleUpdates.checkForUpdate(); });
chrome.alarms?.create?.('cos-rules', { periodInMinutes: 60 * 24 });
chrome.alarms?.onAlarm?.addListener?.((a) => { if (a.name === 'cos-rules') ruleUpdates.checkForUpdate(); });

// D5 — sandbox: open URL in incognito window
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'COS_OPEN_SANDBOX' && msg.url && /^https?:/i.test(msg.url)) {
    try {
      chrome.windows.create({ url: msg.url, incognito: true, focused: true }, () => sendResponse({ ok: true }));
    } catch (e) { sendResponse({ ok: false, error: String(e) }); }
    return true;
  }
});