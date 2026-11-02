(function () {
  'use strict';
  const NS = (globalThis.COSShield = globalThis.COSShield || {});

  async function check(email, rules) {
    const findings = [];
    if (!email) return { findings };
    const all = await NS.storage.getHistory();
    const senderHistory = all.filter(h => (h.senderEmail || '').toLowerCase() === email.toLowerCase());
    if (senderHistory.length === 0) {
      findings.push({ id: 'sender.firstSeen', label: 'First time seeing this sender', weight: rules.weights.firstSeenSender, evidence: email });
    }
    const bad = senderHistory.filter(h => h.tier === 'dangerous').length;
    if (bad > 0) {
      findings.push({ id: 'sender.badHistory', label: 'Sender previously flagged', weight: rules.weights.threadHistory, evidence: `${bad} dangerous email(s) from this sender` });
    }
    return { findings, history: senderHistory };
  }

  async function summary(email) {
    const all = await NS.storage.getHistory();
    const mine = all.filter(h => (h.senderEmail || '').toLowerCase() === (email || '').toLowerCase());
    const tiers = { safe: 0, suspicious: 0, dangerous: 0 };
    for (const h of mine) tiers[h.tier] = (tiers[h.tier] || 0) + 1;
    return { total: mine.length, tiers, lastSeen: mine[0]?.ts || 0 };
  }

  NS.senderReputation = { check, summary };
})();