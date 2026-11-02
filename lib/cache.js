(function () {
  'use strict';
  const g = globalThis;
  const NS = g.COSShield = g.COSShield || {};

  function createCache({ ttlMs = 3600_000, maxEntries = 500 } = {}) {
    const map = new Map();
    return {
      get(key) {
        const e = map.get(key);
        if (!e) return undefined;
        if (Date.now() - e.t > ttlMs) { map.delete(key); return undefined; }
        // LRU bump
        map.delete(key); map.set(key, e);
        return e.v;
      },
      set(key, v) {
        if (map.size >= maxEntries) {
          const first = map.keys().next().value;
          map.delete(first);
        }
        map.set(key, { v, t: Date.now() });
      },
      clear() { map.clear(); },
      size() { return map.size; }
    };
  }

  NS.createCache = createCache;
})();