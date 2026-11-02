const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

global.COSShield = {};
eval(fs.readFileSync(path.join(__dirname, '..', 'lib', 'attachments.js'), 'utf8'));
const att = global.COSShield.attachments;

const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rules.json'), 'utf8'));

test('exe flagged', () => {
  const f = att.analyzeAttachments([{ name: 'invoice.exe' }], rules);
  assert.ok(f.some(x => x.id === 'riskyAttachment'));
});

test('docm flagged as macro', () => {
  const f = att.analyzeAttachments([{ name: 'report.docm' }], rules);
  assert.ok(f.some(x => x.id === 'macroAttachment'));
});

test('pdf clean', () => {
  const f = att.analyzeAttachments([{ name: 'report.pdf', mime: 'application/pdf' }], rules);
  assert.strictEqual(f.length, 0);
});