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

/**
 * Returns the X++ overlay as a self-contained <script> block.
 * Injected into every page in development mode.
 *
 * Keybinding: Ctrl+Shift+X  — toggle panel visibility
 * When collapsed: a small "X++" pill remains clickable in the corner
 */
export function xplusplusScript(): string {
  return `<script id="__xpp_script">
(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────

  var SETTINGS_URL = '/__xplus/settings';
  var TOGGLE_KEY   = { key: 'X', ctrl: true, shift: true };
  var VERSION      = '1.0.0';

  // ── State ──────────────────────────────────────────────────────────────────

  var settings = {
    showErrorOverlay: true,
    overlayVisible:   true,
  };

  // Expose settings globally so the error overlay can read showErrorOverlay
  window.__xpp_settings = settings;

  // ── Boot ───────────────────────────────────────────────────────────────────

  fetch(SETTINGS_URL)
    .then(function (r) { return r.json(); })
    .then(function (s) {
      Object.assign(settings, s);
      window.__xpp_settings = settings;
      mount();
    })
    .catch(function () { mount(); });

  // ── Save ───────────────────────────────────────────────────────────────────

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

  // ── Mount ──────────────────────────────────────────────────────────────────

  function mount() {
    injectStyles();
    injectHTML();
    render();
    bindKeyboard();
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  function injectStyles() {
    var s = document.createElement('style');
    s.id  = '__xpp_style';
    s.textContent = [
      // Pill (collapsed state)
      '#__xpp_pill{',
        'position:fixed;bottom:1rem;left:1rem;z-index:99997;',
        'background:#1a1030;border:1px solid #4c1d95;border-radius:999px;',
        'color:#a78bfa;font-family:ui-monospace,monospace;font-size:.7rem;font-weight:700;',
        'letter-spacing:.06em;padding:.3rem .7rem;cursor:pointer;',
        'box-shadow:0 2px 12px rgba(124,58,237,.35);',
        'transition:opacity .15s,transform .15s;user-select:none;',
      '}',
      '#__xpp_pill:hover{background:#2d1b6e;transform:translateY(-1px);}',

      // Panel (expanded state)
      '#__xpp{',
        'position:fixed;bottom:1rem;left:1rem;z-index:99997;',
        'background:#0d0d18;border:1px solid #3b1f5e;border-radius:10px;',
        'box-shadow:0 8px 32px rgba(0,0,0,.65);',
        'width:260px;font-family:ui-monospace,monospace;',
        'animation:__xpp_in .15s ease;overflow:hidden;',
      '}',
      '@keyframes __xpp_in{from{opacity:0;transform:translateY(6px)}}',

      // Header
      '#__xpp_head{',
        'display:flex;align-items:center;gap:.5rem;',
        'padding:.55rem .85rem;border-bottom:1px solid #1e1040;',
        'cursor:default;',
      '}',
      '#__xpp_logo{',
        'color:#a78bfa;font-size:.72rem;font-weight:800;letter-spacing:.05em;',
        'flex:1;',
      '}',
      '#__xpp_hint{color:#334155;font-size:.6rem;letter-spacing:.04em;}',
      '#__xpp_close{',
        'background:none;border:none;color:#475569;cursor:pointer;',
        'font-size:.8rem;padding:.1rem .3rem;border-radius:4px;line-height:1;',
        'transition:color .15s;',
      '}',
      '#__xpp_close:hover{color:#a78bfa;}',

      // Body
      '#__xpp_body{padding:.5rem 0;}',

      // Row
      '.__xpp_row{',
        'display:flex;align-items:center;justify-content:space-between;',
        'padding:.4rem .85rem;gap:.75rem;',
        'transition:background .1s;',
      '}',
      '.__xpp_row:hover{background:#12102a;}',
      '.__xpp_label{color:#94a3b8;font-size:.7rem;flex:1;line-height:1.4;}',
      '.__xpp_label small{display:block;color:#334155;font-size:.6rem;margin-top:.1rem;}',

      // Toggle switch
      '.__xpp_toggle{',
        'position:relative;width:30px;height:16px;flex-shrink:0;',
      '}',
      '.__xpp_toggle input{opacity:0;width:0;height:0;position:absolute;}',
      '.__xpp_track{',
        'position:absolute;inset:0;border-radius:999px;',
        'background:#1e1040;border:1px solid #2d1b6e;',
        'cursor:pointer;transition:background .2s,border-color .2s;',
      '}',
      '.__xpp_toggle input:checked + .__xpp_track{',
        'background:#7c3aed;border-color:#7c3aed;',
      '}',
      '.__xpp_knob{',
        'position:absolute;top:2px;left:2px;',
        'width:10px;height:10px;border-radius:50%;',
        'background:#fff;transition:transform .2s;pointer-events:none;',
      '}',
      '.__xpp_toggle input:checked ~ .__xpp_knob{transform:translateX(14px);}',

      // Divider
      '.__xpp_divider{',
        'height:1px;background:#1e1040;margin:.4rem .85rem;',
      '}',

      // Action button
      '.__xpp_action{',
        'display:flex;align-items:center;gap:.5rem;',
        'padding:.4rem .85rem;cursor:pointer;',
        'color:#64748b;font-size:.7rem;transition:color .15s,background .1s;',
        'border:none;background:none;width:100%;text-align:left;',
      '}',
      '.__xpp_action:hover{background:#12102a;color:#a78bfa;}',

      // Footer
      '#__xpp_foot{',
        'padding:.45rem .85rem;border-top:1px solid #1e1040;',
        'color:#1e2a3a;font-size:.6rem;',
      '}',
    ].join('');
    document.head.appendChild(s);
  }

  // ── HTML ───────────────────────────────────────────────────────────────────

  function injectHTML() {
    // Pill
    var pill      = document.createElement('div');
    pill.id       = '__xpp_pill';
    pill.title    = 'X++ (Ctrl+Shift+X)';
    pill.textContent = 'X\u207A\u207A';
    pill.addEventListener('click', function () { save({ overlayVisible: true }); });
    document.body.appendChild(pill);

    // Panel
    var panel = document.createElement('div');
    panel.id  = '__xpp';
    panel.innerHTML = [
      '<div id="__xpp_head">',
        '<span id="__xpp_logo">X\u207A\u207A</span>',
        '<span id="__xpp_hint">Ctrl+Shift+X</span>',
        '<button id="__xpp_close" title="Collapse panel">&#x2212;</button>',
      '</div>',
      '<div id="__xpp_body">',

        // Error overlay toggle
        toggle('errorOverlay', 'Error overlay',
          'Show build errors as an overlay'),

        '<div class="__xpp_divider"></div>',

        // Hide overlay action
        '<button class="__xpp_action" id="__xpp_hide">',
          '\u25A1 &nbsp;Collapse panel',
          '<small style="color:#334155;font-size:.6rem;margin-left:auto">Ctrl+Shift+X</small>',
        '</button>',

      '</div>',
      '<div id="__xpp_foot">X+ Development Mode &mdash; v' + VERSION + '</div>',
    ].join('');

    document.body.appendChild(panel);

    // Bind close / hide buttons
    document.getElementById('__xpp_close').addEventListener('click', function () {
      save({ overlayVisible: false });
    });
    document.getElementById('__xpp_hide').addEventListener('click', function () {
      save({ overlayVisible: false });
    });

    // Bind toggles
    bindToggle('errorOverlay', 'showErrorOverlay');
  }

  function toggle(id, label, hint) {
    return [
      '<div class="__xpp_row">',
        '<div class="__xpp_label">' + label +
          (hint ? '<small>' + hint + '</small>' : '') +
        '</div>',
        '<label class="__xpp_toggle">',
          '<input type="checkbox" id="__xpp_t_' + id + '" />',
          '<div class="__xpp_track"></div>',
          '<div class="__xpp_knob"></div>',
        '</label>',
      '</div>',
    ].join('');
  }

  function bindToggle(id, settingKey) {
    var el = document.getElementById('__xpp_t_' + id);
    if (!el) return;
    el.addEventListener('change', function () {
      var patch = {};
      patch[settingKey] = el.checked;
      save(patch);

      // Special case: if the error overlay is being toggled off,
      // immediately remove any overlay that's already mounted on this page.
      if (settingKey === 'showErrorOverlay' && !el.checked) {
        var overlay = document.getElementById('__xp_err');
        var style   = document.getElementById('__xp_err_style');
        if (overlay) overlay.remove();
        if (style)   style.remove();
      }
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  function render() {
    var panel = document.getElementById('__xpp');
    var pill  = document.getElementById('__xpp_pill');
    if (!panel || !pill) return;

    var visible = settings.overlayVisible;
    panel.style.display = visible ? 'block' : 'none';
    pill.style.display  = visible ? 'none'  : 'block';

    // Sync toggles
    syncToggle('errorOverlay', settings.showErrorOverlay);
  }

  function syncToggle(id, value) {
    var el = document.getElementById('__xpp_t_' + id);
    if (el) el.checked = !!value;
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────

  function bindKeyboard() {
    document.addEventListener('keydown', function (e) {
      if (e.key === TOGGLE_KEY.key && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        save({ overlayVisible: !settings.overlayVisible });
      }
    });
  }

})();
</script>`;
}
