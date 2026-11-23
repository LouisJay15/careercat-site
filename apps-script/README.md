# CareerCat intake backend (Google Apps Script + Cloudflare Turnstile)

The intake form on `intake.html` posts each submission, with the CV if one is attached, to a
Google Apps Script web app. The script checks the submission, saves the CV to a private
Google Drive folder, adds a row to a Google Sheet and emails `hello@careercat.co.za`.
The browser shows "We've got your intake!" only when the script replies `{ ok: true }`.

```
Browser (intake.html + assets/js/intake.js)
   │  POST, Content-Type: text/plain (a JSON string; this avoids a CORS preflight)
   │  { fields…, file: {name, type, size, base64}, turnstileToken, _gotcha }
   ▼
Apps Script web app  https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec   (doPost)
   runs as the dedicated CareerCat Google account, NOT a personal Gmail
   1. size / honeypot / rate-limit checks   2. Turnstile siteverify (secret in Script Properties)
   3. validate fields and the file (extension + MIME + magic bytes, ≤ 5 MB)
   4. save the CV to a PRIVATE Drive folder   5. append a row to the "CareerCat Leads" Sheet
   6. MailApp → hello@careercat.co.za (replyTo = submitter)   7. optional confirmation to the submitter
   ▼
JSON { ok: true, ref } or { ok: false, code }   →   the browser shows success or error honestly
```

`Code.gs` in this folder is a reference copy of the server code. It contains **no secrets or
IDs**: those live only in the script's Script Properties. Never commit them to this repo.

## Setup (Louis does this; Claude Code must not)

Do everything below while signed in to the dedicated CareerCat Google account.

1. **Create the dedicated Google account**, for example `careercat.leads@gmail.com` (or use
   Google Workspace if email moves there later). Turn on 2-Step Verification.
2. **Create the Drive folder** "CareerCat CVs". Share it only with your and your partner's
   Google accounts, as Editor or Viewer. Never use "Anyone with the link". Copy the folder ID
   from the URL: `drive.google.com/drive/folders/<FOLDER_ID>`.
3. **Create the Sheet** "CareerCat Leads" in the same account. Share it the same way, and copy
   its ID from the URL: `docs.google.com/spreadsheets/d/<SHEET_ID>/edit`.
4. **Create the Turnstile widget.** In the Cloudflare dashboard go to Turnstile → Add widget.
   - Allowed hostnames: `careercat.co.za` and `localhost`. Mode: Managed.
   - Copy the **site key** (public): it goes in `assets/js/config.js` as `TURNSTILE_SITE_KEY`.
   - Copy the **secret key** (private): it goes **only** in Script Properties (step 5).
5. **Create the script.** Go to <https://script.google.com> → New project → name it
   "CareerCat Intake". Paste the contents of `Code.gs`. Then Project Settings → Script
   Properties → add:

   | Property            | Value                                   |
   |---------------------|-----------------------------------------|
   | `TURNSTILE_SECRET`  | the Turnstile secret key                |
   | `FOLDER_ID`         | the Drive folder ID                     |
   | `SHEET_ID`          | the Sheet ID                            |
   | `NOTIFY_TO`         | `hello@careercat.co.za`                 |
   | `SEND_CONFIRMATION` | `true` or `false`                       |

6. **Deploy.** Deploy → New deployment → type **Web app**.
   - Execute as: **Me** (the CareerCat account). Who has access: **Anyone**.
   - Authorise the Drive, Sheets, Mail and external-request scopes. Google shows an
     "unverified app" warning for your own script: choose Advanced → Go to CareerCat Intake.
   - Copy the `/exec` URL into `assets/js/config.js` as `INTAKE_ENDPOINT`. This URL is public
     by nature and safe to commit.
7. **After every change to `Code.gs`, redeploy:** Deploy → Manage deployments → edit (pencil)
   → Version: New version → Deploy. If you skip this, the `/exec` URL keeps running the old
   code. Editing the existing deployment keeps the same URL.
8. **Test.** Run `testSetup()` once from the editor (it checks the properties, folder, sheet and
   mail quota). Then submit the live form with a small PDF and check that:
   - a file with a tidy name lands in the private Drive folder;
   - the Sheet gains a row, including city and preferred contact;
   - hello@ gets the notification, and pressing Reply addresses the submitter;
   - the website shows a reference number.

Until steps 4–6 are done and both values are in `assets/js/config.js`, the form does not
pretend to send: it hides the CV upload, asks people to email or WhatsApp their CV, and shows
an error with those contact options if they press Submit.

## Known limits (fine at CareerCat's volume)

- **Email quota:** a consumer Google account can send to about 100 recipients a day through
  MailApp (Google Workspace allows 1,500). Each lead uses 1 recipient, or 2 with the
  confirmation. Google's current figures:
  <https://developers.google.com/apps-script/guides/services/quotas>. The script checks
  `MailApp.getRemainingDailyQuota()` and still saves the lead if the quota runs out.
- **Run time and file size:** Apps Script allows 6 minutes per run. A 5 MB file becomes about
  6.7 MB of base64, well within limits.
- **No visitor IP:** Apps Script never sees the visitor's IP address, so rate limiting is keyed
  on the email address (3 an hour) plus a global ceiling (40 an hour).
- **Always HTTP 200:** Apps Script web apps can't set status codes, so the browser decides
  success from the JSON `ok` field, never from the HTTP status alone.

## Retention (POPIA)

CVs in Drive and rows in the Sheet must be deleted after the retention period stated in the
Privacy Policy. Set a monthly reminder to delete old files and rows, or ask for a
time-driven `purgeOld()` function to be added.
