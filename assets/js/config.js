/* The Career Cat: public site configuration.
   Only PUBLIC identifiers belong here; this file is served to every visitor.
   Never put a secret key, password or token in this file. Values still in
   [SQUARE BRACKETS] are placeholders: the feature that uses them stays off. */
window.CC_CONFIG = {
  INTAKE_ENDPOINT: "[APPS_SCRIPT_EXEC_URL]",     // https://script.google.com/macros/s/…/exec (public)
  TURNSTILE_SITE_KEY: "[TURNSTILE_SITE_KEY]",   // public site key, NOT the secret
  GA4_ID: "[G-XXXXXXXXXX]"                      // used in Step 4
};
