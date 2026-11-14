// UI dùng chung: icon SVG đơn sắc (nét Lucide, ISC), toast, menu popover.
(() => {
  const P = {
    back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M19 16v5"/><path d="M16.5 18.5h5"/>',
    video: '<path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    list: '<path d="m3 7 2 2 4-4"/><path d="m3 17 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
    diagram: '<rect x="3" y="3" width="8" height="8" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    cap: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    play: '<path d="m6 3 14 9-14 9Z"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    pin: '<path d="M20 10c0 4.99-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    settings: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  };
  const sprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  sprite.setAttribute('style', 'display:none');
  sprite.innerHTML = Object.entries(P).map(([n, d]) =>
    `<symbol id="i-${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</symbol>`).join('');
  document.body.prepend(sprite);

  /** Chuỗi HTML của 1 icon. */
  window.ic = (name) => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  /** Thay mọi <i data-i="name"> trong HTML tĩnh bằng icon thật. */
  window.hydrateIcons = (root = document) => root.querySelectorAll('i[data-i]').forEach((el) => { el.outerHTML = ic(el.dataset.i); });

  /** Nút chỉ có icon: luôn có aria-label + tooltip (HCI: icon không chữ phải có nhãn). */
  window.iconBtn = (name, label, onClick, cls = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'icon-btn ' + cls;
    b.innerHTML = ic(name);
    b.setAttribute('aria-label', label);
    b.title = label;
    if (onClick) b.onclick = onClick;
    return b;
  };

  // ---- Toast: phản hồi ngắn, không chặn thao tác (thay cho alert) ----
  const toasts = document.createElement('div');
  toasts.className = 'toasts';
  toasts.setAttribute('role', 'status');
  toasts.setAttribute('aria-live', 'polite');
  document.body.append(toasts);
  window.toast = (msg, type = 'ok') => {
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.innerHTML = ic(type === 'err' ? 'alert' : 'check') + '<span></span>';
    t.lastChild.textContent = msg;
    toasts.append(t);
    setTimeout(() => t.remove(), type === 'err' ? 7000 : 4000);
  };

  // ---- Menu popover (native Popover API: bấm ra ngoài / Esc là đóng) ----
  const menuEl = document.createElement('div');
  menuEl.className = 'menu';
  menuEl.setAttribute('popover', '');
  menuEl.setAttribute('role', 'menu');
  document.body.append(menuEl);
  /** items: [{icon, label, onClick, danger, hint}] hoặc '-' (vạch chia) */
  window.openMenu = (anchor, items) => {
    menuEl.replaceChildren(...items.map((it) => {
      if (it === '-') { const hr = document.createElement('hr'); return hr; }
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.className = it.danger ? 'danger' : '';
      b.innerHTML = ic(it.icon) + '<span><b></b><small></small></span>';
      b.querySelector('b').textContent = it.label;
      b.querySelector('small').textContent = it.hint || '';
      b.onclick = () => { menuEl.hidePopover(); it.onClick(); };
      return b;
    }));
    menuEl.showPopover();
    const r = anchor.getBoundingClientRect();
    const w = menuEl.offsetWidth, h = menuEl.offsetHeight;
    menuEl.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
    menuEl.style.top = (r.bottom + h + 8 > innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
    menuEl.querySelector('button')?.focus();
  };
  // Mũi tên lên/xuống trong menu (bàn phím).
  menuEl.addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const btns = [...menuEl.querySelectorAll('button')];
    const i = btns.indexOf(document.activeElement);
    btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length].focus();
  });

  /** Bấm nút → hiện trạng thái đang chạy, chặn bấm lặp. */
  window.busy = async (btn, label, fn) => {
    const old = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>' + (label ? `<span>${label}</span>` : '');
    try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = old; }
  };

  // ---- Hộp xác nhận / nhập liệu thay confirm() & prompt() của trình duyệt ----
  const box = document.createElement('dialog');
  box.innerHTML = `<form method="dialog"><div class="dlg-head"><h2></h2></div><div class="dlg-body"><p class="muted" style="margin:0"></p>
    <input hidden maxlength="200"></div><div class="dlg-foot"><button value="cancel" formnovalidate>Huỷ</button><button value="ok" class="primary"></button></div></form>`;
  document.body.append(box);
  function ask({ title, message = '', ok = 'Đồng ý', danger = false, input = null }) {
    box.querySelector('h2').textContent = title;
    box.querySelector('p').textContent = message;
    const inp = box.querySelector('input');
    inp.hidden = input === null;
    inp.value = input ?? '';
    const okBtn = box.querySelector('button[value=ok]');
    okBtn.textContent = ok;
    okBtn.className = danger ? 'primary danger-btn' : 'primary';
    box.returnValue = '';
    box.showModal();
    (input !== null ? inp : okBtn).focus();
    return new Promise((r) => box.addEventListener('close', () => r(box.returnValue === 'ok' ? (input !== null ? inp.value.trim() : true) : null), { once: true }));
  }
  /** Promise<boolean> */
  window.confirmBox = async (title, message, opts = {}) => (await ask({ title, message, ...opts })) === true;
  /** Promise<string|null> */
  window.promptBox = (title, message, value = '', opts = {}) => ask({ title, message, input: value, ...opts });

  hydrateIcons();
})();

// ---- Chỉ dùng trên máy tính (hệ thống cho ngành Khoa học Máy tính) ----
(() => {
  const small = matchMedia('(max-width: 899px)').matches;
  const touch = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  if (!small && !touch) return;
  document.body.innerHTML = `<div class="desktop-only"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>
    <h1>Vui lòng mở trên máy tính</h1><p>Demo Review dành cho review đồ án ngành Khoa học Máy tính, cần màn hình rộng
    để xem video, báo cáo và góp ý cùng lúc.${small && !touch ? ' Nếu đang dùng máy tính, hãy mở rộng cửa sổ trình duyệt.' : ''}</p></div>`;
  if (small && !touch) addEventListener('resize', () => { if (innerWidth >= 900) location.reload(); });
})();

// Cấm zoom cả trang để bố cục luôn đúng khi demo. Muốn xem rõ sơ đồ: bấm vào sơ đồ để mở trình xem có phóng to.
document.addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); }, { passive: false });
document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && ['+', '=', '-', '_', '0'].includes(e.key)) e.preventDefault(); });
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault());
