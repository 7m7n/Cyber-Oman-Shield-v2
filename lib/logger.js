(function () {
  'use strict';
  const g = globalThis;
  const NS = g.COSShield = g.COSShield || {};
  let debug = false;
  const PREFIX = '[COS]';
  NS.logger = {
    setDebug(v) { debug = !!v; },
    debug(...a) { if (debug) console.debug(PREFIX, ...a); },
    info(...a) { console.info(PREFIX, ...a); },
    warn(...a) { console.warn(PREFIX, ...a); },
    error(...a) { console.error(PREFIX, ...a); }
  };
})();