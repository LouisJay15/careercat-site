/* The Career Cat: intake page (intake.html).
 *
 * Sends the form, and an optional CV, to the Google Apps Script web app set in
 * assets/js/config.js (see apps-script/README.md). The visitor sees success ONLY
 * when the server replies { ok: true }. Anything else shows an error with a
 * WhatsApp / email fallback. Until the endpoint and Turnstile site key are filled
 * in, the form says so honestly instead of pretending to send.
 */
(function () {
  'use strict';

  var CFG = window.CC_CONFIG || {};
  function isSet(v) { return typeof v === 'string' && v.trim() !== '' && v.trim().charAt(0) !== '['; }
  var READY = isSet(CFG.INTAKE_ENDPOINT) && isSet(CFG.TURNSTILE_SITE_KEY);

  /* ---------- Page chrome (moved from the old inline script) ---------- */
  var ham = document.getElementById('hamburger');
  var mob = document.getElementById('mobileMenu');
  if (ham && mob) ham.addEventListener('click', function () { mob.classList.toggle('open'); });
  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (x) { if (x.isIntersecting) x.target.classList.add('visible'); });
  }, { threshold: 0.12 });
  document.querySelectorAll('.fade-up').forEach(function (el) { obs.observe(el); });
  window.addEventListener('scroll', function () {
    var n = document.querySelector('nav.site-nav');
    if (n) n.classList.toggle('scrolled', window.scrollY > 50);
  }, { passive: true });

  /* ---------- Form ---------- */
  var form = document.getElementById('intakeForm');
  if (!form) return;

  var ALLOWED_EXT = {
    pdf: ['application/pdf'],
    doc: ['application/msword'],
    docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  };
  var MAX_BYTES = 5 * 1024 * 1024;
  var ERRORS = {
    captcha_failed: 'The security check failed. Please tick it again.',
    file_type: 'Please upload a PDF, DOC or DOCX file.',
    file_corrupt: 'Your CV file could not be read. Please try another copy.',
    file_size: 'Your CV must be 5 MB or smaller.',
    too_large: 'Your CV must be 5 MB or smaller.',
    rate_limited: 'Too many submissions. Please try again in an hour.',
    consent_required: 'Please accept the Privacy Policy and Terms.',
    missing_fields: 'Please fill in all the required fields.',
    bad_email: 'Please check your email address.'
  };
  var BUTTON_TEXT = 'Submit Intake Form';

  var btn = form.querySelector('button[type=submit]');
  var btnLabel = btn.querySelector('.submit-label') || btn;
  var okBox = document.getElementById('successMsg');
  var errBox = document.getElementById('errorMsg');
  var zone = document.getElementById('uploadZone');
  var fileInput = document.getElementById('cvFile');
  var fileName = document.getElementById('file-name');
  var uploadFallback = document.getElementById('uploadFallback');
  var tsBox = document.getElementById('turnstileBox');
  var widgetId = null;

  function link(href, text) {
    var a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    if (href.indexOf('https://') === 0) { a.target = '_blank'; a.rel = 'noopener'; }
    return a;
  }

  // Shows an error. Server and network errors also offer the WhatsApp / email fallback.
  // `lead` replaces the default "If it keeps failing…" wording; pass false for no fallback.
  function showError(msg, lead) {
    errBox.textContent = '';
    errBox.appendChild(document.createTextNode(msg));
    if (lead !== false) {
      errBox.appendChild(document.createTextNode(lead || ' If it keeps failing, WhatsApp your CV to '));
      errBox.appendChild(link('https://wa.me/27689145518', '+27 68 914 5518'));
      errBox.appendChild(document.createTextNode(' or email '));
      errBox.appendChild(link('mailto:hello@careercat.co.za', 'hello@careercat.co.za'));
      errBox.appendChild(document.createTextNode('.'));
    }
    errBox.hidden = false;
    okBox.style.display = 'none';
    errBox.scrollIntoView({ block: 'center' });
  }

  function validateFile(file) {
    if (!file) return null;
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXT[ext]) return ERRORS.file_type;
    if (file.type && ALLOWED_EXT[ext].indexOf(file.type) === -1) return ERRORS.file_type;  // some browsers send ''
    if (file.size > MAX_BYTES) return ERRORS.file_size;
    return null;
  }

  function toBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1]); };   // strip the "data:…;base64," prefix
      r.onerror = function () { reject(r.error); };
      r.readAsDataURL(file);
    });
  }

  /* ---------- CV upload: click, keyboard, drag and drop ---------- */
  function showFileState() {
    var f = fileInput.files && fileInput.files[0];
    if (!f) { fileName.style.display = 'none'; return; }
    var problem = validateFile(f);
    fileName.textContent = problem ? problem : '✓ ' + f.name;
    fileName.classList.toggle('is-error', !!problem);
    fileName.style.display = 'block';
  }
  zone.addEventListener('click', function () { fileInput.click(); });
  zone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', function () { zone.classList.remove('drag'); });
  zone.addEventListener('drop', function (e) {
    e.preventDefault();
    zone.classList.remove('drag');
    if (e.dataTransfer && e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      showFileState();
    }
  });
  fileInput.addEventListener('change', showFileState);

  /* ---------- Turnstile (bot check) ---------- */
  function loadTurnstile() {
    window.ccTurnstileReady = function () {
      widgetId = window.turnstile.render(tsBox, { sitekey: CFG.TURNSTILE_SITE_KEY });
    };
    var s = document.createElement('script');
    // Turnstile's api.js changes over time, so it can't use SRI; the CSP allowlists it instead.
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=ccTurnstileReady';
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }

  if (READY) {
    loadTurnstile();
  } else {
    // Not connected yet: don't offer an upload that goes nowhere.
    console.warn('Intake form is not connected: set INTAKE_ENDPOINT and TURNSTILE_SITE_KEY in assets/js/config.js.');
    zone.hidden = true;
    fileName.style.display = 'none';
    uploadFallback.hidden = false;
    tsBox.hidden = true;
  }

  /* ---------- Required fields (the original checks, without alert()) ---------- */
  function runRequiredFieldValidation(f) {
    var ok = true;
    var first = null;
    f.querySelectorAll('[required]').forEach(function (el) {
      var bad = el.type === 'checkbox' ? !el.checked : (!el.value.trim() || !el.checkValidity());
      if (el.type === 'checkbox') el.parentElement.style.outline = bad ? '2px solid red' : '';
      else el.style.borderBottomColor = bad ? 'red' : '';
      el.setAttribute('aria-invalid', bad ? 'true' : 'false');
      if (bad) { ok = false; if (!first) first = el; }
    });
    if (!ok) {
      showError('Please complete all required fields (marked *) and check that your email address is valid.', false);
      first.focus();
    }
    return ok;
  }

  /* ---------- Submit ---------- */
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errBox.hidden = true;
    if (!runRequiredFieldValidation(form)) return;

    if (!READY) {
      return showError('Our online form isn’t connected yet, so your details were not sent.',
        ' Please WhatsApp your details and CV to ');
    }

    var last = 0;
    try { last = Number(window.sessionStorage.getItem('cc_last_submit') || 0); } catch (_) { /* storage blocked */ }
    if (Date.now() - last < 30000) return showError('Please wait a moment before submitting again.', false);  // UX only; real limits are server-side

    var fd = new FormData(form);
    var file = fileInput.files[0];
    var fileErr = validateFile(file);
    if (fileErr) return showError(fileErr);

    var token = fd.get('cf-turnstile-response');
    if (!token) return showError('Please complete the security check.', false);

    var payload = {};
    for (var pair of fd.entries()) {
      var k = pair[0];
      if (k === 'cvFile' || k === 'cf-turnstile-response') continue;
      payload[k] = k === 'services' ? fd.getAll('services') : pair[1];
    }
    payload.turnstileToken = token;

    btn.disabled = true;
    btnLabel.textContent = 'Sending…';
    try {
      if (file) payload.file = { name: file.name, type: file.type, size: file.size, base64: await toBase64(file) };
      var res = await fetch(CFG.INTAKE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },  // simple request, so no CORS preflight
        body: JSON.stringify(payload),
        redirect: 'follow'
      });
      var json = null;
      try { json = await res.json(); } catch (_) { /* not JSON: treated as failure below */ }

      if (res.ok && json && json.ok === true) {               // success ONLY on a confirmed OK
        try { window.sessionStorage.setItem('cc_last_submit', String(Date.now())); } catch (_) { /* ignore */ }
        var oldRef = okBox.querySelector('.intake-ref');
        if (oldRef) oldRef.remove();
        if (json.ref) {
          var p = document.createElement('p');
          p.className = 'intake-ref';
          p.append('Your reference: ');
          var strong = document.createElement('strong');
          strong.textContent = json.ref;                         // no innerHTML
          p.append(strong);
          okBox.append(p);
        }
        okBox.style.display = 'block';
        form.reset();
        fileName.style.display = 'none';
        okBox.focus();
        okBox.scrollIntoView({ block: 'center' });
        if (window.gtagConsented && window.gtag) window.gtag('event', 'intake_submit');   // Step 4, only with consent
      } else {
        showError((json && ERRORS[json.code]) || 'Sorry, your form didn’t send.');
      }
    } catch (err) {
      showError('Sorry, your form didn’t send (network error).');
    } finally {
      btn.disabled = false;
      btnLabel.textContent = BUTTON_TEXT;
      if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
    }
  });
})();
