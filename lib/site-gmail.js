(function () {
  'use strict';
  const NS = (globalThis.COSShield = globalThis.COSShield || {});

  // Gmail keeps several div[role="main"] on the page (the inbox list stays hidden
  // while an email is open). Always use the one that is actually visible.
  function visibleMain() {
    return Array.from(document.querySelectorAll('div[role="main"]')).find(m => m.offsetParent !== null) || null;
  }

  function extract() {
    const main = visibleMain();
    if (!main) return null;

    const bodies = main.querySelectorAll('div.a3s');
    const bodyNode = bodies.length ? bodies[bodies.length - 1] : null;
    // No email body = no email is open (inbox list, or still loading). Don't analyze.
    if (!bodyNode) return null;
    const bodyText = bodyNode.innerText.trim();

    let subject = '';
    const sn = main.querySelector('h2[role="heading"], h1[role="heading"]');
    if (sn) subject = sn.textContent.trim();
    if (!subject) subject = document.title.replace(/^Gmail\s*-\s*/i, '').replace(/\s*-\s*Gmail.*/i, '').trim();

    const senderEl = main.querySelector('span[email]');
    const senderEmail = senderEl ? (senderEl.getAttribute('email') || '').toLowerCase() : '';
    const senderName = senderEl ? (senderEl.getAttribute('name') || senderEl.textContent.trim()) : '';

    const links = Array.from(bodyNode.querySelectorAll('a[href]'))
      .map(a => ({ href: a.href, text: a.textContent.trim() }))
      .filter(x => NS.urlAnalysis.isHttpUrl(x.href));

    const attachments = [];
    main.querySelectorAll('[download_url], span[title]').forEach(el => {
      const t = el.getAttribute('title') || el.textContent || '';
      if (/\.[a-z0-9]{2,5}$/i.test(t.trim())) attachments.push({ name: t.trim(), mime: '', size: 0 });
    });

    return { subject, bodyText, links, senderEmail, senderName, attachments, bodyEl: bodyNode, mainEl: main };
  }

  function collectMessages() {
    const main = visibleMain();
    if (!main) return [];
    const bodies = Array.from(main.querySelectorAll('div.a3s'));
    const subjects = Array.from(main.querySelectorAll('h2[role="heading"], h1[role="heading"]'));
    return bodies.map((b, i) => ({
      subject: subjects[i]?.textContent?.trim() || '',
      bodyText: b.innerText.trim(),
      senderEmail: '',
      senderName: '',
      links: Array.from(b.querySelectorAll('a[href]')).map(a => ({ href: a.href, text: a.textContent.trim() })).filter(x => NS.urlAnalysis.isHttpUrl(x.href)),
      attachments: []
    }));
  }

  NS.sites = NS.sites || {};
  NS.sites.gmail = { id: 'gmail', extract, collectMessages };
})();
