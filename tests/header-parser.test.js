const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

global.COSShield = {};
eval(fs.readFileSync(path.join(__dirname, '..', 'lib', 'header-parser.js'), 'utf8'));
const hp = global.COSShield.headerParser;

const raw = `Authentication-Results: mx.google.com;
       spf=fail smtp.mailfrom=evil.com;
       dkim=fail header.d=evil.com;
       dmarc=fail header.from=paypal.com
From: "PayPal Support" <support@evil.com>
Reply-To: recover@evil2.com
To: me@example.com`;

test('parses SPF/DKIM/DMARC', () => {
  const h = hp.parseHeaders(raw);
  const a = hp.parseAuthResults(h);
  assert.strictEqual(a.spf, 'fail');
  assert.strictEqual(a.dkim, 'fail');
  assert.strictEqual(a.dmarc, 'fail');
});

test('detects reply-to mismatch', () => {
  const rules = { weights: { replyToMismatch: 20, headerAuthFail: 25 } };
  const r = hp.analyzeHeaders(raw, rules);
  assert.ok(r.findings.some(f => f.id === 'replyTo.mismatch'));
  assert.ok(r.findings.some(f => f.id === 'header.spf'));
});