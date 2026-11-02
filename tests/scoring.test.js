// Simple Node test using node:test. Run: npm test
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rules.json'), 'utf8'));

// Minimal stubs so lib/scoring works in node
global.COSShield = {
  logger: { warn(){}, info(){}, debug(){}, error(){} },
  urlAnalysis: {
    isHttpUrl: u => /^https?:/i.test(u),
    hostOf: u => { try { return new URL(u).hostname; } catch { return ''; } },
    isIpLiteral: h => /^\d+\.\d+\.\d+\.\d+$/.test(h),
    isPunycode: h => /xn--/i.test(h),
    isShortener: (h, list) => list.some(s => h === s || h.endsWith('.' + s)),
    hasSuspiciousTld: (h, list) => list.find(t => h.endsWith(t)) || null,
    matchesBrandImpersonation: (h, brands) => brands.find(b => h.replace(/-/g,'').includes(b) && !new RegExp(`(^|\\.)${b}\\.[a-z]{2,}$`,'i').test(h)) || null,
    linkTextMismatch: () => false,
    analyzeUrl: (u, r) => {
      const host = new URL(u).hostname;
      const out = { findings: [] };
      if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) out.findings.push({ id: 'url.ip', label: 'IP URL', weight: r.weights.ipUrl, evidence: u });
      return out;
    }
  },
  attachments: {
    analyzeAttachments: (items, r) => {
      const out = [];
      for (const it of items || []) {
        const name = typeof it === 'string' ? it : it.name || '';
        if (/\.(exe|scr|js|vbs|bat|cmd|jar|hta|lnk|iso)$/i.test(name)) out.findings = out.findings || [], out.push({ id: 'riskyAttachment', label: 'Risky attachment', weight: r.weights.riskyAttachment, evidence: name });
      }
      return out;
    }
  },
  htmlForensics: { analyzeHtml: () => ({ findings: [] }) },
  qr: { analyzeQrImages: () => ({ findings: [] }) },
  visualSimilarity: { analyzeImages: async () => ({ findings: [] }) },
  senderReputation: { check: async () => ({ findings: [] }) },
  threadAnalysis: { summarizeThread: () => ({ findings: [] }) },
  headerParser: {},
  ml: { predict: () => ({ available: false, score: 0, probability: 0 }), extractFeatures: () => ({}) },
  notifications: { notifyDangerous: () => {} },
  storage: { getPrefs: async () => ({}), getHistory: async () => [], getWhitelist: async () => [] },
  crypto: {},
  i18n: { t: k => k, applyDir: () => {} }
};

// Load the library under test
const scoringSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'scoring.js'), 'utf8');
eval(scoringSrc);
const scoring = global.COSShield.scoring;

test('safe email scores low', () => {
  const res = scoring.analyzeEmailLocally({ subject: 'Meeting notes', bodyText: 'Thanks for the call today.', links: [], senderEmail: 'a@b.com', senderName: 'A', attachments: [] }, rules, {});
  assert.ok(res.score < 30, `expected low score, got ${res.score}`);
  assert.strictEqual(res.tier, 'safe');
});

test('phishing email scores high', () => {
  const res = scoring.analyzeEmailLocally({
    subject: 'Urgent: Verify Your Account',
    bodyText: 'Your account will be suspended. Confirm your password immediately. Payment wire transfer.',
    links: ['http://1.2.3.4/verify'],
    senderEmail: 'attacker@bad.tk',
    senderName: 'PayPal Support',
    attachments: [{ name: 'invoice.pdf.exe' }]
  }, rules, {});
  assert.ok(res.score >= 70, `expected high score, got ${res.score}`);
  assert.strictEqual(res.tier, 'dangerous');
});

test('punycode URL flagged', () => {
  const res = scoring.analyzeEmailLocally({
    subject: 'Hello', bodyText: 'click',
    links: ['http://xn--pypal-4ve.com/login'],
    senderEmail: 'x@y.com', senderName: 'X', attachments: []
  }, rules, {});
  assert.ok(res.findings.some(f => f.id === 'url.punycode'));
});