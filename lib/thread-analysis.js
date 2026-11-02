(function () {
  'use strict';
  const NS = (globalThis.COSShield = globalThis.COSShield || {});

  // Site-specific: return array of { subject, bodyText, senderEmail, senderName, links, attachments } per message
  function collectThreadMessages(site) {
    const adapter = site || NS.sites?.current?.();
    if (!adapter || !adapter.collectMessages) return [];
    return adapter.collectMessages();
  }

  function summarizeThread(messages, rules) {
    const perMessage = [];
    let anyDangerous = false;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const local = NS.scoring.analyzeEmailLocally(m, rules);
      perMessage.push({ index: i, subject: m.subject, senderEmail: m.senderEmail, score: local.score, tier: local.tier, findings: local.findings });
      if (local.tier === 'dangerous') anyDangerous = true;
    }
    const findings = [];
    if (anyDangerous) findings.push({ id: 'thread.history', label: 'Earlier message in thread was dangerous', weight: rules.weights.threadHistory, evidence: '' });
    return { perMessage, findings };
  }

  NS.threadAnalysis = { collectThreadMessages, summarizeThread };
})();