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

  function getLang() { return current; }
  function setLang(lang) { current = lang === 'ar' ? 'ar' : 'en'; }
  function isRTL() { return current === 'ar'; }
  function applyDir(el) {
    if (!el) return;
    el.setAttribute('dir', isRTL() ? 'rtl' : 'ltr');
    el.lang = current;
  }

  NS.i18n = { load, t, getLang, setLang, isRTL, applyDir };
})();