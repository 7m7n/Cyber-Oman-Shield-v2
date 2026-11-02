(function () {
  'use strict';
  const NS = (globalThis.COSShield = globalThis.COSShield || {});

  function normalizeUrl(raw) {
    try { const u = new URL(raw); u.hash = ''; u.hostname = u.hostname.toLowerCase(); return u.toString(); }
    catch { return raw; }
  }
  function isHttpUrl(raw) {
    try { const u = new URL(raw); return u.protocol === 'http:' || u.protocol === 'https:'; }
    catch { return false; }
  }
  function hostOf(raw) { try { return new URL(raw).hostname; } catch { return ''; } }
  function isIpLiteral(h) { return /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || /^\[[0-9a-f:]+\]$/i.test(h); }
  function isPunycode(h) { return /(^|\.)xn--/i.test(h); }
  function isShortener(h, list) { return list.some(s => h === s || h.endsWith('.' + s)); }
  function hasSuspiciousTld(h, list) { return list.find(t => h.endsWith(t)) || null; }
  function entropy(str) {
    if (!str) return 0;
    const m = {}; for (const c of str) m[c] = (m[c] || 0) + 1;
    let h = 0; const n = str.length;
    for (const k in m) { const p = m[k] / n; h -= p * Math.log2(p); }
    return h;
  }
  function matchesBrandImpersonation(host, brands) {
    const h = host.replace(/-/g, '').toLowerCase();
    for (const b of brands) {
      if (!h.includes(b)) continue;
      const legit = new RegExp(`(^|\\.)${b}\\.[a-z]{2,}$`, 'i');
      if (legit.test(host)) return null;
      return b;
    }
    return null;
  }
  function linkTextMismatch(anchorText, href) {
    if (!anchorText || !href) return false;
    const textHost = (() => { try { return new URL(anchorText.trim()).hostname; } catch { return ''; } })();
    if (!textHost) return false;
    const hrefHost = hostOf(href);
    return textHost && hrefHost && textHost !== hrefHost;
  }
  function analyzeUrl(raw, rules) {
    const out = { url: raw, host: '', findings: [] };
    if (!isHttpUrl(raw)) return out;
    const host = hostOf(raw); out.host = host;
    if (!host) return out;
    if (isIpLiteral(host)) out.findings.push({ id: 'url.ip', label: 'IP-literal URL', weight: rules.weights.ipUrl, evidence: raw });
    if (isPunycode(host)) out.findings.push({ id: 'url.punycode', label: 'Punycode / homograph URL', weight: rules.weights.punycode, evidence: raw });
    const tld = hasSuspiciousTld(host, rules.suspiciousTlds);
    if (tld) out.findings.push({ id: 'url.tld' + tld, label: 'Suspicious TLD', weight: rules.weights.suspiciousTld, evidence: host });
    if (isShortener(host, rules.shorteners)) out.findings.push({ id: 'url.short', label: 'Shortened URL', weight: rules.weights.shortener, evidence: raw });
    const brand = matchesBrandImpersonation(host, rules.brands);
    if (brand) out.findings.push({ id: 'url.brand.' + brand, label: 'Brand impersonation in host', weight: rules.weights.brandImpersonation, evidence: host });
    return out;
  }

  NS.urlAnalysis = {
    normalizeUrl, isHttpUrl, hostOf, isIpLiteral, isPunycode, isShortener,
    hasSuspiciousTld, entropy, matchesBrandImpersonation, linkTextMismatch, analyzeUrl
  };
})();