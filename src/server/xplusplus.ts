import fs from "fs";
import path from "path";
import os from "os";
import { Router, Request, Response } from "express";

// ── Settings ──────────────────────────────────────────────────────────────────

export interface XPPSettings {
  /** Whether the error overlay is shown when a build error occurs */
  showErrorOverlay: boolean;
  /** Whether the X++ panel is expanded (false = collapsed to pill) */
  overlayVisible: boolean;
}

const SETTINGS_DIR = path.join(os.homedir(), ".xp");
const SETTINGS_FILE = path.join(SETTINGS_DIR, "settings.json");

const DEFAULTS: XPPSettings = {
  showErrorOverlay: true,
  overlayVisible: true,
};

export function readSettings(): XPPSettings {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return { ...DEFAULTS };
    const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeSettings(settings: XPPSettings): void {
  fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
}

// ── Settings API router ───────────────────────────────────────────────────────

/**
 * Registers:
 *   GET  /__xplus/settings  → returns current settings JSON
 *   POST /__xplus/settings  → merges + saves settings, returns updated JSON
 */
export function xplusplusRouter(): Router {
  const router = Router();

  router.get("/__xplus/settings", (_req: Request, res: Response) => {
    res.json(readSettings());
  });

  router.post("/__xplus/settings", (req: Request, res: Response) => {
    const current = readSettings();
    const updated = { ...current, ...req.body } as XPPSettings;
    writeSettings(updated);
    res.json(updated);
  });

  return router;
}

// ── Client script ─────────────────────────────────────────────────────────────

export function xplusplusScript(): string {
  return `<script id="__xpp_script">
(function () {
  'use strict';
  var SETTINGS_URL = '/__xplus/settings';
  var VERSION      = '1.0.0';
  var settings = { showErrorOverlay: true, overlayVisible: true };
  window.__xpp_settings = settings;

  fetch(SETTINGS_URL)
    .then(function (r) { return r.json(); })
    .then(function (s) {
      Object.assign(settings, s);
      window.__xpp_settings = settings;
      mount();
    })
    .catch(function () { mount(); });

  function save(patch) {
    Object.assign(settings, patch);
    window.__xpp_settings = settings;
    fetch(SETTINGS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(settings),
    }).catch(function () {});
    render();
  }

  function mount() {
    injectStyles();
    injectHTML();
    render();
    document.addEventListener('keydown', function (e) {
      if (e.key === 'X' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        save({ overlayVisible: !settings.overlayVisible });
      }
    });
  }

  function injectStyles() {
    var s = document.createElement('style');
    s.id  = '__xpp_style';
    s.textContent = [
      '#__xpp_pill{position:fixed;bottom:1.5rem;left:1.5rem;z-index:99997;background:#fff;border:1px solid #e2e8f0;border-radius:99px;color:#000;font-family:system-ui,sans-serif;font-size:.75rem;font-weight:700;padding:.5rem 1rem;cursor:pointer;box-shadow:0 10px 25px -5px rgba(0,0,0,0.1),0 8px 10px -6px rgba(0,0,0,0.1);transition:all .2s ease;display:flex;align-items:center;gap:8px;user-select:none;}',
      '#__xpp_pill:hover{transform:scale(1.05);box-shadow:0 20px 25px -5px rgba(0,0,0,0.1);}',
      '#__xpp_dot{width:6px;height:6px;background:#10b981;border-radius:50%;box-shadow:0 0 8px #10b981;}',
      
      '#__xpp{position:fixed;bottom:1.5rem;left:1.5rem;z-index:99997;background:rgba(10,10,12,0.9);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.1);border-radius:16px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);width:280px;font-family:system-ui,-apple-system,sans-serif;overflow:hidden;animation:xpp_pop .3s cubic-bezier(0.34,1.56,0.64,1);}',
      '@keyframes xpp_pop{from{opacity:0;transform:translateY(20px) scale(0.95)}}',
      
      '#__xpp_head{padding:1.25rem;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;justify-content:space-between;align-items:center;}',
      '#__xpp_logo{color:#fff;font-weight:800;font-size:.9rem;letter-spacing:-0.02em;}',
      '#__xpp_close{background:rgba(255,255,255,0.05);border:none;color:#94a3b8;cursor:pointer;width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;transition:all 0.2s;}',
      '#__xpp_close:hover{background:rgba(255,255,255,0.1);color:#fff;}',
      
      '.__xpp_row{padding:1rem 1.25rem;display:flex;align-items:center;justify-content:space-between;transition:background 0.2s;}',
      '.__xpp_label{color:#e2e8f0;font-size:.8rem;font-weight:500;}',
      '.__xpp_hint{display:block;color:#64748b;font-size:.7rem;margin-top:2px;font-weight:400;}',
      
      '.__xpp_toggle{position:relative;width:36px;height:20px;}',
      '.__xpp_toggle input{opacity:0;width:0;height:0;}',
      '.__xpp_track{position:absolute;inset:0;background:#334155;border-radius:20px;cursor:pointer;transition:.2s;}',
      '.__xpp_toggle input:checked + .__xpp_track{background:#6366f1;}',
      '.__xpp_knob{position:absolute;top:3px;left:3px;width:14px;height:14px;background:#fff;border-radius:50%;transition:.2s;}',
      '.__xpp_toggle input:checked ~ .__xpp_knob{transform:translateX(16px);}',
      
      '#__xpp_foot{padding:.75rem 1.25rem;background:rgba(255,255,255,0.03);color:#475569;font-size:.65rem;font-weight:600;display:flex;justify-content:space-between;}'
    ].join('');
    document.head.appendChild(s);
  }

  function injectHTML() {
    var pill = document.createElement('div');
    pill.id = '__xpp_pill';
    pill.innerHTML = '<span id="__xpp_dot"></span>X++ Panel';
    pill.onclick = function() { save({ overlayVisible: true }); };
    document.body.appendChild(pill);

    var panel = document.createElement('div');
    panel.id = '__xpp';
    panel.innerHTML = [
      '<div id="__xpp_head"><span id="__xpp_logo">X++ Debugger</span><button id="__xpp_close">&times;</button></div>',
      '<div class="__xpp_row">',
        '<div><span class="__xpp_label">Error Overlay</span><span class="__xpp_hint">Show build issues visually</span></div>',
        '<label class="__xpp_toggle"><input type="checkbox" id="__xpp_t_err"><div class="__xpp_track"></div><div class="__xpp_knob"></div></label>',
      '</div>',
      '<div id="__xpp_foot"><span>v' + VERSION + '</span><span>CTRL+SHIFT+X</span></div>'
    ].join('');
    document.body.appendChild(panel);

    document.getElementById('__xpp_close').onclick = function() { save({ overlayVisible: false }); };
    var tErr = document.getElementById('__xpp_t_err');
    tErr.onchange = function() { 
      save({ showErrorOverlay: tErr.checked });
      if(!tErr.checked) { 
        var o = document.getElementById('__xp_err'); 
        if(o) o.remove(); 
      }
    };
  }

  function render() {
    var p = document.getElementById('__xpp');
    var l = document.getElementById('__xpp_pill');
    if(!p || !l) return;
    p.style.display = settings.overlayVisible ? 'block' : 'none';
    l.style.display = settings.overlayVisible ? 'none' : 'flex';
    document.getElementById('__xpp_t_err').checked = settings.showErrorOverlay;
  }
})();
</script>`;
}
