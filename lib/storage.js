(function () {
  'use strict';
  const g = globalThis;
  const NS = g.COSShield = g.COSShield || {};

  const PREFS_DEFAULT = {
    language: 'en',
    fontSize: 'normal',
    boldText: false,
    theme: 'light',
    enableExternalChecks: false,
    enableVirusTotal: true,
    enablePhishTank: true,
    enableSafeBrowsing: true,
    enableUrlhaus: true,
    enableHIBP: false,
    enableML: true,
    enableQR: true,
    enableHover: true,
    enableVisual: true,
    enableSound: true,
    autoUpdateRules: false,
    cacheTtlMs: 6 * 60 * 60 * 1000,
    rateLimitPerMin: 4,
    debug: false

  };

  const KEYS_DEFAULT = {
    vtApiKey: '',
    phishTankAppKey: '',
    safeBrowsingApiKey: '',
    hibpApiKey: ''
  };

  function getPrefs() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(PREFS_DEFAULT, (v) => {
        if (chrome.runtime.lastError) {
          NS.logger?.warn('sync.get failed, falling back to defaults', chrome.runtime.lastError.message);
          return resolve({ ...PREFS_DEFAULT });
        }
        resolve({ ...PREFS_DEFAULT, ...v });
      });
    });
  }

  function setPrefs(obj) {
    return new Promise((resolve) => {
      chrome.storage.sync.set(obj, () => resolve(!chrome.runtime.lastError));
    });
  }

  function getKeys() {
    return new Promise((resolve) => {
      chrome.storage.local.get(KEYS_DEFAULT, (v) => {
        if (chrome.runtime.lastError) return resolve({ ...KEYS_DEFAULT });
        resolve({ ...KEYS_DEFAULT, ...v });
      });
    });
  }

  function setKeys(obj) {
    return new Promise((resolve) => {
      chrome.storage.local.set(obj, () => resolve(!chrome.runtime.lastError));
    });
  }

  function getWhitelist() {
    return new Promise((resolve) => {
      chrome.storage.local.get({ whitelist: [] }, (v) => resolve(v.whitelist || []));
    });
  }

  function addToWhitelist(entry) {
    return getWhitelist().then((list) => {
      const clean = String(entry || '').toLowerCase().trim();
      if (!clean || list.includes(clean)) return list;
      const next = [clean, ...list].slice(0, 200);
      return new Promise((r) => chrome.storage.local.set({ whitelist: next }, () => r(next)));
    });
  }

  function removeFromWhitelist(entry) {
    return getWhitelist().then((list) => {
      const next = list.filter((x) => x !== entry);
      return new Promise((r) => chrome.storage.local.set({ whitelist: next }, () => r(next)));
    });
  }

  function getHistory() {
    return new Promise((resolve) => {
      chrome.storage.local.get({ history: [] }, (v) => resolve(v.history || []));
    });
  }

  function addHistory(entry) {
    return getHistory().then((list) => {
      const next = [entry, ...list].slice(0, 100);
      return new Promise((r) => chrome.storage.local.set({ history: next }, () => r(next)));
    });
  }

  function clearHistory() {
    return new Promise((r) => chrome.storage.local.set({ history: [] }, () => r()));
  }

  NS.storage = {
    PREFS_DEFAULT, KEYS_DEFAULT,
    getPrefs, setPrefs, getKeys, setKeys,
    getWhitelist, addToWhitelist, removeFromWhitelist,
    getHistory, addHistory, clearHistory
  };
})();
