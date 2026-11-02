(function () {
  'use strict';
  const NS = (globalThis.COSShield = globalThis.COSShield || {});

  function extract() {
    const main = document.querySelector('[role="main"]') || document.body;
    if (!main) return null;

    const subjectNode = main.querySelector('[role="heading"]');
    const subject = subjectNode ? subjectNode.textContent.trim() : document.title.replace(/ - Outlook$/i, '').trim();

    const bodyNodes = main.querySelectorAll('[role="document"], div[aria-label*="Message body"]');
    const bodyNode = bodyNodes[bodyNodes.length - 1] || null;
    const bodyText = bodyNode ? bodyNode.innerText.trim() : '';

    let senderEmail = '', senderName = '';
    const senderEl = main.querySelector('[aria-label*="From"] [title*="@"]') || main.querySelector('[title*="@"]');
    if (senderEl) {
      const t = senderEl.getAttribute('title') || senderEl.textContent || '';
      const m = t.match(/<?([^\s<>]+@[^\s<>]+)>?/);
      senderEmail = (m ? m[1] : '').toLowerCase();
      senderName = (senderEl.textContent || '').replace(senderEmail, '').trim();
    }

    const links = bodyNode
      ? Array.from(bodyNode.querySelectorAll('a[href]')).map(a => ({ href: a.href, text: a.textContent.trim() })).filter(x => NS.urlAnalysis.isHttpUrl(x.href))
      : [];

    const attachments = [];
    main.querySelectorAll('[role="listitem"] a[download], a[href*="/attachment"]').forEach(a => {
      const t = (a.getAttribute('download') || a.textContent || '').trim();
      if (t) attachments.push({ name: t, mime: '', size: 0 });
    });

    if (!subject && !bodyText) return null;
    return { subject, bodyText, links, senderEmail, senderName, attachments, bodyEl: bodyNode, mainEl: main };
  }

  function collectMessages() {
    const bodyNodes = Array.from(document.querySelectorAll('[role="document"]'));
    return bodyNodes.map(b => ({
      subject: document.title,
      bodyText: b.innerText.trim(),
      senderEmail: '', senderName: '',
      links: Array.from(b.querySelectorAll('a[href]')).map(a => ({ href: a.href, text: a.textContent.trim() })).filter(x => NS.urlAnalysis.isHttpUrl(x.href)),
      attachments: []
    }));
  }

  NS.sites = NS.sites || {};
  NS.sites.outlook = { id: 'outlook', extract, collectMessages };
})();