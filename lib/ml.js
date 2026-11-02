(function () {
  'use strict';
  const NS = (globalThis.COSShield = globalThis.COSShield || {});
  let model = null;

  const FEATURES = [
    'has_urgency','has_password_word','has_money_word','has_brand_mismatch',
    'has_ip_url','has_punycode','has_suspicious_tld','has_shortener',
    'link_count_log','body_length_log','uppercase_ratio','exclamation_ratio',
    'has_attachment_risky','has_macro_ext','has_double_ext','has_form_tag',
    'has_hidden_text','has_qr_image','display_name_spoof','reply_to_mismatch',
    'first_seen_sender','thread_history_flag','arabic_urgency','arabic_keyword',
    'html_script_tag','html_iframe','has_base64_image','many_links_ratio',
    'url_entropy_avg','url_brand_path'
  ];

  async function load() {
    if (model) return model;
    try {
      const res = await fetch(chrome.runtime.getURL('ml/model.json'));
      model = await res.json();
    } catch (e) {
      NS.logger?.warn('ML model load failed', e);
      model = null;
    }
    return model;
  }

  function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }

  function predict(features) {
    if (!model || !model.weights) return { available: false, score: 0, probability: 0 };
    let z = model.bias || 0;
    for (let i = 0; i < FEATURES.length; i++) {
      const w = model.weights[i] || 0;
      z += w * (features[FEATURES[i]] || 0);
    }
    const p = sigmoid(z);
    // scale probability to 0..100 risk
    const score = Math.round(p * 100);
    return { available: true, score, probability: p };
  }

  function extractFeatures(data, findings) {
    const text = ((data.subject || '') + '\n' + (data.bodyText || '')).toLowerCase();
    const links = data.links || [];
    const f = {};
    f.has_urgency = /urgent|immediate|within 24|act now|final warning/i.test(text) ? 1 : 0;
    f.has_password_word = /password|كلمة المرور/i.test(text) ? 1 : 0;
    f.has_money_word = /payment|bank|invoice|wire|bitcoin|transfer|دفع|بنك/i.test(text) ? 1 : 0;
    f.has_brand_mismatch = findings.some(x => x.id.startsWith('url.brand.')) ? 1 : 0;
    f.has_ip_url = findings.some(x => x.id === 'url.ip') ? 1 : 0;
    f.has_punycode = findings.some(x => x.id === 'url.punycode') ? 1 : 0;
    f.has_suspicious_tld = findings.some(x => x.id.startsWith('url.tld')) ? 1 : 0;
    f.has_shortener = findings.some(x => x.id === 'url.short') ? 1 : 0;
    f.link_count_log = Math.log(1 + links.length);
    f.body_length_log = Math.log(1 + (data.bodyText || '').length);
    f.uppercase_ratio = ((data.bodyText || '').match(/[A-Z]/g) || []).length / Math.max(1, (data.bodyText || '').length);
    f.exclamation_ratio = ((data.bodyText || '').match(/!/g) || []).length / Math.max(1, (data.bodyText || '').length);
    f.has_attachment_risky = findings.some(x => x.id === 'riskyAttachment') ? 1 : 0;
    f.has_macro_ext = findings.some(x => x.id === 'macroAttachment') ? 1 : 0;
    f.has_double_ext = findings.some(x => x.id === 'doubleExtension') ? 1 : 0;
    f.has_form_tag = findings.some(x => x.id === 'html.form') ? 1 : 0;
    f.has_hidden_text = findings.some(x => x.id.startsWith('html.hidden')) ? 1 : 0;
    f.has_qr_image = findings.some(x => x.id === 'qr.detected') ? 1 : 0;
    f.display_name_spoof = findings.some(x => x.id.startsWith('spoof.')) ? 1 : 0;
    f.reply_to_mismatch = findings.some(x => x.id === 'replyTo.mismatch') ? 1 : 0;
    f.first_seen_sender = findings.some(x => x.id === 'sender.firstSeen') ? 1 : 0;
    f.thread_history_flag = findings.some(x => x.id === 'thread.history') ? 1 : 0;
    f.arabic_urgency = /عاجل|تحقق الآن|تصرف الآن|فرصة أخيرة/.test(text) ? 1 : 0;
    f.arabic_keyword = /حساب|كلمة المرور|فاتورة|بنك|دفع/.test(text) ? 1 : 0;
    f.html_script_tag = findings.some(x => x.id === 'html.script') ? 1 : 0;
    f.html_iframe = findings.some(x => x.id === 'html.iframe') ? 1 : 0;
    f.has_base64_image = findings.some(x => x.id === 'html.base64img') ? 1 : 0;
    f.many_links_ratio = links.length > 5 ? 1 : 0;
    f.url_entropy_avg = links.length ? links.reduce((s, u) => s + (NS.urlAnalysis?.entropy(typeof u === 'string' ? u : (u.href || '')) || 0), 0) / links.length / 8 : 0;    
    f.url_brand_path = findings.some(x => x.id.startsWith('url.brand.')) ? 1 : 0;
    return f;
  }

  NS.ml = { load, predict, extractFeatures, FEATURES };
})();
