(function () {
  'use strict';
  const NS = (globalThis.COSShield = globalThis.COSShield || {});

  function parseHeaders(text) {
    const lines = String(text || '').split(/\r?\n/);
    const headers = {};
    let lastKey = null;
    for (const line of lines) {
      if (!line) continue;
      if (/^[\t ]/.test(line) && lastKey) {
        headers[lastKey] += ' ' + line.trim();
        continue;
      }
      const m = line.match(/^([A-Za-z0-9-]+):\s*(.*)$/);
      if (!m) continue;
      lastKey = m[1].toLowerCase();
      headers[lastKey] = m[2].trim();
    }
    return headers;
  }

  function parseAuthResults(headers) {
    const src = (headers['arc-authentication-results'] || headers['authentication-results'] || headers['received-spf'] || '').toLowerCase();
    return {
      spf: /spf=(pass|fail|softfail|neutral|none|temperror|permerror)/.exec(src)?.[1] || 'unknown',
      dkim: /dkim=(pass|fail|neutral|none|temperror|permerror)/.exec(src)?.[1] || 'unknown',
      dmarc: /dmarc=(pass|fail|none|temperror|permerror)/.exec(src)?.[1] || 'unknown',
      raw: src
    };
  }

  function extractAddress(str) {
    if (!str) return { name: '', email: '' };
    const m = str.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
    return { name: '', email: str.trim().toLowerCase() };
  }

  function analyzeHeaders(text, rules) {
    const headers = parseHeaders(text);
    const findings = [];
    const auth = parseAuthResults(headers);
    const from = extractAddress(headers['from'] || '');
    const replyTo = extractAddress(headers['reply-to'] || '');

    if (auth.spf === 'fail' || auth.spf === 'softfail') {
      findings.push({ id: 'header.spf', label: 'SPF ' + auth.spf, weight: rules.weights.headerAuthFail, evidence: headers['authentication-results'] || '' });
    }
    if (auth.dkim === 'fail') {
      findings.push({ id: 'header.dkim', label: 'DKIM fail', weight: rules.weights.headerAuthFail, evidence: headers['authentication-results'] || '' });
    }
    if (auth.dmarc === 'fail') {
      findings.push({ id: 'header.dmarc', label: 'DMARC fail', weight: rules.weights.headerAuthFail, evidence: headers['authentication-results'] || '' });
    }
    if (replyTo.email && from.email && replyTo.email !== from.email) {
      findings.push({ id: 'replyTo.mismatch', label: 'Reply-To differs from From', weight: rules.weights.replyToMismatch, evidence: `From ${from.email} → Reply-To ${replyTo.email}` });
    }

    return { headers, auth, from, replyTo, findings };
  }

  NS.headerParser = { parseHeaders, parseAuthResults, extractAddress, analyzeHeaders };
})();