(function () {
  'use strict';
  const NS = (globalThis.COSShield = globalThis.COSShield || {});
  const strings = { en: {}, ar: {} };
  let current = 'en';

  async function load() {
    try {
      const [en, ar] = await Promise.all([
        fetch(chrome.runtime.getURL('lib/locale/en.json')).then(r => r.json()),
        fetch(chrome.runtime.getURL('lib/locale/ar.json')).then(r => r.json())
      ]);
      strings.en = en; strings.ar = ar;
    } catch (e) { NS.logger?.warn('i18n load failed', e); }
    const prefs = await NS.storage.getPrefs();
    current = prefs.language || 'en';
  }

  function t(key, vars) {
    const dict = strings[current] || strings.en;
    let s = dict[key] || strings.en[key] || key;
    if (vars) for (const k in vars) s = s.replace(new RegExp(`{${k}}`, 'g'), vars[k]);
    return s;
  }

  // Translate a finding label (labels are written in English in the detection code)
  function label(l) {
    if (!l) return '';
    const map = (strings[current] && strings[current].labels) || {};
    if (map[l]) return map[l];
    if (current === 'ar') {
      let m;
      if ((m = /^Flagged by (.+)$/.exec(l))) return `تم الإبلاغ عنه بواسطة ${m[1]}`;
      if ((m = /^Visual match to (.+) logo$/.exec(l))) return `تطابق مرئي مع شعار ${m[1]}`;
    }
    return l;
  }

  function getLang() { return current; }
  function setLang(lang) { current = lang === 'ar' ? 'ar' : 'en'; }
  function isRTL() { return current === 'ar'; }
  function applyDir(el) {
    if (!el) return;
    el.setAttribute('dir', isRTL() ? 'rtl' : 'ltr');
    el.lang = current;
  }

  NS.i18n = { load, t, label, getLang, setLang, isRTL, applyDir };
})();
