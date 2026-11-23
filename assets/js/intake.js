/* The Career Cat: intake form.
   The form itself (intake.html) does a normal multipart POST to the form
   handler, which emails every field and the CV attachment to
   hello@careercat.co.za and then redirects to thanks.html. The visitor only
   sees "We've got your intake" when the handler has accepted the submission.
   This script adds inline validation, CV checks and drag-and-drop. Without
   JavaScript the form still submits, using the browser's own validation. */
(function () {
  'use strict';

  var form = document.getElementById('intakeForm');
  if (!form) return;

  var MAX_BYTES = 5 * 1024 * 1024;
  var ALLOWED = /\.(pdf|docx?)$/i;

  var fileInput = document.getElementById('cvFile');
  var fileName = document.getElementById('file-name');
  var zone = document.getElementById('uploadZone');
  var errorBox = document.getElementById('formErrors');
  var submitBtn = form.querySelector('button[type=submit]');
  var submitLabel = submitBtn ? submitBtn.querySelector('.submit-label') : null;
  var subject = form.querySelector('input[name=_subject]');

  form.noValidate = true; // we show our own messages instead of the browser bubbles

  function fileProblem(f) {
    if (!f) return '';
    if (!ALLOWED.test(f.name)) return 'Your CV must be a PDF or Word document (.pdf, .doc or .docx).';
    if (f.size > MAX_BYTES) return 'Your CV is larger than 5 MB. Please upload a smaller file, or WhatsApp it to us instead.';
    return '';
  }

  function showFile() {
    var f = fileInput.files && fileInput.files[0];
    if (!f) { fileName.hidden = true; fileName.textContent = ''; return; }
    var problem = fileProblem(f);
    fileName.textContent = problem ? problem : '✓ ' + f.name + ' (' + Math.max(1, Math.round(f.size / 1024)) + ' KB)';
    fileName.classList.toggle('is-error', !!problem);
    fileName.hidden = false;
  }

  if (fileInput && zone) {
    fileInput.addEventListener('change', showFile);
    zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('drag'); });
    zone.addEventListener('dragleave', function () { zone.classList.remove('drag'); });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      zone.classList.remove('drag');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        showFile();
      }
    });
  }

  function labelFor(el) {
    var l = form.querySelector('label[for="' + el.id + '"]');
    var text = l ? l.getAttribute('data-short') || l.textContent : el.name;
    return text.replace(/\s*\*\s*$/, '').trim();
  }

  function markInvalid(el, invalid) {
    el.setAttribute('aria-invalid', invalid ? 'true' : 'false');
    var holder = el.closest('.field, .consent-row');
    if (holder) holder.classList.toggle('is-invalid', invalid);
  }

  form.addEventListener('submit', function (e) {
    var problems = [];
    var firstBad = null;

    form.querySelectorAll('[required]').forEach(function (el) {
      var bad;
      if (el.type === 'checkbox') bad = !el.checked;
      else bad = !el.value.trim() || !el.checkValidity();
      markInvalid(el, bad);
      if (bad) {
        if (!firstBad) firstBad = el;
        if (el.type === 'checkbox') problems.push('Please tick: ' + labelFor(el));
        else if (el.type === 'email' && el.value.trim()) problems.push('Please enter a valid email address.');
        else problems.push(labelFor(el) + ' is required.');
      }
    });

    var f = fileInput && fileInput.files && fileInput.files[0];
    var fp = fileProblem(f);
    if (fp) {
      problems.push(fp);
      if (!firstBad) firstBad = fileInput;
    }

    if (problems.length) {
      e.preventDefault();
      errorBox.innerHTML = '';
      var h = document.createElement('p');
      h.textContent = 'Please fix the following before sending:';
      var ul = document.createElement('ul');
      problems.forEach(function (msg) {
        var li = document.createElement('li');
        li.textContent = msg;
        ul.appendChild(li);
      });
      errorBox.appendChild(h);
      errorBox.appendChild(ul);
      errorBox.hidden = false;
      if (firstBad) firstBad.focus();
      return;
    }

    errorBox.hidden = true;
    if (subject) {
      var name = (document.getElementById('fname').value + ' ' + document.getElementById('lname').value).trim();
      subject.value = 'New intake: ' + name + ' (careercat.co.za)';
    }
    // Let the browser POST the form (with the file). Prevent double-clicks.
    if (submitBtn) {
      submitBtn.disabled = true;
      if (submitLabel) submitLabel.textContent = 'Sending…';
    }
  });

  // Clear a field's error as soon as it's fixed.
  form.addEventListener('input', function (e) {
    if (e.target.getAttribute('aria-invalid') === 'true') {
      var ok = e.target.type === 'checkbox' ? e.target.checked : (e.target.value.trim() && e.target.checkValidity());
      if (ok) markInvalid(e.target, false);
    }
  });
  form.addEventListener('change', function (e) {
    if (e.target.type === 'checkbox' && e.target.checked) markInvalid(e.target, false);
  });

  // If the visitor comes back with the Back button, make the button usable again.
  window.addEventListener('pageshow', function () {
    if (submitBtn) {
      submitBtn.disabled = false;
      if (submitLabel) submitLabel.textContent = 'Submit Intake Form';
    }
  });
})();
