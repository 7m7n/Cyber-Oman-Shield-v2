(function () {
  'use strict';

  const NS = window.COSShield;
  const { logger, storage, scoring, urlAnalysis, i18n } = NS;

  const STATE = {
    rules: null,
    lastAnalysis: null,
    lastHash: null,
    bannerEl: null,
    analyzing: false,
    site: null,
    threadSummary: null
  };

  function detectSite() {
    const host = location.hostname;
    if (host === 'mail.google.com') return NS.sites.gmail;
    if (host === 'outlook.live.com' || host === 'outlook.office.com') return NS.sites.outlook;
    if (host === 'mail.yahoo.com') return NS.sites.yahoo;
    return null;
  }

  async function loadRules() {
    const override = (await chrome.storage.local.get({ rulesOverride: null })).rulesOverride;
    if (override && override.version) return override;
    const res = await fetch(chrome.runtime.getURL('rules.json'));
    return res.json();
  }

  function hashEmail(d) {
    const s = `${d.subject}|${d.senderEmail}|${d.bodyText.slice(0, 200)}`;
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h.toString(36);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function buildBanner(analysis, isTrusted, mlLine, mlProb) {
    const t = i18n.t;
    const banner = document.createElement('div');
    banner.className = `gpg-banner ${analysis.tier}${isTrusted ? ' trusted' : ''}`;
    banner.setAttribute('role', 'status');
    i18n.applyDir(banner);

    const head = document.createElement('div');
    head.className = 'gpg-head';

    const icon = document.createElement('span');
    icon.className = 'gpg-icon';
    icon.textContent = isTrusted ? '🔵' : analysis.tier === 'dangerous' ? '⛔' : analysis.tier === 'suspicious' ? '⚠️' : '✅';

    const title = document.createElement('span');
    title.className = 'gpg-title';
    const tierLabel = isTrusted ? t('banner.trusted') : analysis.tier === 'dangerous' ? t('banner.dangerous') : analysis.tier === 'suspicious' ? t('banner.suspicious') : t('banner.safe');
    title.textContent = `${tierLabel} — ${t('banner.risk')} ${analysis.score}/100`;

    const toggle = document.createElement('button');
    toggle.className = 'gpg-toggle';
    toggle.type = 'button';
    toggle.textContent = t('banner.why');
    toggle.addEventListener('click', () => {
      const open = banner.classList.toggle('expanded');
      toggle.setAttribute('aria-expanded', String(open));
    });

    const advice = document.createElement('div');
    advice.className = 'gpg-advice';
    const advKeys = ['banner.advice.1','banner.advice.2','banner.advice.3','banner.advice.4','banner.advice.5'];
    advice.textContent = t(advKeys[Math.floor(Math.random() * advKeys.length)]);

    head.appendChild(icon); head.appendChild(title); head.appendChild(toggle);
    banner.appendChild(head); banner.appendChild(advice);

    const details = document.createElement('div');
    details.className = 'gpg-details';

    // F2: explainability score bar
    if (analysis.mlAvailable) {
      const ml = document.createElement('div');
      ml.className = 'gpg-row gpg-ml';
      ml.innerHTML = `<strong>ML score</strong> ${analysis.mlScore}/100 &nbsp; <span class="small">${mlLine || ''}</span>`;
      details.appendChild(ml);
    }

    // Rule-by-rule breakdown
    if (analysis.findings.length === 0) {
      const p = document.createElement('div'); p.className = 'gpg-row'; p.textContent = t('popup.noFindings'); details.appendChild(p);
    } else {
      const sorted = analysis.findings.slice().sort((a,b) => b.weight - a.weight);
      for (const f of sorted) {
        const row = document.createElement('div');
        row.className = 'gpg-row';
        row.innerHTML = `<strong>${escapeHtml(f.label)}</strong> <span class="gpg-weight">+${f.weight}</span><br><span class="gpg-ev">${escapeHtml(f.evidence || '')}</span>`;
        details.appendChild(row);
      }
    }

    if (analysis.external && analysis.external.length) {
      const h = document.createElement('div');
      h.className = 'gpg-row gpg-heading';
      h.textContent = 'External threat intelligence';
      details.appendChild(h);
      for (const p of analysis.external) {
        const row = document.createElement('div');
        row.className = 'gpg-row';
        row.innerHTML = `<strong>${escapeHtml(p.provider)}</strong>: <span class="gpg-verdict ${p.verdict}">${p.verdict}</span>`;
        details.appendChild(row);
      }
    }

    if (analysis.rulesVersion) {
      const meta = document.createElement('div');
      meta.className = 'gpg-meta';
      meta.textContent = `Rules v${analysis.rulesVersion} · local analysis`;
      details.appendChild(meta);
    }

    banner.appendChild(details);
    return banner;
  }

  function renderBanner(analysis, isTrusted, mlLine, mlProb) {
    const main = STATE.site?.extract?.()?.mainEl || document.querySelector('div[role="main"]') || document.body;
    if (!main) return;
    const existing = document.querySelector('.gpg-banner');
    if (existing) existing.remove();
    const banner = buildBanner(analysis, isTrusted, mlLine, mlProb);
    chrome.storage.sync.get({ fontSize: 'normal', boldText: false }, (cfg) => {
      if (cfg.fontSize === 'large') banner.style.fontSize = '1.05rem';
      if (cfg.boldText) banner.style.fontWeight = '700';
    });
    main.prepend(banner);
    STATE.bannerEl = banner;
  }

  async function runAllChecks(data, rules) {
    // HTML forensics
    let htmlFindings = [], qrFindings = [], visualFindings = [], senderFindings = [], threadFindings = [];

    try { htmlFindings = NS.htmlForensics.analyzeHtml(data.bodyEl || document.body, rules).findings; } catch (e) { logger.warn(e); }
    try { qrFindings = NS.qr.analyzeQrImages(data.bodyEl || document.body, rules).findings; } catch (e) { logger.warn(e); }
    try { const vs = await NS.visualSimilarity.analyzeImages(data.bodyEl || document.body, rules); visualFindings = vs.findings; } catch (e) { logger.warn(e); }
    try { const sr = await NS.senderReputation.check(data.senderEmail, rules); senderFindings = sr.findings; } catch (e) { logger.warn(e); }
    try {
      const messages = STATE.site?.collectMessages?.() || [];
      if (messages.length > 1) {
        const ts = NS.threadAnalysis.summarizeThread(messages, rules);
        STATE.threadSummary = ts;
        threadFindings = ts.findings;
      }
    } catch (e) { logger.warn(e); }

    return { htmlFindings, qrFindings, visualFindings, senderFindings, threadFindings };
  }

  async function maybeExternalChecks(data, base) {
    const prefs = await storage.getPrefs();
    if (!prefs.enableExternalChecks) return base;
    return new Promise((resolve) => {
      const urls = (data.links || []).map(l => typeof l === 'string' ? l : l.href);
      chrome.runtime.sendMessage({ type: 'COS_API_CHECKS', urls, senderEmail: data.senderEmail }, (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.ok || resp.skipped) return resolve(base);
        const providers = resp.providers || [];
        const bad = providers.filter(p => p.verdict === 'malicious');
        const bonus = Math.min(50, bad.length * STATE.rules.weights.externalFlag);
        const score = Math.min(100, base.score + bonus);
        const findings = base.findings.slice();
        for (const p of bad) findings.push({ id: 'ext.' + p.provider, label: `Flagged by ${p.provider}`, weight: STATE.rules.weights.externalFlag, evidence: p.reason || '' });
        const tier = scoring.tierOf(score, STATE.rules);
        resolve({ ...base, score, tier, findings, external: providers });
      });
    });
  }

  async function analyzeAndDisplay() {
    if (STATE.analyzing) return;
    const data = STATE.site.extract();
    if (!data) { STATE.lastHash = null; return; }

    const h = hashEmail(data);
    const bannerAlive = STATE.bannerEl && STATE.bannerEl.isConnected;
    if (h === STATE.lastHash && bannerAlive) return;

    STATE.analyzing = true;
    STATE.lastHash = h;

    try {
      const prefs = await storage.getPrefs();
      const whitelist = await storage.getWhitelist();
      const trusted = data.senderEmail && whitelist.includes(data.senderEmail);

      const extras = await runAllChecks(data, STATE.rules);
      const mlFeatures = prefs.enableML ? NS.ml.extractFeatures(data, extras.htmlFindings.concat(extras.qrFindings)) : null;
      const local = scoring.analyzeEmailLocally(data, STATE.rules, { ...extras, mlFeatures });
      const merged = await maybeExternalChecks(data, local);

      let analysis;
      if (trusted) {
        analysis = { ...merged, score: Math.min(merged.score, 15), tier: 'safe', findings: merged.findings };
      } else {
        analysis = { ...merged, tier: scoring.tierOf(merged.score, STATE.rules) };
      }

      STATE.lastAnalysis = {
        subject: data.subject,
        senderEmail: data.senderEmail,
        senderName: data.senderName,
        score: analysis.score,
        tier: analysis.tier,
        heuristicScore: analysis.heuristicScore,
        mlScore: analysis.mlScore,
        mlAvailable: analysis.mlAvailable,
        findings: analysis.findings,
        external: analysis.external || [],
        threadSummary: STATE.threadSummary,
        rulesVersion: analysis.rulesVersion,
        trusted,
        ts: Date.now()
      };

      renderBanner(analysis, trusted, analysis.mlAvailable ? 'blended with heuristics' : '', analysis.mlScore);

      // Notify if dangerous
      if (!trusted && analysis.tier === 'dangerous' && prefs.enableSound) {
        NS.notifications.notifyDangerous(data.subject, data.senderEmail);
      }

      // Persist history
      chrome.runtime.sendMessage({
        type: 'COS_ADD_HISTORY',
        entry: {
          ts: Date.now(),
          subject: data.subject,
          senderEmail: data.senderEmail,
          tier: analysis.tier,
          score: analysis.score,
          rulesVersion: analysis.rulesVersion
        }
      });
    } catch (e) {
      logger.error('analysis failed', e);
    } finally {
      STATE.analyzing = false;
    }
  }

  function startObserver() {
    let t = null;
    const obs = new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(analyzeAndDisplay, 500);
    });
    obs.observe(document.documentElement, { subtree: true, childList: true });
  }

  // ---- Hover link preview (B6) ----
  function installHoverPreview() {
    let tip = null;
    function show(e) {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a) { hide(); return; }
      if (!urlAnalysis.isHttpUrl(a.href)) return;
      if (!tip) {
        tip = document.createElement('div');
        tip.className = 'gpg-link-tip';
        document.body.appendChild(tip);
      }
      const host = urlAnalysis.hostOf(a.href);
      const punish = urlAnalysis.isIpLiteral(host) || urlAnalysis.isPunycode(host);
      tip.textContent = a.href;
      tip.className = 'gpg-link-tip ' + (punish ? 'bad' : 'good');
      tip.style.left = Math.min(window.innerWidth - 340, e.clientX + 12) + 'px';
      tip.style.top = (e.clientY + 16) + 'px';
      tip.style.display = 'block';
    }
    function hide() { if (tip) tip.style.display = 'none'; }
    document.addEventListener('mouseover', show, true);
    document.addEventListener('mouseout', hide, true);
    document.addEventListener('scroll', hide, true);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'COS_GET_LAST_RESULT') { sendResponse({ ok: true, result: STATE.lastAnalysis }); return true; }
    if (msg.type === 'COS_TRUST_SENDER' && STATE.lastAnalysis?.senderEmail) {
      storage.addToWhitelist(STATE.lastAnalysis.senderEmail).then(() => { STATE.lastHash = null; analyzeAndDisplay(); sendResponse({ ok: true }); });
      return true;
    }
    if (msg.type === 'COS_UNTRUST_SENDER' && STATE.lastAnalysis?.senderEmail) {
      storage.removeFromWhitelist(STATE.lastAnalysis.senderEmail).then(() => { STATE.lastHash = null; analyzeAndDisplay(); sendResponse({ ok: true }); });
      return true;
    }
    if (msg.type === 'COS_RUN_DEMO') {
      const demo = {
        subject: 'Important: Verify Your Account Immediately',
        bodyText: 'Dear user, we detected unusual activity. Your account will be suspended in 24 hours unless you verify your information. Click the secure link to confirm your password: urgent payment wire transfer',
        links: [{ href: 'http://paypa1-secure.verify-login.top/confirm', text: 'https://paypal.com/verify' }],
        senderEmail: 'support@secure-notice.example',
        senderName: 'PayPal Support',
        attachments: [{ name: 'invoice.pdf.exe', mime: '', size: 2048 }]
      };
      const local = scoring.analyzeEmailLocally(demo, STATE.rules, { mlFeatures: NS.ml.extractFeatures(demo, []) });
      const analysis = { ...local, external: [] };
      renderBanner(analysis, false, analysis.mlAvailable ? 'demo ML' : '', analysis.mlScore);
      sendResponse({ ok: true, result: analysis });
      return true;
    }
    if (msg.type === 'COS_ANALYZE_HEADERS') {
      const res = NS.headerParser.analyzeHeaders(msg.text || '', STATE.rules);
      sendResponse({ ok: true, result: res });
      return true;
    }
  });

  // ---- Bootstrap ----
  (async () => {
    try {
      STATE.site = detectSite();
      if (!STATE.site) { logger.warn('unsupported site'); return; }
      await i18n.load();
      STATE.rules = await loadRules();
      await NS.ml.load();
      const prefs = await storage.getPrefs();
      logger.setDebug(prefs.debug);
      logger.info(`COS 2040 v2 on ${STATE.site.id}`);
      startObserver();
      if (prefs.enableHover) installHoverPreview();
      analyzeAndDisplay();
      chrome.runtime.onMessage.addListener((m) => { if (m?.type === 'COS_REFRESH_PREFS') { storage.getPrefs().then(p => { if (p.enableHover) installHoverPreview(); }); } });
    } catch (e) {
      logger.error('bootstrap failed', e);
    }
  })();
})();