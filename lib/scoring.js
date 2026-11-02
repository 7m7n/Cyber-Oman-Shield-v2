(function () {
  'use strict';
  const NS = (globalThis.COSShield = globalThis.COSShield || {});

  function tierOf(score, rules) {
    if (score >= rules.tiers.suspicious) return 'dangerous';
    if (score >= rules.tiers.safe) return 'suspicious';
    return 'safe';
  }

  function analyzeEmailLocally(data, rules, extras) {
    extras = extras || {};
    const { subject = '', bodyText = '', links = [], senderEmail = '', senderName = '', attachments = [] } = data;
    const normalizedLinks = (links || []).map(l => typeof l === 'string' ? l : l.href).filter(Boolean);
    const text = (subject + '\n' + bodyText).toLowerCase();
    const findings = [];
    const W = rules.weights;

    // 1. Urgency phrases (English + Arabic)
    for (const p of rules.urgencyPhrases || []) if (text.includes(p)) findings.push({ id: 'urgency.' + p, label: 'Urgency language', weight: W.urgencyPhrase, evidence: `"${p}"` });
    for (const p of (rules.arabic?.urgencyPhrases || [])) if (text.includes(p)) findings.push({ id: 'urgency.ar.' + p, label: 'لغة الاستعجال', weight: W.urgencyPhrase, evidence: `"${p}"` });

    // 2. Keywords
    const seen = new Set();
    for (const kw of rules.keywords || []) if (text.includes(kw) && !seen.has(kw)) { seen.add(kw); findings.push({ id: 'keyword.' + kw, label: 'Suspicious keyword', weight: W.keyword, evidence: `"${kw}"` }); }
    for (const kw of (rules.arabic?.keywords || [])) if (text.includes(kw) && !seen.has(kw)) { seen.add(kw); findings.push({ id: 'keyword.ar.' + kw, label: 'كلمة مشبوهة', weight: W.keyword, evidence: `"${kw}"` }); }

    // 3. Display-name spoofing
    if (senderName && senderEmail) {
      const nameLc = senderName.toLowerCase();
      const domain = (senderEmail.split('@')[1] || '').toLowerCase();
      for (const b of rules.brands || []) {
        if (nameLc.includes(b) && !domain.includes(b)) {
          findings.push({ id: 'spoof.' + b, label: 'Display-name spoofing', weight: W.displayNameSpoof, evidence: `"${senderName}" <${senderEmail}>` });
          break;
        }
      }
    }

    // 4. URLs (delegate)
    for (const raw of normalizedLinks) {
      const r = NS.urlAnalysis.analyzeUrl(raw, rules);
      for (const f of r.findings) findings.push(f);
    }

    // 5. Link text vs href mismatch
    for (const l of (links || [])) {
      if (typeof l === 'object' && l.text && NS.urlAnalysis.linkTextMismatch(l.text, l.href)) {
        findings.push({ id: 'url.textMismatch', label: 'Link text ≠ actual URL', weight: 18, evidence: `${l.text} → ${l.href}` });
      }
    }

    // 6. Attachments (MIME-aware)
    for (const f of NS.attachments.analyzeAttachments(attachments, rules)) findings.push(f);

    // 7. HTML forensics
    if (extras.htmlFindings) for (const f of extras.htmlFindings) findings.push(f);

    // 8. QR images
    if (extras.qrFindings) for (const f of extras.qrFindings) findings.push(f);

    // 9. Sender reputation
    if (extras.senderFindings) for (const f of extras.senderFindings) findings.push(f);

    // 10. Thread history
    if (extras.threadFindings) for (const f of extras.threadFindings) findings.push(f);

    // 11. Visual similarity
    if (extras.visualFindings) for (const f of extras.visualFindings) findings.push(f);

    // 12. Manual header findings (if user pasted headers)
    if (extras.headerFindings) for (const f of extras.headerFindings) findings.push(f);

    const heuristicScore = Math.min(100, findings.reduce((s, f) => s + (f.weight || 0), 0));

    // ML fusion
    let mlScore = 0, mlAvailable = false;
    if (extras.mlFeatures && NS.ml) {
      const pred = NS.ml.predict(extras.mlFeatures);
      if (pred.available) { mlAvailable = true; mlScore = pred.score; }
    }

    // Final: heuristic + weighted ML contribution (max +W.mlScoreScale)
    const mlBoost = mlAvailable ? Math.round((mlScore / 100) * W.mlScoreScale) : 0;
    const score = Math.min(100, heuristicScore + mlBoost);

    return {
      score,
      tier: tierOf(score, rules),
      findings,
      rulesVersion: rules.version,
      heuristicScore,
      mlScore,
      mlAvailable
    };
  }

  NS.scoring = { analyzeEmailLocally, tierOf };
})();