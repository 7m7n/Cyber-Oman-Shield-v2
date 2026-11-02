(function () {
  'use strict';
  const NS = (globalThis.COSShield = globalThis.COSShield || {});

  async function notifyDangerous(subject, sender) {
    const prefs = await NS.storage.getPrefs();
    if (!prefs.enableSound) return;

    chrome.notifications?.create({
  type: 'basic',
  title: 'Cyber OMAN Shield 2040 v2 — Dangerous email',
  message: `From: ${sender || 'unknown'}\nSubject: ${subject || '(no subject)'}`,
  priority: 2
});

    // Play a short beep (in-page, works inside the content script)
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      setTimeout(() => { osc.stop(); ctx.close(); }, 220);
    } catch (_) {}
  }

  NS.notifications = { notifyDangerous };
})();