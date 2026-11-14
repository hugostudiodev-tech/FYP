// Trang dự án. 2 chế độ:
//  - Sinh viên chủ dự án (?id=…, đã đăng nhập): chuẩn bị bài, AI hỗ trợ, gửi link, sửa theo góp ý.
//  - Giảng viên (?id=…&t=<review token>): xem bản trình bày, dừng video / bôi đen để góp ý.
// Nguyên tắc giao diện: việc quan trọng luôn hiện; việc phụ nằm sau icon → menu/popup.
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const pid = params.get('id');
const reviewToken = params.get('t');
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict',
  theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default' });

// Giảng viên không có tài khoản: mã ngẫu nhiên lưu trong trình duyệt để sửa/xoá góp ý & phiếu chấm của mình.
const lecKey = (() => {
  try {
    let k = localStorage.getItem('lecturerKey');
    if (!k) { k = crypto.randomUUID().replaceAll('-', ''); localStorage.setItem('lecturerKey', k); }
    return k;
  } catch { return crypto.randomUUID().replaceAll('-', ''); }
})();
const seen = (k) => { try { return localStorage.getItem(k); } catch { return '1'; } };
const mark = (k, v = '1') => { try { localStorage.setItem(k, v); } catch {} };

async function api(p, method = 'GET', data) {
  const headers = reviewToken ? { 'x-review-token': reviewToken, 'x-lecturer-key': lecKey } : {};
  if (data !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(`/api/projects/${pid}${p}`, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error);
  return j;
}
const run = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, 'err'); } };
document.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) e.target.closest('dialog').close(); });

let project, comments = [], anchor = { type: 'general' }, filter = 'all';
let mode = 'story', current = null, cutIdx = -1, switching = false;
const rendered = {}; // khoá đã vẽ, tránh vẽ lại (giật) khi dữ liệu không đổi
const isOwner = () => project?.role === 'owner';
const KIND = { overview: 'Tổng quan', scope: 'Phạm vi', plan: 'Kế hoạch', architecture: 'Kiến trúc', diagram: 'Sơ đồ',
  protocol: 'Giao thức / API', result: 'Kết quả', other: 'Khác' };

// ============ Header + tiến độ ============
function renderHeader() {
  document.title = project.title + ' · Demo Review';
  $('#title').textContent = project.title;
  $('#subtitle').textContent = `${project.author.name} · ${project.author.mssv}`;
  document.querySelectorAll('.owner-only').forEach((el) => (el.hidden = !isOwner()));
  for (const id of ['aiBtn', 'shareBtn', 'moreBtn']) $('#' + id).hidden = !isOwner();
  $('#reviewBadge').hidden = isOwner();
  $('#helpBtn').hidden = isOwner();
  $('#rateBtn').hidden = isOwner();
  $('#backBtn').hidden = !isOwner();
  $('#nameBtn').hidden = isOwner();
  if (!isOwner()) $('#nameBtn span').textContent = lecturerName() || 'Nhập tên';
  const n = project.missing?.length || 0;
  $('#missingBadge').hidden = !isOwner() || !n;
  $('#missingBadge').innerHTML = `${ic('alert')}<span>Thiếu ${n}<span class="hide-sm"> thông tin</span></span>`;
}

function renderSteps() {
  $('#steps').hidden = !isOwner();
  if (!isOwner()) return;
  const sb = project.story, nMiss = project.missing.length;
  const steps = [
    { done: project.videos.length > 0 && sb.pct === 100, t: 'Video demo',
      s: project.videos.length ? `${sb.pct}% yêu cầu đạt` : 'Chưa có video', go: () => (project.videos.length ? $('#coverage').scrollIntoView({ behavior: 'smooth' }) : openAdd()) },
    { done: project.hasReport, t: 'Báo cáo', s: project.hasReport ? `${project.sections.length} phần` : 'Chưa tải lên', go: () => $('#reportInput').click() },
    { done: !nMiss, t: 'Bổ sung thông tin', s: nMiss ? `Còn ${nMiss} câu hỏi` : 'Đầy đủ', go: openAsk },
    { done: false, t: 'Gửi giảng viên', s: 'Lấy link review', go: openShare },
  ];
  const now = steps.findIndex((s) => !s.done);
  $('#steps').replaceChildren(...steps.map((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'step' + (s.done ? ' done' : i === now ? ' now' : '');
    b.innerHTML = `<span class="dot">${s.done ? ic('check') : i + 1}</span><span><b></b><small></small></span>`;
    b.querySelector('b').textContent = s.t;
    b.querySelector('small').textContent = s.s;
    b.onclick = run(s.go);
    return b;
  }));
}

function renderStatus() {
  const s = isOwner() ? project.status : ''; // trạng thái xử lý là việc của sinh viên
  $('#statusbar').hidden = !s;
  if (!s) return;
  const working = s.endsWith('…');
  $('#statusbar').className = 'statusbar' + (working ? '' : ' warn');
  $('#statusbar').innerHTML = (working ? '<span class="spinner"></span>' : ic('alert')) + '<span></span>';
  $('#statusbar span:last-child').textContent = s;
}

// ============ Video: bản trình bày (tự cắt) / video gốc ============
const video = $('#video');
const videoById = (vid) => project.videos.find((v) => v.id === vid);

function loadSrc(v) {
  if (current?.id === v.id) return Promise.resolve();
  current = v;
  switching = true;
  video.src = v.src;
  return new Promise((r) => video.addEventListener('loadedmetadata', () => { switching = false; r(); }, { once: true }));
}

async function playCut(i, autoplay = true) {
  const c = project.story.cuts[i];
  if (!c) return;
  cutIdx = i;
  await loadSrc(videoById(c.video));
  video.currentTime = c.start;
  if (autoplay) video.play().catch(() => {});
  renderTabs();
}
// Hết đoạn → tự sang đoạn kế (đây là "ghép" video, không cần render lại file).
video.addEventListener('timeupdate', () => {
  if (mode !== 'story' || cutIdx < 0 || switching) return;
  const c = project.story.cuts[cutIdx];
  if (c && video.currentTime >= c.end) {
    if (cutIdx + 1 < project.story.cuts.length) playCut(cutIdx + 1);
    else video.pause();
  }
});
// Dừng video = ghim góp ý vào đúng giây đó (bỏ qua lúc tự chuyển đoạn).
video.addEventListener('pause', () => {
  if (!switching && current && !video.ended) setAnchor({ type: 'video', video: current.id, t: video.currentTime });
});

function setMode(m) {
  mode = m;
  document.querySelectorAll('#modeSeg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === m));
  if (m === 'story') playCut(Math.max(0, cutIdx), false);
  else renderTabs();
}
document.querySelectorAll('#modeSeg button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));

function renderTabs() {
  const tabs = mode === 'story'
    ? project.story.cuts.map((c, i) => ({ label: `${i + 1}. ${c.shot.title}`, on: i === cutIdx, go: () => playCut(i) }))
    : project.videos.map((v, i) => ({ label: `${i + 1}. ${v.name}`, on: v.id === current?.id, go: () => loadSrc(v).then(renderTabs) }));
  $('#vtabs').replaceChildren(...tabs.map((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'vtab';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', t.on);
    b.textContent = t.label;
    b.onclick = run(t.go);
    return b;
  }));
  // Chương chỉ hữu ích khi xem video gốc.
  $('#chapters').replaceChildren(...(mode === 'raw' ? current?.chapters || [] : []).map((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = '<b></b><span></span>';
    b.firstChild.textContent = fmt(c.t);
    b.lastChild.textContent = c.title;
    b.onclick = () => { video.currentTime = c.t; video.play().catch(() => {}); };
    return b;
  }));
}

function renderVideo() {
  const has = project.videos.length > 0;
  $('#vcount').textContent = has ? `· ${project.videos.length}` : '';
  $('#playerWrap').hidden = !has;
  $('#videoEmpty').hidden = has;
  if (!has) {
    $('#videoEmpty').innerHTML = isOwner()
      ? `${ic('video')}<h3>Chưa có video demo</h3><p>Xem hướng dẫn quay, rồi dán link folder Google Drive hoặc tải video lên.</p>
         <div class="row" style="justify-content:center"><button id="eGuide">${ic('help')}Hướng dẫn quay</button>
         <button class="primary" id="eAdd">${ic('plus')}Thêm video</button></div>`
      : `${ic('video')}<h3>Sinh viên chưa đăng video</h3>`;
    if (isOwner()) { $('#eGuide').onclick = openGuide; $('#eAdd').onclick = () => openAdd(); }
  }
  const hasCuts = project.story.cuts.length > 0;
  $('#modeSeg').hidden = !hasCuts;
  if (!hasCuts) mode = 'raw';
  if (current) current = videoById(current.id) || null;
  if (has && !current) {
    if (mode === 'story') playCut(0, false); else loadSrc(project.videos[0]).then(renderTabs);
  }
  renderTabs();
}

// ---- Tiến độ quét (sinh viên) ----
function renderScan() {
  const j = isOwner() && project.job;
  $('#scan').hidden = !j;
  if (!j) return;
  const c = j.current;
  const pct = c?.pct;
  $('#scan').innerHTML = `<div class="row"><span class="spinner" style="color:var(--accent)"></span>
    <b>Đang quét video ${Math.min(j.done + 1, j.total)}/${j.total}</b><span></span>
    ${pct != null ? `<b style="margin-left:auto;font-variant-numeric:tabular-nums">${pct}%</b>` : ''}</div>
    <progress max="100" ${pct != null ? `value="${pct}"` : ''}></progress>`;
  $('#scan .row span:not(.spinner)').textContent = c ? `“${c.name}” · ${c.stage}` : 'Đang chờ…';
}

// ---- Yêu cầu video: đạt / chưa rõ / thiếu (sinh viên) ----
function renderCoverage() {
  const show = isOwner() && project.videos.length > 0;
  $('#coverage').hidden = !show;
  if (!show) return;
  const sb = project.story, total = project.shots.length;
  const weakIds = new Set(sb.weak.map((c) => c.shot.id));
  const ok = sb.cuts.filter((c) => !weakIds.has(c.shot.id));
  const scanned = project.videos.some((v) => v.aiState === 'done');
  const item = (cls, icon, title, sub, btn) => `<li class="cov-item ${cls}"><span class="st">${ic(icon)}</span>
    <span><b>${esc(title)}</b><small>${esc(sub)}</small></span>${btn}</li>`;
  const redo = (sid, label) => `<button data-shot="${esc(sid)}">${ic('upload')}<span class="hide-sm">${label}</span></button>`;
  $('#coverage').innerHTML = `
    <div class="cov-head"><b>Yêu cầu video</b><div class="cov-bar"><div style="width:${sb.pct}%"></div></div>
      <span class="pct">${ok.length}/${total} đạt · ${sb.pct}%</span></div>
    ${!scanned && !project.job ? `<p class="hint">Video chưa được AI quét${project.videos.some((v) => (v.aiState || '').startsWith('error')) ? ' (có lỗi — xem trong Quản lý video)' : ''}.</p>` : ''}
    <ul class="cov-list">
      ${sb.missing.map((s) => item('miss', 'alert', s.title, 'Thiếu — ' + s.desc, redo(s.id, 'Quay bổ sung'))).join('')}
      ${sb.weak.map((c) => item('weak', 'alert', c.shot.title, `Chưa rõ (${c.score}/100) — ${c.note}`, redo(c.shot.id, 'Quay lại'))).join('')}
    </ul>
    ${ok.length ? `<details><summary>${ok.length} cảnh đạt yêu cầu</summary><ul class="cov-list">
      ${ok.map((c, i) => item('ok', 'check', c.shot.title, `${videoById(c.video)?.name || ''} · ${fmt(c.start)}–${fmt(c.end)} · ${c.score}/100`,
        `<button class="icon-btn" data-cut="${project.story.cuts.indexOf(c)}" aria-label="Xem đoạn ${esc(c.shot.title)}" title="Xem đoạn">${ic('play')}</button>`)).join('')}
    </ul></details>` : ''}`;
  $('#coverage').querySelectorAll('[data-shot]').forEach((b) => (b.onclick = () => openAdd(project.shots.find((s) => s.id === b.dataset.shot))));
  $('#coverage').querySelectorAll('[data-cut]').forEach((b) => (b.onclick = () => { setMode('story'); playCut(+b.dataset.cut); $('#video').scrollIntoView({ behavior: 'smooth', block: 'center' }); }));
}

// ============ Báo cáo ============
async function renderSections() {
  const key = JSON.stringify([project.sections, isOwner()]);
  if (rendered.sections === key) return;
  rendered.sections = key;
  const box = $('#sections');
  box.replaceChildren();
  $('#snav').hidden = project.sections.length < 2;
  $('#snav').replaceChildren();
  if (!project.sections.length) {
    box.innerHTML = isOwner()
      ? `<div class="empty">${ic('file')}<h3>Chưa có báo cáo</h3><p>Tải báo cáo PDF/MD, AI tự tách thành các phần và tạo bảng, sơ đồ.</p>
         <div class="row" style="justify-content:center"><button id="eSec">${ic('plus')}Tự viết từng phần</button>
         <button class="primary" id="eRep">${ic('upload')}Tải báo cáo</button></div></div>`
      : `<div class="empty">${ic('file')}<h3>Sinh viên chưa đăng báo cáo</h3></div>`;
    if (isOwner()) { $('#eRep').onclick = () => $('#reportInput').click(); $('#eSec').onclick = run(addSection); }
    return;
  }
  for (const [i, s] of project.sections.entries()) {
    const el = document.createElement('article');
    el.className = 'section';
    el.id = 'sec-' + s.id;
    el.innerHTML = `<div class="section-head"><div><span class="kind"></span><h3></h3></div></div><div class="section-body"></div>`;
    el.querySelector('.kind').textContent = KIND[s.kind] || s.kind;
    el.querySelector('h3').textContent = s.title;
    if (isOwner()) el.querySelector('.section-head').append(iconBtn('more', 'Tuỳ chọn phần ' + s.title, (e) => openMenu(e.currentTarget, [
      { icon: 'pencil', label: 'Sửa', onClick: () => openSection(s) },
      ...(i > 0 ? [{ icon: 'up', label: 'Chuyển lên', onClick: run(() => api(`/sections/${s.id}`, 'PATCH', { move: -1 }).then(reload)) }] : []),
      ...(i < project.sections.length - 1 ? [{ icon: 'down', label: 'Chuyển xuống', onClick: run(() => api(`/sections/${s.id}`, 'PATCH', { move: 1 }).then(reload)) }] : []),
      '-',
      { icon: 'trash', label: 'Xoá phần này', danger: true, onClick: run(async () => {
        if (await confirmBox(`Xoá phần "${s.title}"?`, 'Góp ý đã ghim vào phần này vẫn còn nhưng không nhảy tới được nữa.', { ok: 'Xoá', danger: true })) {
          await api(`/sections/${s.id}`, 'DELETE'); await reload(); toast('Đã xoá phần');
        }
      }) },
    ]), 'sm'));
    el.querySelector('.section-body').innerHTML = DOMPurify.sanitize(marked.parse(s.markdown || ''));
    if (s.mermaid) {
      const d = document.createElement('div');
      d.className = 'diagram';
      try { d.innerHTML = DOMPurify.sanitize((await mermaid.render('m' + s.id, s.mermaid)).svg, { USE_PROFILES: { svg: true, svgFilters: true, html: true }, ADD_TAGS: ['foreignObject'] }); }
      catch {
        d.innerHTML = `<p class="err">${ic('alert')} Sơ đồ có lỗi cú pháp${isOwner() ? ' — bấm ⋯ › Sửa để chỉnh' : ''}.</p><pre></pre>`;
        d.querySelector('pre').textContent = s.mermaid;
      }
      el.append(d);
    }
    box.append(el);
    const nb = document.createElement('button');
    nb.type = 'button';
    nb.textContent = s.title;
    nb.onclick = () => el.scrollIntoView({ behavior: 'smooth' });
    $('#snav').append(nb);
  }
  rendered.marks = '';
  applyMarks();
}

function openSection(s) {
  $('#hSection').textContent = 'Sửa phần';
  $('#secTitle').value = s.title;
  $('#secKind').replaceChildren(...Object.entries(KIND).map(([k, v]) => new Option(v, k, false, k === s.kind)));
  $('#secMd').value = s.markdown;
  $('#secMer').value = s.mermaid;
  previewMermaid();
  $('#sectionForm').onsubmit = run(async (e) => {
    e.preventDefault();
    await api(`/sections/${s.id}`, 'PATCH', { title: $('#secTitle').value, kind: $('#secKind').value, markdown: $('#secMd').value, mermaid: $('#secMer').value });
    $('#dlgSection').close();
    await reload();
    toast('Đã lưu');
  });
  $('#dlgSection').showModal();
}
async function addSection() {
  const s = await api('/sections', 'POST', { title: 'Phần mới' });
  await reload();
  openSection(s);
  $('#hSection').textContent = 'Thêm phần';
}

// Offset ký tự tính trên textContent của .section-body → bền qua mọi lần vẽ lại.
function offsetOf(root, node, off) {
  const r = document.createRange();
  r.setStart(root, 0);
  r.setEnd(node, off);
  return r.toString().length;
}
function wrapRange(root, start, end, cid) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts = [];
  for (let pos = 0, n; (n = walker.nextNode()); pos += n.length) {
    const a = Math.max(start, pos), b = Math.min(end, pos + n.length);
    if (a < b) parts.push([n, a - pos, b - pos]);
  }
  for (const [n, a, b] of parts) {
    const r = document.createRange();
    r.setStart(n, a);
    r.setEnd(n, b);
    const m = document.createElement('mark');
    m.dataset.c = cid;
    m.onclick = () => focusComment(cid);
    r.surroundContents(m);
  }
}
function applyMarks() {
  const key = JSON.stringify(comments.filter((c) => c.anchor.type === 'text').map((c) => [c.id, c.anchor]));
  if (rendered.marks === key) return;
  rendered.marks = key;
  document.querySelectorAll('.section-body mark').forEach((m) => m.replaceWith(...m.childNodes));
  document.querySelectorAll('.section-body').forEach((b) => b.normalize());
  for (const c of comments) {
    if (c.anchor.type !== 'text') continue;
    const body = document.querySelector(`#sec-${CSS.escape(c.anchor.section)} .section-body`);
    if (body) wrapRange(body, c.anchor.start, c.anchor.end, c.id);
  }
}
document.addEventListener('mouseup', (e) => {
  if (e.target.closest('dialog')) return;
  const sel = getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return;
  const r = sel.getRangeAt(0);
  const node = r.commonAncestorContainer;
  const body = (node.nodeType === 1 ? node : node.parentElement).closest('#sections .section-body');
  if (!body) return;
  setAnchor({ type: 'text', section: body.parentElement.id.slice(4), quote: r.toString().slice(0, 500),
    start: offsetOf(body, r.startContainer, r.startOffset), end: offsetOf(body, r.endContainer, r.endOffset) });
  $('#text').focus();
});

// ============ Góp ý ============
const lecturerName = () => { try { return localStorage.getItem('lecturerName') || ''; } catch { return ''; } };
function askName() {
  return new Promise((resolve) => {
    $('#whoName').value = lecturerName();
    $('#dlgName').showModal();
    $('#dlgName').onclose = () => {
      const n = $('#whoName').value.trim();
      if (n) try { localStorage.setItem('lecturerName', n); } catch {}
      $('#nameBtn span').textContent = n || lecturerName() || 'Nhập tên';
      resolve(n || lecturerName());
    };
  });
}
$('#nameBtn').onclick = askName;

function anchorInfo(a) {
  if (a.type === 'video') {
    const v = videoById(a.video);
    return ['video', v ? `${v.name} · ${fmt(a.t)}` : 'Video đã xoá'];
  }
  if (a.type === 'text') return ['file', `“${a.quote}”`];
  if (a.type === 'section') return ['file', project.sections.find((s) => s.id === a.section)?.title || 'Phần đã xoá'];
  return ['message', 'Góp ý chung'];
}
function setAnchor(a) {
  anchor = a;
  const [icon, label] = anchorInfo(a);
  const chip = document.createElement('span');
  chip.className = 'anchor-chip' + (a.type === 'general' ? ' none' : '');
  chip.innerHTML = ic(a.type === 'general' ? 'pin' : icon) + '<span></span>';
  chip.querySelector('span').textContent = a.type === 'general' ? 'Chưa ghim — dừng video hoặc bôi đen để ghim' : label;
  if (a.type !== 'general') chip.append(iconBtn('x', 'Bỏ ghim', () => setAnchor({ type: 'general' })));
  $('#anchor').replaceChildren(chip);
}
$('#text').addEventListener('focus', () => { if (current && !video.paused) video.pause(); }); // bấm vào ô viết → tự dừng & ghim
$('#text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('#composer').requestSubmit(); });
$('#composer').addEventListener('submit', run(async (e) => {
  e.preventDefault();
  const author = isOwner() ? '' : lecturerName() || (await askName());
  if (!isOwner() && !author) return;
  await api('/comments', 'POST', { body: $('#text').value, author, anchor });
  $('#text').value = '';
  setAnchor({ type: 'general' });
  await loadComments(true);
  toast('Đã gửi góp ý');
}));

const ROLE = { lecturer: 'Giảng viên', student: 'Sinh viên', ai: 'Trợ lý AI' };
function renderList() {
  const shown = comments.filter((c) => filter === 'all' || (filter === 'open' ? !c.resolved
    : filter === 'text' ? ['text', 'section'].includes(c.anchor.type) : c.anchor.type === filter));
  const open = comments.filter((c) => !c.resolved && c.role !== 'student').length;
  $('#ccount').textContent = comments.length ? `· ${open} chưa sửa` : '';
  if (!shown.length) {
    $('#list').innerHTML = `<div class="empty">${ic('message')}<p>${comments.length ? 'Không có góp ý nào ở bộ lọc này.'
      : isOwner() ? 'Chưa có góp ý. Gửi link cho giảng viên, hoặc nhờ Trợ lý AI góp ý trước.' : 'Chưa có góp ý. Dừng video hoặc bôi đen đoạn báo cáo để bắt đầu.'}</p></div>`;
    return;
  }
  $('#list').replaceChildren(...shown.map((c) => {
    const el = document.createElement('div');
    el.className = 'comment' + (c.resolved ? ' resolved' : '');
    el.id = 'c-' + c.id;
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    const [icon, label] = anchorInfo(c.anchor);
    el.innerHTML = `<span class="avatar ${c.role}" aria-hidden="true">${c.role === 'ai' ? ic('sparkles') : esc(c.author.trim()[0] || '?').toUpperCase()}</span>
      <div style="min-width:0"><div class="c-head"><b></b><span class="badge">${ROLE[c.role]}</span><time></time></div>
      ${c.anchor.type !== 'general' ? `<div class="c-anchor">${ic(icon)}<span></span></div>` : ''}
      <div class="c-body"></div><div class="c-foot"></div></div>`;
    el.querySelector('b').textContent = c.author;
    el.querySelector('time').textContent = new Date(c.created).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
    if (c.anchor.type !== 'general') el.querySelector('.c-anchor span').textContent = label;
    el.querySelector('.c-body').textContent = c.body;
    if (isOwner() && c.role !== 'student') {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'resolve';
      b.setAttribute('aria-pressed', c.resolved);
      b.innerHTML = ic('check') + (c.resolved ? 'Đã sửa' : 'Đánh dấu đã sửa');
      b.onclick = run(async (e) => { e.stopPropagation(); await api('/comments/' + c.id, 'PATCH', { resolved: !c.resolved }); await loadComments(true); });
      el.querySelector('.c-foot').append(b);
    } else if (c.resolved) el.querySelector('.c-foot').innerHTML = `<span class="badge ok">${ic('check')}Sinh viên đã sửa</span>`;
    if (c.mine || (isOwner() && c.role === 'ai')) {
      const more = iconBtn('more', 'Tuỳ chọn góp ý', (e) => {
        e.stopPropagation();
        openMenu(e.currentTarget, [
          ...(c.mine ? [{ icon: 'pencil', label: 'Sửa', onClick: () => editComment(c) }] : []),
          { icon: 'trash', label: 'Xoá', danger: true, onClick: run(async () => {
            if (await confirmBox('Xoá góp ý này?', c.body.slice(0, 120), { ok: 'Xoá', danger: true })) {
              await api('/comments/' + c.id, 'DELETE'); await loadComments(true); toast('Đã xoá góp ý');
            }
          }) },
        ]);
      }, 'sm');
      more.style.marginLeft = 'auto';
      el.querySelector('.c-foot').append(more);
    }
    el.onclick = () => jumpTo(c);
    el.onkeydown = (e) => { if (e.key === 'Enter') jumpTo(c); };
    return el;
  }));
}
document.querySelectorAll('#filters button').forEach((b) => (b.onclick = () => {
  filter = b.dataset.f;
  document.querySelectorAll('#filters button').forEach((x) => x.setAttribute('aria-pressed', x === b));
  renderList();
}));

// Nhấn góp ý → nhảy đúng giây video / đúng đoạn báo cáo.
async function jumpTo(c) {
  history.replaceState(null, '', location.search + '#c=' + c.id);
  focusComment(c.id, false);
  const a = c.anchor;
  const flash = (el) => { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); };
  if (a.type === 'video') {
    const v = videoById(a.video);
    if (!v) return toast('Video này đã bị xoá', 'err');
    if (mode === 'story') setMode('raw'); // góp ý gắn với video gốc
    await loadSrc(v);
    renderTabs();
    video.currentTime = a.t;
    video.pause();
    video.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else if (a.type === 'text') {
    const m = document.querySelector(`mark[data-c="${CSS.escape(c.id)}"]`);
    if (m) flash(m); else toast('Đoạn này đã thay đổi nội dung', 'err');
  } else if (a.type === 'section') {
    const s = document.getElementById('sec-' + a.section);
    if (s) flash(s);
  }
}
function focusComment(cid, scroll = true) {
  document.querySelectorAll('.comment.active, mark.active').forEach((x) => x.classList.remove('active'));
  document.querySelectorAll(`mark[data-c="${CSS.escape(cid)}"]`).forEach((m) => m.classList.add('active'));
  const el = document.getElementById('c-' + cid);
  el?.classList.add('active');
  if (scroll) el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
async function loadComments(force) {
  const next = await api('/comments');
  if (!force && JSON.stringify(next) === JSON.stringify(comments)) return;
  comments = next;
  renderList();
  if (getSelection().isCollapsed) applyMarks(); // đang bôi đen thì không vẽ lại (sẽ mất vùng chọn)
}

// ============ Popup: gửi giảng viên ============
function openShare() {
  $('#shareUrl').value = `${location.origin}/project.html?id=${pid}&t=${project.reviewToken}`;
  const warn = [];
  if (project.missing.length) warn.push(`còn ${project.missing.length} thông tin thiếu`);
  if (project.story.missing.length) warn.push(`video thiếu ${project.story.missing.length} cảnh`);
  $('#shareWarn').hidden = !warn.length;
  $('#shareWarn').innerHTML = `${ic('alert')}<span>Bài ${warn.join(', ')} — nên bổ sung trước khi gửi để giảng viên đánh giá đầy đủ.</span>`;
  $('#copyBtn').innerHTML = ic('copy') + 'Sao chép';
  $('#dlgShare').showModal();
  $('#shareUrl').select();
}
$('#shareBtn').onclick = openShare;
$('#copyBtn').onclick = run(async () => {
  await navigator.clipboard.writeText($('#shareUrl').value);
  $('#copyBtn').innerHTML = ic('check') + 'Đã chép';
});
$('#rotateBtn').onclick = run(async () => {
  if (!(await confirmBox('Tạo link mới?', 'Giảng viên đang giữ link cũ sẽ không vào được nữa. Góp ý cũ vẫn giữ nguyên.', { ok: 'Tạo link mới' }))) return;
  await api('/review-token', 'POST', {});
  await reload();
  openShare();
  toast('Đã tạo link mới');
});

// ============ Popup: thêm video (Drive / tải lên), quay bổ sung ============
let addTarget = null;
function openAdd(shot = null) {
  addTarget = shot;
  $('#hAdd').textContent = shot ? 'Quay bổ sung' : 'Thêm video';
  $('#addFor').hidden = !shot;
  if (shot) $('#addFor').innerHTML = `<b>${esc(shot.title)}</b><br><span class="small">${esc(shot.desc)} Gợi ý: nói "Cảnh: ${esc(shot.title)}" ở đầu video.</span>`;
  $('#upProgress').hidden = true;
  $('#driveUrl').value = '';
  $('#dlgAdd').showModal();
}
$('#addVideoBtn').onclick = () => openAdd();
document.querySelectorAll('[data-src]').forEach((t) => (t.onclick = () => {
  document.querySelectorAll('[data-src]').forEach((x) => x.setAttribute('aria-selected', x === t));
  document.querySelectorAll('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== t.dataset.src));
}));
$('#driveBtn').onclick = run(() => busy($('#driveBtn'), '', async () => {
  const r = await api('/drive', 'POST', { url: $('#driveUrl').value });
  $('#dlgAdd').close();
  await reload();
  toast(`Đã thêm ${r.videos} video${r.report ? ` và báo cáo "${r.report}"` : ''}. Đang tự quét…`);
}));
function upload(url, file, label) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/projects/${pid}${url}`);
    xhr.setRequestHeader('x-filename', encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => { $('#upBar').value = e.loaded / e.total; $('#upText').textContent = `${label} · ${Math.round((e.loaded / e.total) * 100)}%`; };
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(JSON.parse(xhr.responseText).error)));
    xhr.onerror = () => reject(new Error('Mất kết nối khi tải ' + file.name));
    xhr.send(file);
  });
}
async function uploadVideos(files) {
  files = [...files].filter((f) => /\.(mp4|webm|mov|m4v)$/i.test(f.name));
  if (!files.length) return toast('Chỉ nhận MP4/WebM/MOV', 'err');
  $('#upProgress').hidden = false;
  for (const [i, f] of files.entries()) await upload('/videos', f, `Video ${i + 1}/${files.length}: ${f.name}`);
  $('#dlgAdd').close();
  await reload();
  toast(`Đã tải ${files.length} video. Đang tự quét…`);
}
$('#fileInput').onchange = run(async () => { await uploadVideos($('#fileInput').files); $('#fileInput').value = ''; });
const drop = $('#drop');
drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = run(async (e) => { e.preventDefault(); drop.classList.remove('over'); await uploadVideos(e.dataTransfer.files); });

// ============ Popup: hướng dẫn quay ============
function openGuide() {
  $('#guideShots').innerHTML = `<table><thead><tr><th>#</th><th>Cảnh</th><th>Cần thể hiện</th></tr></thead><tbody>
    ${project.shots.map((s, i) => `<tr><td>${i + 1}</td><td><b>${esc(s.title)}</b></td><td>${esc(s.desc)}</td></tr>`).join('')}</tbody></table>
    <button class="ghost" id="gEdit">${ic('settings')}Chỉnh danh sách cảnh</button>`;
  $('#gEdit').onclick = () => { $('#dlgGuide').close(); openShots(); };
  $('#dlgGuide').showModal();
}
$('#guideBtn').onclick = openGuide;

// ============ Popup: quản lý video gốc ============
function stateBadge(s) {
  if (s === 'done') return `<span class="badge ok vstate">${ic('check')}Đã quét</span>`;
  if (s === 'queued') return `<span class="badge vstate">${ic('clock')}Chờ quét</span>`;
  if (s === 'scanning') return `<span class="badge accent vstate"><span class="spinner" style="width:12px;height:12px"></span>Đang quét</span>`;
  if (s?.startsWith('error')) return `<span class="badge warn vstate" title="${esc(s.slice(6))}">${ic('alert')}Lỗi</span>`;
  return '';
}
function renderVideoList() {
  $('#vlist').replaceChildren(...project.videos.map((v, i) => {
    const row = document.createElement('div');
    row.className = 'vrow';
    row.innerHTML = `<span class="n">${i + 1}</span><div class="row" style="min-width:0"><input maxlength="200" aria-label="Tên video ${i + 1}">${stateBadge(v.aiState)}</div><div class="acts"></div>`;
    const name = row.querySelector('input');
    name.value = v.name;
    name.onchange = run(() => api(`/videos/${v.id}`, 'PATCH', { name: name.value }).then(reload));
    const acts = row.querySelector('.acts');
    if (v.summary) acts.append(iconBtn('file', 'Xem tóm tắt AI', () => { $('#hSummary').textContent = v.name; $('#summaryBody').innerHTML = DOMPurify.sanitize(marked.parse(v.summary)); $('#dlgSummary').showModal(); }, 'sm'));
    acts.append(
      iconBtn('refresh', 'Quét lại video này', run(async () => { await api(`/ai/scan/${v.id}`, 'POST', {}); await reload(); toast('Đã đưa vào hàng quét'); }), 'sm'),
      iconBtn('up', 'Chuyển lên', run(() => api(`/videos/${v.id}`, 'PATCH', { move: -1 }).then(reload)), 'sm'),
      iconBtn('down', 'Chuyển xuống', run(() => api(`/videos/${v.id}`, 'PATCH', { move: 1 }).then(reload)), 'sm'),
      iconBtn('trash', 'Xoá video', run(async () => {
        if (await confirmBox(`Xoá video "${v.name}"?`, 'Các đoạn của video này sẽ bị bỏ khỏi bản trình bày.', { ok: 'Xoá', danger: true })) {
          await api(`/videos/${v.id}`, 'DELETE'); await reload(); toast('Đã xoá video');
        }
      }), 'sm'));
    acts.firstChild && i === 0 && (acts.children[acts.children.length - 3].disabled = true);
    if (i === project.videos.length - 1) acts.children[acts.children.length - 2].disabled = true;
    return row;
  }));
  if (!project.videos.length) $('#vlist').innerHTML = '<p class="muted">Chưa có video.</p>';
}
$('#videoMore').onclick = (e) => openMenu(e.currentTarget, [
  { icon: 'list', label: 'Quản lý video gốc', hint: 'Đổi tên, sắp xếp, xoá, xem tóm tắt AI', onClick: () => { renderVideoList(); $('#dlgVideos').showModal(); } },
  { icon: 'settings', label: 'Danh sách cảnh cần quay', hint: `${project.shots.length} cảnh`, onClick: openShots },
  { icon: 'refresh', label: 'Quét lại tất cả video', onClick: run(async () => { await api('/ai/scan', 'POST', {}); await reload(); toast('Đã đưa tất cả video vào hàng quét'); }) },
]);

// ============ Popup: danh sách cảnh ============
let shotDraft = [];
function openShots() { shotDraft = project.shots.map((s) => ({ ...s })); renderShotRows(); $('#dlgShots').showModal(); }
function renderShotRows() {
  $('#shotRows').replaceChildren(...shotDraft.map((s, i) => {
    const row = document.createElement('div');
    row.className = 'shotrow';
    row.innerHTML = `<span class="n">${i + 1}</span><input maxlength="120" placeholder="Tên cảnh" aria-label="Tên cảnh ${i + 1}">
      <input maxlength="500" placeholder="Cần thể hiện gì" aria-label="Mô tả cảnh ${i + 1}"><div class="acts"></div>`;
    const [t, d] = row.querySelectorAll('input');
    t.value = s.title; d.value = s.desc;
    t.oninput = () => (s.title = t.value);
    d.oninput = () => (s.desc = d.value);
    const swap = (j) => { [shotDraft[i], shotDraft[j]] = [shotDraft[j], shotDraft[i]]; renderShotRows(); };
    const up = iconBtn('up', 'Chuyển lên', () => swap(i - 1), 'sm'), down = iconBtn('down', 'Chuyển xuống', () => swap(i + 1), 'sm');
    up.disabled = i === 0; down.disabled = i === shotDraft.length - 1;
    row.querySelector('.acts').append(up, down, iconBtn('trash', 'Xoá cảnh', () => { shotDraft.splice(i, 1); renderShotRows(); }, 'sm'));
    return row;
  }));
}
$('#addShot').onclick = () => { shotDraft.push({ id: '', title: '', desc: '' }); renderShotRows(); $('#shotRows .shotrow:last-child input').focus(); };
$('#saveShots').onclick = run(async () => {
  await api('/shots', 'PUT', { shots: shotDraft.filter((s) => s.title.trim()) });
  $('#dlgShots').close();
  await reload();
  toast('Đã lưu danh sách cảnh. Bấm "Quét lại tất cả video" để chấm theo danh sách mới.');
});
$('#aiShotsBtn').onclick = run(() => busy($('#aiShotsBtn'), 'AI đang lập…', async () => {
  const r = await api('/ai/shots', 'POST', {});
  await reload();
  shotDraft = project.shots.map((s) => ({ ...s }));
  renderShotRows();
  toast(`AI đã lập ${r.count} cảnh từ báo cáo`);
}));

// ============ Popup: bổ sung thông tin (từng câu một) ============
let askIdx = 0, askList = [];
function openAsk() {
  askList = [...project.missing];
  askIdx = 0;
  if (!askList.length) return toast('Bài đã đủ thông tin');
  showAsk();
  $('#dlgAsk').showModal();
}
function showAsk() {
  const m = askList[askIdx];
  if (!m) { $('#dlgAsk').close(); reload(); return toast('Đã xong phần bổ sung thông tin'); }
  $('#askStep').textContent = `${askIdx + 1}/${askList.length}`;
  $('#askBar').style.width = `${(askIdx / askList.length) * 100}%`;
  $('#askKind').textContent = KIND[m.kind] || m.kind;
  $('#askQ').textContent = m.question;
  $('#askA').value = '';
  $('#askA').focus();
  $('#askSkip').textContent = m.source === 'ai' ? 'Bỏ qua câu này' : 'Để sau';
}
$('#askForm').onsubmit = run(async (e) => {
  e.preventDefault();
  await api(`/missing/${askList[askIdx].id}`, 'POST', { answer: $('#askA').value });
  askIdx++;
  showAsk();
});
$('#askSkip').onclick = run(async () => {
  const m = askList[askIdx];
  if (m.source === 'ai') await api(`/missing/${m.id}`, 'DELETE');
  askIdx++;
  showAsk();
});
$('#dlgAsk').addEventListener('close', () => reload().catch(() => {}));
$('#missingBadge').onclick = openAsk;

// ============ Menu: Trợ lý AI, dự án, báo cáo ============
$('#aiBtn').onclick = (e) => openMenu(e.currentTarget, [
  { icon: 'diagram', label: 'Tạo thêm sơ đồ & bảng', hint: 'Từ báo cáo, câu trả lời bổ sung và video', onClick: run(aiDiagrams) },
  { icon: 'message', label: 'Góp ý trước khi gửi', hint: 'AI đóng vai giảng viên; chỉ bạn thấy', onClick: run(aiReview) },
  { icon: 'list', label: 'Lập danh sách cảnh quay', hint: 'Từ các chức năng trong báo cáo', onClick: run(() => api('/ai/shots', 'POST', {}).then(async (r) => { await reload(); toast(`AI đã lập ${r.count} cảnh`); })) },
  { icon: 'check', label: 'Việc cần làm từ góp ý', hint: 'Gom góp ý giảng viên chưa sửa', onClick: run(aiTodo) },
  '-',
  { icon: 'settings', label: 'Cài đặt AI cá nhân', hint: 'Khoá Gemini & nhà cung cấp bổ sung, lượt dùng hôm nay', onClick: () => (location.href = '/#ai') },
]);
async function aiDiagrams() {
  toast('AI đang tạo sơ đồ và bảng…');
  const r = await api('/ai/diagrams', 'POST', {});
  await reload();
  toast(r.count ? `Đã thêm ${r.count} sơ đồ/bảng ở cuối báo cáo` : 'AI cần thêm thông tin — xem mục "Thiếu thông tin"');
}
async function aiReview() {
  toast('AI đang đọc bài…');
  const r = await api('/ai/review', 'POST', {});
  await loadComments(true);
  toast(`AI đã ghim ${r.count} nhận xét ở cột Góp ý (giảng viên không thấy)`);
}
async function aiTodo() {
  toast('AI đang tổng hợp góp ý…');
  const { items } = await api('/ai/todo', 'POST', {});
  $('#todo').innerHTML = items.length ? '' : `<li class="muted">Không còn góp ý nào của giảng viên chưa sửa.</li>`;
  for (const it of items) {
    const li = document.createElement('li');
    li.innerHTML = `<div class="row"><span class="badge ${it.priority === 'cao' ? 'warn' : ''}"></span><b style="font-weight:500"></b></div><div class="links"></div>`;
    li.querySelector('.badge').textContent = 'Ưu tiên ' + it.priority;
    li.querySelector('b').textContent = it.task;
    for (const cid of it.commentIds) {
      const c = comments.find((x) => x.id === cid);
      if (!c) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = ic(anchorInfo(c.anchor)[0]) + '<span></span>';
      b.lastChild.textContent = anchorInfo(c.anchor)[1].slice(0, 40);
      b.onclick = () => { $('#dlgTodo').close(); jumpTo(c); };
      li.querySelector('.links').append(b);
    }
    $('#todo').append(li);
  }
  $('#dlgTodo').showModal();
}
$('#moreBtn').onclick = (e) => openMenu(e.currentTarget, [
  { icon: 'pencil', label: 'Đổi tên dự án', onClick: run(async () => {
    const t = await promptBox('Đổi tên dự án', '', project.title, { ok: 'Lưu' });
    if (t && t.trim() !== project.title) { await api('', 'PATCH', { title: t }); await reload(); toast('Đã đổi tên'); }
  }) },
  { icon: 'upload', label: 'Tải báo cáo mới', hint: 'Thay báo cáo cũ, AI đọc lại', onClick: () => $('#reportInput').click() },
  '-',
  { icon: 'trash', label: 'Xoá dự án', danger: true, onClick: run(async () => {
    if ((await promptBox('Xoá vĩnh viễn dự án?', `Toàn bộ video, báo cáo, góp ý và điểm của "${project.title}" sẽ mất. Gõ XOA để xác nhận.`, '', { ok: 'Xoá vĩnh viễn', danger: true })) !== 'XOA') return;
    await api('', 'DELETE');
    location.href = '/';
  }) },
]);
$('#reportMore').onclick = (e) => openMenu(e.currentTarget, [
  { icon: 'upload', label: project.hasReport ? 'Tải báo cáo mới' : 'Tải báo cáo', hint: 'PDF/MD/TXT — AI tách phần, tạo bảng & sơ đồ', onClick: () => $('#reportInput').click() },
  { icon: 'diagram', label: 'Tạo thêm sơ đồ & bảng', onClick: run(aiDiagrams) },
]);
$('#addSectionBtn').onclick = run(addSection);
$('#reportInput').onchange = run(async () => {
  const f = $('#reportInput').files[0];
  $('#reportInput').value = '';
  if (!f) return;
  if (project.hasReport && !(await confirmBox('Thay báo cáo cũ?', 'Các phần hiện tại (kể cả phần đã sửa tay) sẽ được AI tạo lại từ báo cáo mới.', { ok: 'Thay báo cáo' }))) return;
  toast('Đang tải báo cáo…');
  const file = /\.docx$/i.test(f.name) ? await docxToHtml(f) : f;
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/projects/${pid}/report`);
    xhr.setRequestHeader('x-filename', encodeURIComponent(file.name));
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(JSON.parse(xhr.responseText).error)));
    xhr.onerror = () => reject(new Error('Mất kết nối'));
    xhr.send(file);
  });
  await reload();
});

// Word (.docx) → HTML ngay trên trình duyệt bằng mammoth (Gemini không đọc .docx).
// Giữ tiêu đề, bảng, danh sách; bỏ ảnh để file gọn (sơ đồ sẽ được AI vẽ lại bằng Mermaid).
function loadScript(src) {
  return (loadScript[src] ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Không tải được thư viện đọc file Word'));
    document.head.append(s);
  }));
}
async function docxToHtml(f) {
  await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js');
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await f.arrayBuffer() },
    { convertImage: mammoth.images.imgElement(() => ({ src: '' })) });
  return new File([value], f.name.replace(/\.docx$/i, '.html'), { type: 'text/html' });
}

// ============ Tải dữ liệu + tự cập nhật ============
async function reload() {
  project = await api('');
  renderHeader();
  renderSteps();
  renderStatus();
  renderVideo();
  renderScan();
  renderCoverage();
  await renderSections();
  renderList();
  if (isOwner()) loadEvals().catch(() => {}); else loadBrief();
  // Có việc nền (AI đọc báo cáo / quét video) → hỏi lại nhanh để thanh tiến độ chạy.
  clearTimeout(reload.timer);
  if (project.status.endsWith('…') || project.job) reload.timer = setTimeout(() => reload().catch(() => {}), 2000);
}

(async () => {
  setAnchor({ type: 'general' });
  try { await reload(); } catch (e) { $('#title').textContent = e.message; return; }
  await loadComments(true);
  const deep = location.hash.match(/^#c=(.+)/);
  const c = deep && comments.find((x) => x.id === deep[1]);
  if (c) jumpTo(c);
  if (!isOwner()) {
    api('/evaluations').then((r) => renderRateState(r.mine?.total, r.mine?.published, r.mine?.band)).catch(() => {});
    if (!seen('lecGuideSeen')) { $('#dlgLecGuide').showModal(); mark('lecGuideSeen'); }
  }
  setInterval(() => poll().catch(() => {}), 10000); // ponytail: hỏi lại mỗi 10s, đổi sang SSE nếu cần realtime
})();

// ============ Sửa góp ý của chính mình ============
function editComment(c) {
  $('#editText').value = c.body;
  $('#editForm').onsubmit = run(async (e) => {
    e.preventDefault();
    await api('/comments/' + c.id, 'PATCH', { body: $('#editText').value });
    $('#dlgEdit').close();
    await loadComments(true);
    toast('Đã sửa góp ý');
  });
  $('#dlgEdit').showModal();
}

// ============ Giảng viên: tóm tắt AI tự động ============
let briefData = null, briefLoading = false;
async function loadBrief() {
  if (briefLoading) return;
  const key = JSON.stringify([project.sections.length, project.videos.map((v) => v.id)]);
  if (loadBrief.key === key && briefData) return; // server cũng lưu cache theo nội dung → không tốn lượt AI
  loadBrief.key = key;
  briefLoading = true;
  $('#brief').hidden = false;
  if (!briefData) $('#brief').innerHTML = `<div class="block-head"><h2 id="hBrief">${ic('sparkles')}Tóm tắt nhanh</h2>
    <span class="muted small">AI đang đọc bài…</span></div><div class="skeleton"><i style="width:90%"></i><i style="width:75%"></i><i style="width:60%"></i></div>`;
  try {
    const { brief } = await api('/ai/brief', 'POST', {});
    briefData = brief;
    renderBrief();
  } catch (e) {
    if (/khoá AI/.test(e.message)) { $('#brief').hidden = true; return; } // sinh viên chưa cài AI → ẩn, không làm phiền giảng viên
    $('#brief').innerHTML = `<div class="block-head"><h2 id="hBrief">${ic('sparkles')}Tóm tắt nhanh</h2></div>
      <div class="brief-body"><p class="muted small" style="margin:0">Chưa tạo được tóm tắt AI: ${esc(e.message)}</p></div>`;
  } finally { briefLoading = false; }
}
function renderBrief() {
  const b = briefData;
  if (!b) { $('#brief').hidden = true; return; }
  const open = seen('briefClosed') !== '1';
  const li = (arr) => arr.map((x) => `<li>${esc(x)}</li>`).join('');
  $('#brief').innerHTML = `<div class="block-head"><h2 id="hBrief">${ic('sparkles')}Tóm tắt nhanh <span class="count">· AI</span></h2>
    <button class="icon-btn sm" id="briefToggle" aria-expanded="${open}" aria-label="${open ? 'Thu gọn' : 'Mở rộng'}" title="${open ? 'Thu gọn' : 'Mở rộng'}">${ic(open ? 'up' : 'down')}</button></div>
    <div class="brief-body" ${open ? '' : 'hidden'}>
      <p class="brief-sum">${esc(b.summary)}</p>
      <div class="chips">${b.stack.map((x) => `<span class="badge accent">${esc(x)}</span>`).join('')}</div>
      <div class="brief-cols">
        <div><h4>${ic('check')}Điểm mạnh</h4><ul>${li(b.strengths)}</ul></div>
        <div><h4>${ic('alert')}Cần kiểm tra</h4><ul>${li(b.risks)}</ul></div>
        <div><h4>${ic('help')}Câu hỏi phản biện</h4><ul class="qlist">${b.questions.map((q, i) =>
          `<li><span>${esc(q.q)}<small>${esc(q.why)}</small></span><button data-q="${i}" title="Đưa vào ô góp ý">Hỏi</button></li>`).join('')}</ul></div>
      </div>
    </div>`;
  $('#briefToggle').onclick = () => { mark('briefClosed', open ? '1' : '0'); renderBrief(); };
  $('#brief').querySelectorAll('[data-q]').forEach((btn) => (btn.onclick = () => {
    $('#text').value = b.questions[+btn.dataset.q].q;
    $('#text').focus();
    toast('Đã đưa câu hỏi vào ô góp ý — ghim vào chỗ cần hỏi rồi bấm Gửi');
  }));
}

// ============ Gợi ý góp ý (AI) ============
$('#suggestBtn').onclick = run(() => busy($('#suggestBtn'), 'Đang nghĩ…', async () => {
  const text = $('#text').value.trim();
  const { suggestions } = await api('/ai/suggest', 'POST', { anchor, text });
  $('#suggest').hidden = !suggestions?.length;
  $('#suggest').replaceChildren(...(suggestions || []).map((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t;
    b.title = 'Dùng gợi ý này';
    b.onclick = () => { $('#text').value = t; $('#suggest').hidden = true; $('#text').focus(); };
    return b;
  }));
  if (!suggestions?.length) toast('AI chưa có gợi ý cho vị trí này', 'err');
}));
$('#text').addEventListener('input', () => { if (!$('#text').value) $('#suggest').hidden = true; });

// ============ Giảng viên: chấm điểm rubric ============
let rubric = [], bands = [], aiRubric = null, saveTimer = null, myEval = null;
const bandOf = (m) => bands.find((b) => m >= b.min);
async function openRubric() {
  if (!lecturerName() && !(await askName())) return;
  const r = await api('/evaluations');
  rubric = r.rubric;
  bands = r.bands;
  myEval = r.mine;
  $('#bandTable').innerHTML = `<thead><tr><th>Điểm</th><th>Xếp loại</th><th>Mô tả</th></tr></thead><tbody>${bands.map((b, i) =>
    `<tr><td>${b.min}${i ? '–' + (bands[i - 1].min - 1) : '–100'}</td><td><b>${esc(b.name)}</b><br><small>${esc(b.vi)}</small></td><td>${esc(b.desc)}</td></tr>`).join('')}</tbody>`;
  $('#rubricRows').replaceChildren(...rubric.map((c) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><b></b><small></small></td><td>${c.weight}%</td>
      <td><input type="text" inputmode="numeric" maxlength="3" placeholder="0–100" data-score="${c.id}" aria-label="Điểm ${esc(c.title)} (0 đến 100)"><span class="ai-hint" data-ai="${c.id}"></span></td>
      <td><textarea rows="1" data-note="${c.id}" aria-label="Nhận xét ${esc(c.title)}"></textarea></td>`;
    tr.querySelector('b').textContent = c.title;
    tr.querySelector('small').textContent = c.desc;
    tr.querySelector('input').value = myEval?.scores[c.id] ?? '';
    tr.querySelector('textarea').value = myEval?.notes[c.id] ?? '';
    return tr;
  }));
  $('#rubricOverall').value = myEval?.overall || '';
  showAiRubric();
  updateTotal();
  $('#rubricSaved').textContent = myEval ? 'Đã lưu ' + new Date(myEval.updated).toLocaleTimeString('vi-VN', { timeStyle: 'short' }) : '';
  $('#rubricPub').textContent = myEval?.published ? 'Sinh viên đang thấy phiếu này; chỉnh sửa sẽ tự cập nhật.' : 'Bản nháp, sinh viên chưa thấy.';
  $('#publishBtn').innerHTML = ic('send') + (myEval?.published ? 'Đã gửi · cập nhật' : 'Gửi cho sinh viên');
  $('#dlgRubric').showModal();
}
function readRubric() {
  const scores = {}, notes = {};
  // Ô chữ thay vì type=number: lăn chuột không làm đổi điểm. Thang UK: số nguyên 0–100.
  document.querySelectorAll('[data-score]').forEach((i) => {
    const v = i.value.trim();
    const n = v === '' ? '' : Number(v);
    const bad = v !== '' && !(Number.isInteger(n) && n >= 0 && n <= 100);
    i.setAttribute('aria-invalid', bad);
    scores[i.dataset.score] = bad ? '' : n;
  });
  document.querySelectorAll('[data-note]').forEach((t) => (notes[t.dataset.note] = t.value));
  return { scores, notes, overall: $('#rubricOverall').value };
}
function updateTotal() {
  const { scores } = readRubric();
  const full = rubric.every((c) => scores[c.id] !== '');
  const mark = Math.round(rubric.reduce((a, c) => a + (Number(scores[c.id]) || 0) * c.weight, 0) / rubric.reduce((a, c) => a + c.weight, 0));
  $('#rubricTotal').textContent = full ? mark : '—';
  $('#rubricBand').hidden = !full;
  if (full) $('#rubricBand').textContent = `${bandOf(mark).name} · ${bandOf(mark).vi}`;
}
async function saveRubric(published) {
  const r = await api('/evaluations', 'PUT', { lecturer: lecturerName(), ...readRubric(), published });
  myEval = { ...(myEval || {}), published, updated: Date.now() };
  $('#rubricSaved').textContent = 'Đã lưu ' + new Date().toLocaleTimeString('vi-VN', { timeStyle: 'short' });
  renderRateState(r.total, published, r.band);
  return r;
}
// Tự lưu nháp 0,8s sau lần gõ cuối (đã gửi thì tự cập nhật bản sinh viên thấy).
$('#dlgRubric').addEventListener('input', () => {
  updateTotal();
  $('#rubricSaved').textContent = 'Đang lưu…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveRubric(!!myEval?.published).catch((e) => toast(e.message, 'err')), 800);
});
$('#publishBtn').onclick = run(async () => {
  clearTimeout(saveTimer);
  const r = await saveRubric(true);
  $('#rubricPub').textContent = 'Sinh viên đang thấy phiếu này; chỉnh sửa sẽ tự cập nhật.';
  $('#publishBtn').innerHTML = ic('send') + 'Đã gửi · cập nhật';
  toast(`Đã gửi điểm ${r.total}/100 (${r.band.name}) cho sinh viên`);
});
$('#aiRubricBtn').onclick = run(() => busy($('#aiRubricBtn'), 'AI đang chấm…', async () => {
  aiRubric = await api('/ai/rubric', 'POST', {});
  // Chỉ điền ô còn trống — không ghi đè điểm thầy/cô đã nhập.
  for (const c of aiRubric.criteria) {
    const inp = document.querySelector(`[data-score="${c.id}"]`);
    if (inp && inp.value === '') inp.value = c.score;
  }
  if (!$('#rubricOverall').value) $('#rubricOverall').value = aiRubric.overall;
  showAiRubric();
  $('#dlgRubric').dispatchEvent(new Event('input'));
  toast('Đã điền gợi ý AI vào ô trống — xem lý do dưới mỗi điểm và chỉnh lại nếu cần');
}));
function showAiRubric() {
  document.querySelectorAll('[data-ai]').forEach((el) => {
    const c = aiRubric?.criteria.find((x) => x.id === el.dataset.ai);
    el.textContent = c ? `AI gợi ý: ${c.score}` : '';
    el.title = c?.reason || '';
  });
}
function renderRateState(total, published, band) {
  const t = total != null ? `${total}${band ? ' · ' + band.short : ''}` : '';
  $('#rateState').textContent = published ? `Đã gửi ${t}` : t ? `Nháp ${t}` : '';
  $('#rateState').hidden = !$('#rateState').textContent;
}
$('#rateBtn').onclick = run(openRubric);
$('#helpBtn').onclick = () => $('#dlgLecGuide').showModal();

// ============ Sinh viên: kết quả đánh giá ============
async function loadEvals() {
  const { rubric: rb, list } = await api('/evaluations');
  $('#evals').hidden = !list.length;
  if (!list.length) return;
  $('#evals').innerHTML = `<div class="block-head"><h2 id="hEvals">${ic('list')}Kết quả đánh giá</h2></div>` + list.map((e) => `
    <div class="eval"><div class="eval-head"><span class="avatar" aria-hidden="true">${esc(e.lecturer[0] || '?').toUpperCase()}</span>
      <b>${esc(e.lecturer)}</b><span class="muted small">${new Date(e.updated).toLocaleDateString('vi-VN')}</span>
      <span class="total">${e.total ?? '—'}<span class="muted small">/100</span></span>${e.band ? `<span class="badge accent">${esc(e.band.name)} · ${esc(e.band.vi)}</span>` : ''}</div>
      <details><summary class="muted small" style="cursor:pointer;margin-top:6px">Chi tiết theo tiêu chí</summary>
        <table class="rubric"><tbody>${rb.map((c) => `<tr><td>${esc(c.title)} <small>${c.weight}%</small></td><td style="width:60px"><b>${e.scores[c.id] ?? '—'}</b><small>/100</small></td>
          <td>${esc(e.notes[c.id] || '')}</td></tr>`).join('')}</tbody></table></details>
      ${e.overall ? `<p style="margin:8px 0 0;white-space:pre-wrap">${esc(e.overall)}</p>` : ''}</div>`).join('');
  return list;
}

// ============ Thông báo tự động (toast) ============
let lastEvalCount = null;
async function poll() {
  const before = new Map(comments.map((c) => [c.id, c]));
  await loadComments();
  for (const c of comments) {
    const old = before.get(c.id);
    if (!old && !c.mine && c.role !== 'ai') toast(`${c.author} vừa góp ý: “${c.body.slice(0, 60)}${c.body.length > 60 ? '…' : ''}”`);
    else if (old && !old.resolved && c.resolved && !isOwner()) toast(`Sinh viên đã sửa: “${c.body.slice(0, 60)}”`);
  }
  if (isOwner()) {
    const list = await loadEvals();
    const n = list?.length || 0;
    if (lastEvalCount !== null && n > lastEvalCount) toast('Giảng viên vừa gửi điểm — xem mục Kết quả đánh giá');
    lastEvalCount = n;
  }
}

// ============ Phím tắt ============
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
  const k = e.key;
  if (k === ' ' && current) { e.preventDefault(); video.paused ? video.play().catch(() => {}) : video.pause(); }
  else if (k === 'ArrowLeft' && current) { e.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 5); }
  else if (k === 'ArrowRight' && current) { e.preventDefault(); video.currentTime += 5; }
  else if ((k === 'j' || k === 'k') && mode === 'story' && project.story.cuts.length) {
    playCut(Math.max(0, Math.min(project.story.cuts.length - 1, cutIdx + (k === 'k' ? 1 : -1))));
  } else if (k === 'c') { e.preventDefault(); $('#text').focus(); }
  else if (k === '?' && !isOwner()) $('#dlgLecGuide').showModal();
});

// ============ Trình sửa Mermaid: mẫu, xem trước trực tiếp, báo lỗi, AI sửa ============
const MER_TPL = {
  'Luồng chức năng (flowchart)': 'flowchart TD\n  start(["Người dùng mở app"]) --> login["Đăng nhập"]\n  login --> ok{"Hợp lệ?"}\n  ok -- "Có" --> home["Trang chủ"]\n  ok -- "Không" --> err["Báo lỗi"]',
  'Giao thức / API (sequence)': 'sequenceDiagram\n  actor U as Người dùng\n  participant FE as Frontend\n  participant API as Backend\n  participant DB as CSDL\n  U->>FE: Nhập email, mật khẩu\n  FE->>API: POST /api/login\n  API->>DB: Tìm user\n  DB-->>API: Thông tin user\n  API-->>FE: 200 + token\n  FE-->>U: Vào trang chủ',
  'Thiết kế lớp (class)': 'classDiagram\n  class User {\n    +String email\n    +login()\n  }\n  class Playlist {\n    +String name\n    +addSong(song)\n  }\n  User "1" --> "*" Playlist : sở hữu',
  'Cơ sở dữ liệu (ERD)': 'erDiagram\n  USER ||--o{ PLAYLIST : "tạo"\n  PLAYLIST ||--o{ SONG : "chứa"\n  USER {\n    int id PK\n    string email\n  }\n  PLAYLIST {\n    int id PK\n    int user_id FK\n  }',
  'Trạng thái (state)': 'stateDiagram-v2\n  [*] --> Moi\n  Moi --> DangXuLy : Xác nhận\n  DangXuLy --> HoanThanh : Giao xong\n  DangXuLy --> Huy : Huỷ\n  HoanThanh --> [*]',
  'Kế hoạch (gantt)': 'gantt\n  title Kế hoạch thực hiện\n  dateFormat YYYY-MM-DD\n  section Phân tích\n    Khảo sát yêu cầu :a1, 2026-09-01, 14d\n  section Phát triển\n    Backend :a2, after a1, 21d\n    Frontend :a3, after a1, 21d\n  section Kiểm thử\n    Kiểm thử & sửa lỗi :a4, after a2, 14d',
  'Kiến trúc (flowchart LR)': 'flowchart LR\n  subgraph client["Phía người dùng"]\n    web["Web React"]\n  end\n  subgraph server["Máy chủ"]\n    api["API Node.js"]\n    db[("PostgreSQL")]\n  end\n  web -->|"HTTPS/REST"| api --> db',
  'Tỉ lệ (pie)': 'pie title Kết quả kiểm thử\n  "Đạt" : 42\n  "Lỗi nhỏ" : 6\n  "Lỗi nghiêm trọng" : 2',
  'Số liệu (xychart)': 'xychart-beta\n  title "Thời gian phản hồi (ms)"\n  x-axis ["Đăng nhập", "Tìm kiếm", "Phát nhạc"]\n  y-axis "ms" 0 --> 500\n  bar [120, 340, 90]',
};
$('#merTpl').append(...Object.keys(MER_TPL).map((k) => new Option(k, k)));
$('#merTpl').onchange = async () => {
  const t = MER_TPL[$('#merTpl').value];
  $('#merTpl').value = '';
  if (!t) return;
  if ($('#secMer').value.trim() && !(await confirmBox('Thay sơ đồ hiện tại bằng mẫu?', 'Mã đang có trong ô sẽ bị thay thế.', { ok: 'Thay' }))) return;
  $('#secMer').value = t;
  previewMermaid();
};
let merSeq = 0, merTimer = null;
$('#secMer').addEventListener('input', () => { clearTimeout(merTimer); merTimer = setTimeout(previewMermaid, 400); });
async function previewMermaid() {
  const code = $('#secMer').value.trim(), seq = ++merSeq;
  $('#merErr').hidden = true;
  if (!code) { $('#merOut').innerHTML = ''; return; }
  try {
    const { svg } = await mermaid.render('mp' + seq, code);
    if (seq !== merSeq) return;
    $('#merOut').innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true, html: true }, ADD_TAGS: ['foreignObject'] });
  } catch (err) {
    if (seq !== merSeq) return;
    document.getElementById('dmp' + seq)?.remove(); // mermaid để lại phần tử lỗi trong body
    const msg = String(err?.message || err).split('\n').slice(0, 4).join('\n');
    $('#merErr').hidden = false;
    $('#merErr').innerHTML = `${ic('alert')}<div><b>Sơ đồ chưa hợp lệ</b> — xem "Lỗi hay gặp" trong hướng dẫn bên dưới, hoặc để AI sửa.<pre></pre></div>
      <button type="button" id="merFix" class="primary">${ic('sparkles')}AI sửa lỗi</button>`;
    $('#merErr pre').textContent = msg;
    $('#merFix').onclick = run(() => busy($('#merFix'), 'Đang sửa…', async () => {
      const r = await api('/ai/fix-mermaid', 'POST', { code, error: msg });
      $('#secMer').value = r.code;
      await previewMermaid();
      toast(`AI đã sửa: ${r.explain} — xem lại rồi bấm Lưu`);
    }));
  }
}
