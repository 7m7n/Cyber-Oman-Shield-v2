(function () {
  'use strict';
  const NS = (globalThis.COSShield = globalThis.COSShield || {});

  function extract() {
    const main = document.querySelector('[data-test-id="message-view"], [role="main"]') || document.body;
    if (!main) return null;

    const subjNode = main.querySelector('[data-test-id="message-subject"], h1');
    const subject = subjNode ? subjNode.textContent.trim() : document.title.replace(/ - Yahoo Mail$/i, '').trim();

    const bodyNode = main.querySelector('[data-test-id="message-view-body-content"], .msg-body, .message-content');
    const bodyText = bodyNode ? bodyNode.innerText.trim() : '';

    let senderEmail = '', senderName = '';
    const senderEl = main.querySelector('[data-test-id="message-from"] [title*="@"]') || main.querySelector('.from [title*="@"]');
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
    main.querySelectorAll('[data-test-id="attachment"] a, .attachments a').forEach(a => {
      const t = (a.getAttribute('download') || a.textContent || '').trim();
      if (t) attachments.push({ name: t, mime: '', size: 0 });
    });

    if (!subject && !bodyText) return null;
    return { subject, bodyText, links, senderEmail, senderName, attachments, bodyEl: bodyNode, mainEl: main };
  }

  function collectMessages() {
    const bodies = Array.from(document.querySelectorAll('[data-test-id="message-view-body-content"], .msg-body'));
    return bodies.map(b => ({
      subject: document.title, bodyText: b.innerText.trim(),
      senderEmail: '', senderName: '',
      links: Array.from(b.querySelectorAll('a[href]')).map(a => ({ href: a.href, text: a.textContent.trim() })).filter(x => NS.urlAnalysis.isHttpUrl(x.href)),
      attachments: []
    }));
  }

  NS.sites = NS.sites || {};
  NS.sites.yahoo = { id: 'yahoo', extract, collectMessages };
})();