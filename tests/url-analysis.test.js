const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

global.COSShield = {};
eval(fs.readFileSync(path.join(__dirname, '..', 'lib', 'url-analysis.js'), 'utf8'));
const ua = global.COSShield.urlAnalysis;

test('isHttpUrl', () => {
  assert.strictEqual(ua.isHttpUrl('https://a.com'), true);
  assert.strictEqual(ua.isHttpUrl('mailto:x@y.com'), false);
});

test('isIpLiteral', () => {
  assert.strictEqual(ua.isIpLiteral('1.2.3.4'), true);
  assert.strictEqual(ua.isIpLiteral('a.com'), false);
});

test('isPunycode', () => {
  assert.strictEqual(ua.isPunycode('xn--pypal-4ve.com'), true);
  assert.strictEqual(ua.isPunycode('paypal.com'), false);
});

test('isShortener', () => {
  assert.strictEqual(ua.isShortener('bit.ly', ['bit.ly','t.co']), true);
  assert.strictEqual(ua.isShortener('example.com', ['bit.ly']), false);
});

test('entropy is positive for random strings', () => {
  assert.ok(ua.entropy('aGVsbG8xMjM0') > 2);
});