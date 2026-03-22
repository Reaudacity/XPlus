/**
 * Dev-mode error overlay.
 * The showErrorOverlay setting is checked server-side in devErrorDocument
 * before this function is called, so this always mounts unconditionally.
 */
export function devErrorOverlay(opts: {
  route: string;
  message: string;
  stack?: string;
}): string {
  const { route, message, stack } = opts;

  const stackLines = (stack ?? "")
    .split("\n")
    .slice(1)
    .filter(Boolean)
    .map((l) => escHtml(l.trim()))
    .join("\n");

  const innerHTMLJSON = JSON.stringify(
    buildInnerHTML(route, message, stackLines),
  );

  return `<style id="__xp_err_style">
#__xp_err{position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.55);
backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;
font-family:ui-monospace,'JetBrains Mono',monospace}
#__xp_err_box{background:#0d0d14;border:1px solid #3b1f5e;border-radius:10px;
box-shadow:0 24px 60px rgba(0,0,0,.7);width:min(660px,90vw);max-height:80vh;
display:flex;flex-direction:column;overflow:hidden;animation:__xp_slide .18s ease}
@keyframes __xp_slide{from{opacity:0;transform:translateY(12px)}}
#__xp_err_head{display:flex;align-items:center;gap:.6rem;padding:.75rem 1rem;
border-bottom:1px solid #1e1030}
#__xp_err_badge{background:#7c3aed22;color:#a78bfa;border:1px solid #7c3aed55;
border-radius:4px;font-size:.65rem;padding:.15rem .45rem;letter-spacing:.08em;
text-transform:uppercase;font-weight:700}
#__xp_err_route{color:#64748b;font-size:.75rem;flex:1}
#__xp_err_close{background:none;border:none;color:#475569;cursor:pointer;
font-size:1rem;padding:.2rem .4rem;border-radius:4px;transition:color .15s}
#__xp_err_close:hover{color:#e2e8f0}
#__xp_err_body{padding:1rem 1.25rem;overflow-y:auto}
#__xp_err_msg{color:#f87171;font-size:.85rem;line-height:1.6;
white-space:pre-wrap;word-break:break-word;margin-bottom:.75rem}
#__xp_err_stack_head{color:#475569;font-size:.65rem;letter-spacing:.1em;
text-transform:uppercase;margin-bottom:.35rem}
#__xp_err_stack{background:#070710;border:1px solid #1e1030;border-radius:6px;
padding:.75rem;color:#64748b;font-size:.72rem;line-height:1.7;
white-space:pre;overflow-x:auto}
#__xp_err_stack .at{color:#475569}
#__xp_err_stack .path{color:#818cf8}
#__xp_err_footer{padding:.6rem 1.25rem;border-top:1px solid #1e1030;
color:#334155;font-size:.7rem}
</style>
<script>
(function () {
  var el = document.createElement('div');
  el.id  = '__xp_err';
  el.innerHTML = ${innerHTMLJSON};
  document.body.appendChild(el);
  var btn = document.getElementById('__xp_err_close');
  if (btn) btn.addEventListener('click', function () { el.remove(); });
})();
</script>`;
}

function buildInnerHTML(
  route: string,
  message: string,
  stackLines: string,
): string {
  return (
    `<div id="__xp_err_box">` +
    `<div id="__xp_err_head">` +
    `<span id="__xp_err_badge">X+ Error</span>` +
    `<span id="__xp_err_route">${escHtml(route)}</span>` +
    `<button id="__xp_err_close" title="Dismiss">\u2715</button>` +
    `</div>` +
    `<div id="__xp_err_body">` +
    `<pre id="__xp_err_msg">${escHtml(message)}</pre>` +
    (stackLines
      ? `<div id="__xp_err_stack_head">Stack trace</div>` +
        `<pre id="__xp_err_stack">${formatStack(stackLines)}</pre>`
      : "") +
    `</div>` +
    `<div id="__xp_err_footer">` +
    `Fix the error above and save \u2014 the page will reload automatically.` +
    `</div>` +
    `</div>`
  );
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatStack(lines: string): string {
  return lines.replace(
    /(at\s)([^(]+)(\([^)]+\))/g,
    `<span class="at">$1</span>$2<span class="path">$3</span>`,
  );
}
