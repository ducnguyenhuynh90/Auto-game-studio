// A small text box over the canvas (friend codes, captain names). The game UI is all canvas, but typing
// needs a real input so phones show their keyboard. Resolves with the text, or null if cancelled.
export interface AskOptions {
  title: string;
  placeholder?: string;
  initial?: string;
  maxLength?: number;
  /** e.g. 'characters' for friend codes */
  autocapitalize?: string;
  ok?: string;
}

export function askText(o: AskOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:rgba(20,15,10,.55);font-family:"Trebuchet MS","Segoe UI",system-ui,sans-serif';
    const box = document.createElement('form');
    box.style.cssText = 'background:#fff8ec;border:3px solid #2b2118;border-radius:18px;padding:18px;width:min(320px,86vw);box-shadow:0 6px 0 #2b2118';
    const title = document.createElement('div');
    title.textContent = o.title;
    title.style.cssText = 'font-weight:900;font-size:18px;color:#2b2118;margin-bottom:10px;text-align:center';
    const input = document.createElement('input');
    input.value = o.initial ?? '';
    input.placeholder = o.placeholder ?? '';
    input.maxLength = o.maxLength ?? 20;
    input.autocomplete = 'off';
    input.setAttribute('autocapitalize', o.autocapitalize ?? 'words');
    input.style.cssText =
      'width:100%;box-sizing:border-box;font-size:22px;font-weight:800;padding:10px 12px;border:2px solid #2b2118;border-radius:12px;text-align:center;letter-spacing:1px;color:#2b2118;background:#fff';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;margin-top:14px';
    const btn = (label: string, bg: string, color: string, type: 'submit' | 'button') => {
      const b = document.createElement('button');
      b.type = type;
      b.textContent = label;
      b.style.cssText = `flex:1;font-size:17px;font-weight:900;padding:11px;border:2px solid #2b2118;border-radius:12px;background:${bg};color:${color};box-shadow:0 3px 0 #2b2118`;
      return b;
    };
    const cancel = btn('Cancel', '#e9dfcf', '#2b2118', 'button');
    const ok = btn(o.ok ?? 'OK', '#3a8fd9', '#fff', 'submit');
    row.append(cancel, ok);
    box.append(title, input, row);
    wrap.append(box);
    document.body.append(wrap);
    setTimeout(() => input.focus(), 50);
    const done = (v: string | null) => {
      wrap.remove();
      resolve(v);
    };
    cancel.onclick = () => done(null);
    wrap.onclick = (e) => {
      if (e.target === wrap) done(null);
    };
    box.onsubmit = (e) => {
      e.preventDefault();
      const v = input.value.trim();
      done(v ? v : null);
    };
  });
}
