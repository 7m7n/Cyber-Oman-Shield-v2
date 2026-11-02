(function () {
  'use strict';
  const NS = (globalThis.COSShield = globalThis.COSShield || {});

  function toGray(data, w, h) {
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
    return gray;
  }

  async function dHash(img) {
    const w = 9, h = 8;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    try { ctx.drawImage(img, 0, 0, w, h); } catch { return null; }
    const d = ctx.getImageData(0, 0, w, h).data;
    const gray = toGray(d, w, h);
    let bits = '';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w - 1; x++) {
        bits += gray[y * w + x] < gray[y * w + x + 1] ? '1' : '0';
      }
    }
    // 64-bit hex
    let hex = '';
    for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    return hex;
  }

  function hamming(a, b) {
    if (!a || !b || a.length !== b.length) return 99;
    let d = 0;
    for (let i = 0; i < a.length; i++) {
      let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
      while (x) { d += x & 1; x >>= 1; }
    }
    return d;
  }

  async function analyzeImages(root, rules) {
    const findings = [];
    const imgs = Array.from(root.querySelectorAll('img')).slice(0, 20);
    const db = rules.brandVisualHashes || {};
    for (const img of imgs) {
      if (!img.complete || !img.naturalWidth) continue;
      const h = await dHash(img);
      if (!h) continue;
      for (const brand in db) {
        const dist = hamming(h, db[brand]);
        if (dist <= 6) {
          findings.push({ id: 'visual.' + brand, label: `Visual match to ${brand} logo`, weight: rules.weights.visualMatch, evidence: `hamming distance ${dist}` });
        }
      }
    }
    return { findings };
  }

  NS.visualSimilarity = { dHash, hamming, analyzeImages };
})();