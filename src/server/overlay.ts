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
    .map(escHtml)
    .join("\n");
  const innerHTMLJSON = JSON.stringify(
    `<div id="__xp_err_box">` +
      `<div id="__xp_err_head">` +
      `<div style="display:flex;align-items:center;gap:12px">` +
      `<span id="__xp_err_badge">Runtime Error</span>` +
      `<span id="__xp_err_route">${escHtml(route)}</span>` +
      `</div>` +
      `<button id="__xp_err_close">Dismiss</button>` +
      `</div>` +
      `<div id="__xp_err_body">` +
      `<div id="__xp_err_msg">${escHtml(message)}</div>` +
      (stackLines
        ? `<div id="__xp_err_stack_label">Stack Trace</div><pre id="__xp_err_stack">${formatStack(stackLines)}</pre>`
        : "") +
      `</div>` +
      `<div id="__xp_err_footer">` +
      `<span>The process is still running. Edit your code to trigger an automatic hot-reload.</span>` +
      `</div>` +
      `</div>`,
  );

  return `<style id="__xp_err_style">
#__xp_err{position:fixed;inset:0;z-index:99998;background:rgba(2,2,4,0.8);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;padding:20px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}
#__xp_err_box{background:#0a0a0c;border:1px solid #27272a;border-radius:16px;width:100%;max-width:800px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 0 0 1px rgba(248,113,113,0.1), 0 20px 50px rgba(0,0,0,0.5);overflow:hidden;animation:xp_err_in .2s ease-out;}
@keyframes xp_err_in{from{opacity:0;transform:scale(0.98)}}
#__xp_err_head{padding:16px 20px;display:flex;justify-content:space-between;align-items:center;background:#111114;border-bottom:1px solid #1e1e21;}
#__xp_err_badge{background:#450a0a;color:#f87171;font-size:11px;font-weight:700;padding:4px 10px;border-radius:6px;text-transform:uppercase;letter-spacing:0.05em;border:1px solid #7f1d1d;}
#__xp_err_route{color:#71717a;font-size:13px;}
#__xp_err_close{background:transparent;border:1px solid #27272a;color:#a1a1aa;padding:6px 12px;border-radius:8px;cursor:pointer;font-size:12px;transition:0.2s;}
#__xp_err_close:hover{background:#1e1e21;color:#fff;}
#__xp_err_body{padding:24px;overflow-y:auto;flex:1;}
#__xp_err_msg{color:#fca5a5;font-size:15px;line-height:1.6;margin-bottom:24px;white-space:pre-wrap;background:#1a1010;padding:16px;border-radius:12px;border-left:4px solid #f87171;}
#__xp_err_stack_label{font-size:11px;color:#52525b;text-transform:uppercase;margin-bottom:10px;font-weight:700;}
#__xp_err_stack{background:#050505;padding:16px;border-radius:12px;font-size:12px;line-height:1.8;color:#71717a;overflow-x:auto;border:1px solid #1e1e21;}
#__xp_err_stack .path{color:#6366f1;}
#__xp_err_footer{padding:16px 24px;background:#0a0a0c;border-top:1px solid #1e1e21;color:#52525b;font-size:12px;}
</style>
<script>
(function(){
  var el = document.createElement('div');
  el.id='__xp_err';
  el.innerHTML = ${innerHTMLJSON};
  document.body.appendChild(el);
  document.getElementById('__xp_err_close').onclick = function(){ el.remove(); };
})();
</script>`;
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
