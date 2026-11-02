(function () {
  'use strict';
  const NS = (globalThis.COSShield = globalThis.COSShield || {});

  function analyzeHtml(root, rules) {
    const findings = [];
    if (!root) return { findings };

    // scripts
    const scripts = root.querySelectorAll('script');
    if (scripts.length) {
      findings.push({ id: 'html.script', label: '<script> tag in email', weight: 15, evidence: `${scripts.length} tag(s)` });
    }

    // iframes
    const iframes = root.querySelectorAll('iframe');
    if (iframes.length) {
      findings.push({ id: 'html.iframe', label: '<iframe> tag in email', weight: 15, evidence: `${iframes.length} tag(s)` });
    }

    // forms
    const forms = root.querySelectorAll('form');
    if (forms.length) {
      findings.push({ id: 'html.form', label: 'HTML form in email', weight: rules.weights.formTag, evidence: `${forms.length} form(s)` });
    }

    // base64 embedded images
    const b64imgs = root.querySelectorAll('img[src^="data:image"]');
    if (b64imgs.length) {
      findings.push({ id: 'html.base64img', label: 'Base64-embedded image', weight: 6, evidence: `${b64imgs.length} image(s)` });
    }

    // hidden text (white on white, 0px, display:none)
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let hidden = 0;
    while (walker.nextNode()) {
      const el = walker.currentNode;
      const style = window.getComputedStyle(el);
      const isHidden = style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.fontSize) <= 0.5;
      const isInvisibleText =
        style.color && style.backgroundColor &&
        normalize(style.color) === normalize(style.backgroundColor) &&
        el.textContent && el.textContent.trim().length > 3;
      if (isHidden || isInvisibleText) hidden++;
    }
    if (hidden > 0) {
      findings.push({ id: 'html.hidden', label: 'Hidden text detected', weight: rules.weights.hiddenText, evidence: `${hidden} hidden element(s)` });
    }

    // tracking pixels
    const pixels = Array.from(root.querySelectorAll('img')).filter(i => (i.width === 1 && i.height === 1) || /(^|\/)1x1\./.test(i.src || ''));
    if (pixels.length) {
      findings.push({ id: 'html.pixel', label: 'Tracking pixel(s)', weight: 3, evidence: `${pixels.length} pixel(s)` });
    }

    return { findings };
  }

  function normalize(c) {
    if (!c) return '';
    const m = c.match(/rgba?\(([^)]+)\)/);
    return m ? m[1].split(',').slice(0, 3).map(s => s.trim()).join(',') : c;
  }

  NS.htmlForensics = { analyzeHtml };
})();