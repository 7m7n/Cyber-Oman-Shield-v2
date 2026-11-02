(function () {
  'use strict';
  const NS = (globalThis.COSShield = globalThis.COSShield || {});
  const RULES_URL = '';
  const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

  async function checkForUpdate() {
    const prefs = await NS.storage.getPrefs();
    if (!prefs.autoUpdateRules) return { updated: false };
    const last = (await chrome.storage.local.get({ rulesLastCheck: 0 })).rulesLastCheck;
    if (Date.now() - last < CHECK_INTERVAL_MS) return { updated: false };

    try {
      const remote = await fetch(RULES_URL, { cache: 'no-store' }).then(r => r.json());
      const local = await fetch(chrome.runtime.getURL('rules.json')).then(r => r.json());
      if (remote.version && remote.version !== local.version) {
        await chrome.storage.local.set({ rulesOverride: remote, rulesLastCheck: Date.now() });
        NS.logger?.info('rules updated to', remote.version);
        return { updated: true, version: remote.version };
      }
      await chrome.storage.local.set({ rulesLastCheck: Date.now() });
      return { updated: false };
    } catch (e) {
      NS.logger?.warn('rule update failed', e);
      return { updated: false, error: String(e) };
    }
  }

  async function getEffectiveRules() {
    const override = (await chrome.storage.local.get({ rulesOverride: null })).rulesOverride;
    if (override && override.version) return override;
    return fetch(chrome.runtime.getURL('rules.json')).then(r => r.json());
  }

  NS.ruleUpdates = { checkForUpdate, getEffectiveRules, RULES_URL };
})();