(function () {
  'use strict';
  const g = globalThis;
  const NS = g.COSShield = g.COSShield || {};

  function createRateLimiter({ perMin = 4 } = {}) {
    const windowMs = 60_000;
    const stamps = [];
    return async function gate() {
      const now = Date.now();
      while (stamps.length && now - stamps[0] > windowMs) stamps.shift();
      if (stamps.length >= perMin) {
        const wait = windowMs - (now - stamps[0]) + 50;
        NS.logger?.debug('rate-limit wait', wait, 'ms');
        await new Promise((r) => setTimeout(r, wait));
        return gate();
      }
      stamps.push(Date.now());
    };
  }

  NS.createRateLimiter = createRateLimiter;
})();