(function () {
  'use strict';
  const NS = (globalThis.COSShield = globalThis.COSShield || {});

  function isLikelyQR(img) {
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if (!w || !h) return false;
    const ratio = w / h;
    if (ratio < 0.85 || ratio > 1.18) return false;
    if (w < 80 || w > 800) return false;
    const src = img.src || '';
    if (/\.(svg)(\?|$)/i.test(src)) return false;
    return true;
  }

  function detectQrImages(root) {
    const hits = [];
    const imgs = root.querySelectorAll('img');
    for (const img of imgs) {
      if (isLikelyQR(img)) hits.push(img);
    }
    return hits;
  }

  async function decodeQr(img) {
    if (!('BarcodeDetector' in window)) {
      return { ok: false, reason: 'BarcodeDetector API not available. Right-click the image and scan it with your phone.' };
    }
    try {
      const det = new window.BarcodeDetector({ formats: ['qr_code'] });
      const codes = await det.detect(img);
      if (!codes.length) return { ok: false, reason: 'No QR code detected in image.' };
      return { ok: true, url: codes[0].rawValue };
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  }

  function analyzeQrImages(root, rules) {
    const hits = detectQrImages(root);
    const findings = [];
    if (hits.length) {
      findings.push({
        id: 'qr.detected',
        label: 'QR-code image present',
        weight: rules.weights.qrImage,
        evidence: `${hits.length} QR-like image(s) — verify URLs manually`
      });
    }
    return { findings, images: hits };
  }

  NS.qr = { detectQrImages, decodeQr, analyzeQrImages };
})();