/* The Career Cat: behaviour shared by every page.
   Loaded with `defer`. There are no inline scripts on the site, so the
   Content-Security-Policy can refuse to run any script that isn't ours. */
(function () {
  'use strict';

  /* ---- Google Analytics 4: OFF until you paste an ID here -------------
     1. analytics.google.com -> Admin -> Create property (careercat.co.za).
     2. Copy the Measurement ID (looks like G-XXXXXXXXXX) between the quotes.
     While this is empty nothing is loaded and no cookie banner is shown.
     Once it is set, visitors get a consent banner and GA only loads after
     they press "Accept" (POPIA). Their choice is remembered on their device. */
  var GA_MEASUREMENT_ID = '';
  var CONSENT_KEY = 'cc-analytics-consent';

  /* ---- Mobile menu --------------------------------------------------- */
  var ham = document.getElementById('hamburger');
  var mob = document.getElementById('mobileMenu');
  if (ham && mob) {
    ham.addEventListener('click', function () {
      var open = mob.classList.toggle('open');
      ham.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* ---- Nav shadow once the page scrolls ------------------------------ */
  var nav = document.querySelector('nav');
  if (nav) {
    window.addEventListener('scroll', function () {
      nav.classList.toggle('scrolled', window.scrollY > 50);
    }, { passive: true });
  }

  /* ---- Fade sections in as they scroll into view --------------------- */
  var fades = document.querySelectorAll('.fade-up');
  if ('IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    fades.forEach(function (el) { obs.observe(el); });
  } else {
    fades.forEach(function (el) { el.classList.add('visible'); });
  }

  /* ---- Pricing tabs (home page) -------------------------------------- */
  var tabs = document.querySelectorAll('[data-tab]');
  tabs.forEach(function (btn) {
    btn.addEventListener('click', function () {
      tabs.forEach(function (t) {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.pricing-panel').forEach(function (p) {
        p.classList.remove('active');
        p.hidden = true;
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      var panel = document.getElementById(btn.getAttribute('data-tab'));
      if (panel) {
        panel.hidden = false;
        panel.classList.add('active');
      }
    });
  });

  /* ---- Current year in the footer ------------------------------------ */
  var year = String(new Date().getFullYear());
  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = year; });

  /* ---- Analytics consent --------------------------------------------- */
  function readConsent() {
    try { return window.localStorage.getItem(CONSENT_KEY); } catch (e) { return null; }
  }
  function saveConsent(value) {
    try { window.localStorage.setItem(CONSENT_KEY, value); } catch (e) { /* private mode: ask again next visit */ }
  }
  function clearConsent() {
    try { window.localStorage.removeItem(CONSENT_KEY); } catch (e) { /* ignore */ }
  }

  function loadAnalytics() {
    if (window.__ccGaLoaded) return;
    window.__ccGaLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID);
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_MEASUREMENT_ID);
    document.head.appendChild(s);
  }

  function deleteGaCookies() {
    var host = window.location.hostname;
    var domains = ['', host, '.' + host.replace(/^www\./, '')];
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (name.indexOf('_ga') === 0) {
        domains.forEach(function (d) {
          document.cookie = name + '=; Max-Age=0; path=/' + (d ? '; domain=' + d : '');
        });
      }
    });
  }

  function showBanner() {
    if (document.getElementById('consentBanner')) return;
    var bar = document.createElement('div');
    bar.id = 'consentBanner';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Cookie consent');
    bar.style.cssText = 'position:fixed;left:1rem;right:1rem;bottom:1rem;z-index:300;max-width:560px;' +
      'background:#0d0d0d;color:#f5f5f3;padding:1.25rem 1.25rem 1rem;box-shadow:0 8px 32px rgba(0,0,0,.35);' +
      'font-size:.85rem;line-height:1.55;border-left:4px solid #ebde00;';
    var p = document.createElement('p');
    p.style.cssText = 'margin:0 0 .9rem;';
    p.appendChild(document.createTextNode('We’d like to use Google Analytics cookies to count visits and see which pages help people. They stay off unless you accept. '));
    var link = document.createElement('a');
    link.href = 'privacy.html#cookies';
    link.textContent = 'Read our Privacy Notice';
    link.style.cssText = 'color:#ebde00;font-weight:600;';
    p.appendChild(link);
    p.appendChild(document.createTextNode('.'));
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:.75rem;flex-wrap:wrap;';
    function button(label, primary, onClick) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'font:inherit;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:.72rem;' +
        'padding:10px 18px;cursor:pointer;border:2px solid #ebde00;' +
        (primary ? 'background:#ebde00;color:#0d0d0d;' : 'background:transparent;color:#f5f5f3;');
      b.addEventListener('click', onClick);
      return b;
    }
    row.appendChild(button('Accept analytics', true, function () {
      saveConsent('granted');
      bar.remove();
      loadAnalytics();
    }));
    row.appendChild(button('Decline', false, function () {
      saveConsent('denied');
      bar.remove();
    }));
    bar.appendChild(p);
    bar.appendChild(row);
    document.body.appendChild(bar);
  }

  if (GA_MEASUREMENT_ID) {
    var choice = readConsent();
    if (choice === 'granted') loadAnalytics();
    else if (choice !== 'denied') showBanner();

    // Footer "Cookie settings" link lets people change their mind.
    document.querySelectorAll('[data-cookie-settings]').forEach(function (el) {
      el.hidden = false;
      el.addEventListener('click', function (e) {
        e.preventDefault();
        if (window.__ccGaLoaded) {
          // Withdrawing consent: stop GA, remove its cookies, start fresh.
          if (window.gtag) window.gtag('consent', 'update', { analytics_storage: 'denied' });
          deleteGaCookies();
          clearConsent();
          window.location.reload();
          return;
        }
        clearConsent();
        showBanner();
      });
    });
  }
})();
