/**
 * CareerCat intake handler — Google Apps Script web app.
 * Deploy: Execute as "Me" (the CareerCat Google account), access "Anyone".
 * Script Properties required: TURNSTILE_SECRET, FOLDER_ID, SHEET_ID, NOTIFY_TO, SEND_CONFIRMATION
 * Never put secrets or IDs in this file; it is also committed to the public repo for reference.
 */
const MAX_FILE_BYTES   = 5 * 1024 * 1024;          // 5 MB decoded
const MAX_BODY_CHARS   = 7.5 * 1024 * 1024;        // base64 of 5 MB plus the fields; reject anything bigger
const RATE_PER_EMAIL   = 3;                        // submissions per email per hour
const RATE_GLOBAL      = 40;                       // submissions per hour, all visitors
const ALLOWED = {
  pdf:  { mimes: ['application/pdf'], magic: [0x25, 0x50, 0x44, 0x46] },                           // %PDF
  docx: { mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], magic: [0x50, 0x4B, 0x03, 0x04] }, // PK..
  doc:  { mimes: ['application/msword'], magic: [0xD0, 0xCF, 0x11, 0xE0] }                         // OLE2
};
const FIELDS = ['fname','lname','email','phone','city','pref_contact','status','exp_level',
                'industry','job_title','target_role','services','background','challenges',
                'consent_tos','consent_popia','consent_comms'];
const MAXLEN = { background: 3000, challenges: 3000, services: 300 };   // others: 200

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || '';
    if (!raw || raw.length > MAX_BODY_CHARS) return reply_(false, 'too_large');
    let data;
    try { data = JSON.parse(raw); } catch (err) { return reply_(false, 'bad_request'); }

    // 1. Honeypot: bots fill hidden fields. Pretend success, store nothing.
    if (data._gotcha) return reply_(true, 'ok');

    const props = PropertiesService.getScriptProperties();

    // 2. Turnstile, verified server-side
    if (!verifyTurnstile_(data.turnstileToken, props.getProperty('TURNSTILE_SECRET'))) {
      return reply_(false, 'captcha_failed');
    }

    // 3. Validate fields
    const f = {};
    FIELDS.forEach(k => { f[k] = clean_(data[k], MAXLEN[k] || 200); });
    if (!f.fname || !f.lname || !f.status || !f.exp_level) return reply_(false, 'missing_fields');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email)) return reply_(false, 'bad_email');
    if (f.consent_tos !== 'on' || f.consent_popia !== 'on') return reply_(false, 'consent_required');

    // 4. Rate limit (Apps Script has no client IP, so: per email + a global ceiling)
    if (!rateOk_('em:' + f.email.toLowerCase(), RATE_PER_EMAIL) || !rateOk_('global', RATE_GLOBAL)) {
      return reply_(false, 'rate_limited');
    }

    // 5. Optional CV file
    let fileUrl = '', fileName = '';
    if (data.file && data.file.base64) {
      const res = saveCv_(data.file, f, props.getProperty('FOLDER_ID'));
      if (!res.ok) return reply_(false, res.error);
      fileUrl = res.url; fileName = res.name;
    }

    // 6. Append to the Sheet (lock so simultaneous posts don't clash)
    const ref = 'CC-' + Utilities.formatDate(new Date(), 'Africa/Johannesburg', 'yyyyMMdd-HHmmss') +
                '-' + Math.floor(Math.random() * 1000);
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      const sh = SpreadsheetApp.openById(props.getProperty('SHEET_ID')).getSheets()[0];
      if (sh.getLastRow() === 0) sh.appendRow(['Ref','Received (SAST)'].concat(FIELDS).concat(['CV file','CV link']));
      sh.appendRow([ref, Utilities.formatDate(new Date(), 'Africa/Johannesburg', 'yyyy-MM-dd HH:mm')]
        .concat(FIELDS.map(k => sheetSafe_(f[k]))).concat([sheetSafe_(fileName), fileUrl]));
    } finally { lock.releaseLock(); }

    // 7. Notify hello@ (the lead is already saved, so a mail failure is not fatal)
    try {
      if (MailApp.getRemainingDailyQuota() > 0) {
        MailApp.sendEmail({
          to: props.getProperty('NOTIFY_TO'),
          replyTo: f.email,
          name: 'CareerCat Intake',
          subject: 'New intake: ' + f.fname + ' ' + f.lname + ' (' + ref + ')',
          htmlBody: notifyHtml_(f, fileUrl, ref)
        });
        if (props.getProperty('SEND_CONFIRMATION') === 'true' && MailApp.getRemainingDailyQuota() > 0) {
          MailApp.sendEmail({
            to: f.email,
            replyTo: props.getProperty('NOTIFY_TO'),
            name: 'The Career Cat',
            subject: 'We received your intake form (' + ref + ')',
            htmlBody: '<p>Hi ' + esc_(f.fname) + ',</p><p>Thanks for your intake form. We will be in touch ' +
                      'within one business day. Your reference is <b>' + ref + '</b>.</p>' +
                      '<p>The Career Cat · hello@careercat.co.za · +27 68 914 5518</p>'
          });
        }
      } else {
        console.warn('MailApp quota exhausted; lead ' + ref + ' saved to Sheet only.');
      }
    } catch (mailErr) { console.error('Mail failed for ' + ref + ': ' + mailErr); }

    return reply_(true, 'ok', ref);
  } catch (err) {
    console.error(err);
    return reply_(false, 'server_error');
  }
}

function doGet() { return reply_(false, 'method_not_allowed'); }

function verifyTurnstile_(token, secret) {
  if (!token || !secret) return false;
  const r = UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'post', payload: { secret: secret, response: String(token) }, muteHttpExceptions: true
  });
  try {
    const j = JSON.parse(r.getContentText());
    return j.success === true && (!j.hostname || ['careercat.co.za','localhost'].indexOf(j.hostname) !== -1);
  } catch (e) { return false; }
}

function saveCv_(file, f, folderId) {
  const name = String(file.name || '');
  const ext = (name.split('.').pop() || '').toLowerCase();
  const rule = ALLOWED[ext];
  if (!rule) return { ok: false, error: 'file_type' };
  if (file.type && rule.mimes.indexOf(String(file.type)) === -1) return { ok: false, error: 'file_type' };
  let bytes;
  try { bytes = Utilities.base64Decode(String(file.base64)); } catch (e) { return { ok: false, error: 'file_corrupt' }; }
  if (bytes.length === 0 || bytes.length > MAX_FILE_BYTES) return { ok: false, error: 'file_size' };
  for (let i = 0; i < rule.magic.length; i++) {
    if (((bytes[i] + 256) % 256) !== rule.magic[i]) return { ok: false, error: 'file_type' };   // bytes are signed
  }
  const safeBase = (f.fname + '-' + f.lname).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'cv';
  const safeName = Utilities.formatDate(new Date(), 'Africa/Johannesburg', 'yyyyMMdd-HHmm') + '_' + safeBase + '.' + ext;
  const blob = Utilities.newBlob(bytes, rule.mimes[0], safeName);
  const created = DriveApp.getFolderById(folderId).createFile(blob);   // inherits the folder's private sharing
  created.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); // belt and braces: never public
  return { ok: true, url: created.getUrl(), name: safeName };
}

function rateOk_(key, limit) {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get('rl:' + key) || 0);
  if (n >= limit) return false;
  cache.put('rl:' + key, String(n + 1), 3600);   // 1-hour window
  return true;
}

function clean_(v, max) {
  if (Array.isArray(v)) v = v.join(', ');
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}
function sheetSafe_(s) { return /^[=+\-@\t\r]/.test(s) ? "'" + s : s; }   // block formula injection
function esc_(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function notifyHtml_(f, fileUrl, ref) {
  const rows = FIELDS.map(k => '<tr><td style="padding:2px 8px;color:#555">' + k + '</td><td style="padding:2px 8px">' +
                                esc_(f[k]).replace(/\n/g, '<br>') + '</td></tr>').join('');
  return '<p><b>New Career Cat intake ' + ref + '</b></p><table>' + rows + '</table>' +
         (fileUrl ? '<p>CV (private Drive link, sign in as an allowed account): <a href="' + fileUrl + '">' + fileUrl + '</a></p>'
                  : '<p>No CV uploaded.</p>') +
         '<p>Reply to this email to answer the client directly.</p>';
}

function reply_(ok, code, ref) {
  return ContentService.createTextOutput(JSON.stringify({ ok: ok, code: code, ref: ref || null }))
                       .setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor after setting Script Properties. */
function testSetup() {
  const p = PropertiesService.getScriptProperties();
  ['TURNSTILE_SECRET','FOLDER_ID','SHEET_ID','NOTIFY_TO'].forEach(k => { if (!p.getProperty(k)) throw new Error('Missing property ' + k); });
  const folder = DriveApp.getFolderById(p.getProperty('FOLDER_ID'));
  if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error('CV folder is shared publicly. Make it private!');
  SpreadsheetApp.openById(p.getProperty('SHEET_ID'));
  console.log('OK. Mail quota left today: ' + MailApp.getRemainingDailyQuota());
}
