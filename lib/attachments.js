(function () {
  'use strict';
  const NS = (globalThis.COSShield = globalThis.COSShield || {});

  // Office MIME types that hide macros
  const MACRO_MIMES = [
    'application/vnd.ms-word.document.macroenabled.12',
    'application/vnd.ms-excel.sheet.macroenabled.12',
    'application/vnd.ms-powerpoint.presentation.macroenabled.12',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document.macroenabled.12'
  ];

  // File extension → expected top-level MIME type
  const EXPECTED_MIME = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    zip: 'application/zip',
    rar: 'application/vnd.rar',
    '7z': 'application/x-7z-compressed'
  };

  function analyzeAttachments(items, rules) {
    const out = [];
    const risky = new Set(rules.riskyExtensions || []);
    const macros = new Set(rules.macroExtensions || []);
    const doubleRe = rules.doubleExtensionPattern ? new RegExp(rules.doubleExtensionPattern, 'i') : null;

    for (const item of items || []) {
      const name = typeof item === 'string' ? item : item.name || '';
      const mime = typeof item === 'string' ? '' : (item.mime || '');
      const size = typeof item === 'string' ? 0 : (item.size || 0);
      const lower = name.toLowerCase().trim();
      if (!lower) continue;

      if (doubleRe && doubleRe.test(lower)) {
        out.push({ id: 'doubleExtension', label: 'Double extension', weight: rules.weights.doubleExtension, evidence: name });
        continue;
      }
      const ext = lower.includes('.') ? lower.split('.').pop() : '';
      if (risky.has(ext)) {
        out.push({ id: 'riskyAttachment', label: 'Risky attachment', weight: rules.weights.riskyAttachment, evidence: name });
        continue;
      }
      if (macros.has(ext)) {
        out.push({ id: 'macroAttachment', label: 'Macro-enabled document', weight: rules.weights.macroAttachment, evidence: name });
        continue;
      }
      // MIME mismatch
      const expected = EXPECTED_MIME[ext];
      if (expected && mime && !mime.startsWith(expected.split('/')[0])) {
        out.push({ id: 'mimeMismatch', label: 'File-type mismatch', weight: 20, evidence: `${name} (${mime})` });
      }
      if (MACRO_MIMES.includes(mime)) {
        out.push({ id: 'macroMime', label: 'Macro-enabled (MIME)', weight: rules.weights.macroAttachment, evidence: name });
      }
      // Oversized small extensionless attachments
      if (!ext && size > 5 * 1024 * 1024) {
        out.push({ id: 'extensionlessBig', label: 'Large extensionless attachment', weight: 12, evidence: `${name || '(no name)'} ${Math.round(size / 1024)} KB` });
      }
    }
    return out;
  }

  NS.attachments = { analyzeAttachments };
})();