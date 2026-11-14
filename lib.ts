// Kiểu dữ liệu dùng chung + hàm thuần (tách riêng để test được).

export type SectionKind = 'overview' | 'scope' | 'plan' | 'architecture' | 'diagram' | 'protocol' | 'result' | 'other';

export interface Section {
  id?: string;
  title: string;
  kind: SectionKind;
  markdown: string;
  mermaid: string; // rỗng nếu không phải sơ đồ
}

/** Vị trí một bình luận gắn vào: giây trong video, đoạn văn trong báo cáo, hoặc chung. */
export type Anchor =
  | { type: 'video'; video: string; t: number }
  | { type: 'text'; section: string; start: number; end: number; quote: string }
  | { type: 'section'; section: string }
  /** Nét vẽ của giảng viên trên sơ đồ: mỗi nét là [x1, y1, x2, y2, …] theo toạ độ viewBox của sơ đồ. */
  | { type: 'draw'; section: string; strokes: number[][] }
  | { type: 'general' };

export type Role = 'lecturer' | 'student' | 'ai';

// Nhận diện loại phần theo tiêu đề (khi không có AI).
const HEADING_KINDS: [RegExp, SectionKind][] = [
  [/scope|phạm vi/i, 'scope'],
  [/plan|kế hoạch|timeline|tiến độ|lịch trình/i, 'plan'],
  [/kiến trúc|architecture|công nghệ|tech|thiết kế hệ thống|cơ sở dữ liệu|database/i, 'architecture'],
  [/giao thức|protocol|\bapi\b|xác thực|bảo mật|security/i, 'protocol'],
  [/kết quả|result|đánh giá|kiểm thử|testing|demo/i, 'result'],
  [/giới thiệu|tổng quan|overview|introduction|mục tiêu|đặt vấn đề/i, 'overview'],
  [/sơ đồ|diagram/i, 'diagram'],
];

// Fallback khi không có AI: tách Markdown theo heading # / ##.
export function splitByHeadings(md: string): Section[] {
  const out: { title: string; lines: string[] }[] = [];
  let cur = { title: 'Tổng quan', lines: [] as string[] };
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^#{1,2}\s+(.+)/);
    if (h) {
      if (cur.lines.join('').trim()) out.push(cur);
      cur = { title: h[1].trim(), lines: [] };
    } else cur.lines.push(line);
  }
  if (cur.lines.join('').trim()) out.push(cur);
  return out.map(({ title, lines }) => {
    const body = lines.join('\n').trim();
    const mer = body.match(/```mermaid\n([\s\S]*?)```/);
    const kind: SectionKind = HEADING_KINDS.find(([re]) => re.test(title))?.[1] ?? (mer ? 'diagram' : 'other');
    return { title, kind, markdown: mer ? body.replace(mer[0], '').trim() : body, mermaid: mer ? mer[1].trim() : '' };
  });
}

// Chuẩn hoá anchor từ client (dữ liệu không tin cậy).
export function cleanAnchor(a: any): Anchor {
  const s = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
  if (a?.type === 'video') return { type: 'video', video: s(a.video, 20), t: Math.max(0, Number(a.t) || 0) };
  if (a?.type === 'section') return { type: 'section', section: s(a.section, 20) };
  if (a?.type === 'draw') { // ponytail: tối đa 60 nét × 2000 số ≈ vài chục KB / góp ý
    const strokes = (Array.isArray(a.strokes) ? a.strokes : []).slice(0, 60)
      .map((st: unknown) => (Array.isArray(st) ? st : []).slice(0, 2000).map(Number).filter(Number.isFinite)
        .map((n: number) => Math.round(Math.max(-1e5, Math.min(1e5, n)) * 10) / 10))
      .map((st: number[]) => st.slice(0, st.length & ~1)).filter((st: number[]) => st.length >= 4);
    return strokes.length ? { type: 'draw', section: s(a.section, 20), strokes } : { type: 'section', section: s(a.section, 20) };
  }
  if (a?.type === 'text') return { type: 'text', section: s(a.section, 20), start: a.start | 0, end: a.end | 0, quote: s(a.quote, 500) };
  return { type: 'general' };
}

// Link Google Drive → id file/folder. Id chỉ gồm [A-Za-z0-9_-] nên an toàn khi ghép vào query Drive API.
export function driveRef(url: string): { kind: 'file' | 'folder'; id: string } | null {
  const folder = url.match(/\/folders\/([\w-]{10,})/);
  if (folder) return { kind: 'folder', id: folder[1] };
  const file = url.match(/\/file\/d\/([\w-]{10,})/) || url.match(/[?&]id=([\w-]{10,})/);
  return file ? { kind: 'file', id: file[1] } : null;
}

export const KINDS: SectionKind[] = ['overview', 'scope', 'plan', 'architecture', 'diagram', 'protocol', 'result', 'other'];

export interface Student { name: string; mssv: string; phone: string }

// Kiểm tra form đăng ký. Trả về Student đã chuẩn hoá, hoặc chuỗi lỗi.
export function validateStudent(b: any): Student | string {
  const name = typeof b?.name === 'string' ? b.name.trim().replace(/\s+/g, ' ') : '';
  const mssv = normMssv(b?.mssv);
  const phone = typeof b?.phone === 'string' ? b.phone.replace(/[\s.-]/g, '') : '';
  if (name.length < 2 || name.length > 100) return 'Họ và tên không hợp lệ';
  if (!mssv) return 'Mã số sinh viên chỉ gồm chữ và số (4–20 ký tự)';
  if (!/^\+?\d{9,15}$/.test(phone)) return 'Số điện thoại không hợp lệ';
  return { name, mssv, phone };
}

export function normMssv(v: unknown): string {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : '';
  return /^[A-Z0-9]{4,20}$/.test(s) ? s : '';
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export const KIND_TITLE: Record<SectionKind, string> = {
  overview: 'Tổng quan', scope: 'Phạm vi (Scope)', plan: 'Kế hoạch', architecture: 'Kiến trúc & công nghệ',
  diagram: 'Sơ đồ', protocol: 'Giao thức / API', result: 'Kết quả', other: 'Khác',
};

/** Một thông tin còn thiếu mà hệ thống yêu cầu sinh viên bổ sung. */
export interface Missing { id: string; kind: SectionKind; question: string; source: 'checklist' | 'ai' }

// Khung tối thiểu của một bài trình bày đồ án. Thiếu phần nào → hỏi sinh viên ngay.
const CHECKLIST: [SectionKind, string][] = [
  ['overview', 'Dự án giải quyết bài toán gì, cho ai? Mục tiêu chính là gì?'],
  ['scope', 'Phạm vi: những chức năng nào LÀM và những chức năng nào KHÔNG làm?'],
  ['plan', 'Kế hoạch thực hiện: các mốc thời gian, mỗi giai đoạn làm gì, ai phụ trách?'],
  ['architecture', 'Kiến trúc & công nghệ: frontend, backend, cơ sở dữ liệu, triển khai ở đâu? Các bảng dữ liệu chính?'],
  ['protocol', 'Các thành phần giao tiếp thế nào (REST/WebSocket/…)? Xác thực và bảo mật ra sao?'],
  ['result', 'Kết quả đạt được: đã hoàn thành gì, kiểm thử thế nào, số liệu cụ thể (thời gian phản hồi, số người dùng thử…)?'],
];

export function checklistMissing(sections: Section[]): Missing[] {
  const has = new Set(sections.filter((s) => s.markdown.trim().length > 40).map((s) => s.kind));
  return CHECKLIST.filter(([k]) => !has.has(k)).map(([kind, question]) => ({ id: 'k-' + kind, kind, question, source: 'checklist' }));
}

// Gộp câu hỏi mới vào danh sách, bỏ câu trùng.
export function mergeMissing(list: Missing[], add: Missing[]): Missing[] {
  const seen = new Set(list.map((m) => m.question.trim().toLowerCase()));
  return [...list, ...add.filter((m) => !seen.has(m.question.trim().toLowerCase()) && seen.add(m.question.trim().toLowerCase()))];
}

// ---- Yêu cầu video ("cảnh cần quay") + bản trình bày tự cắt ----
export interface Shot { id: string; title: string; desc: string }
/** AI chấm: đoạn [start, end] của 1 video thể hiện cảnh shotId, điểm 0–100. */
export interface Coverage { shotId: string; start: number; end: number; score: number; note: string }

export const PASS_SCORE = 60; // dưới mức này coi là "chưa rõ", cần quay lại

export const DEFAULT_SHOTS: Shot[] = [
  { id: 'intro', title: 'Giới thiệu', desc: 'Tên đề tài, thành viên, bài toán giải quyết và người dùng mục tiêu (30–60 giây).' },
  { id: 'arch', title: 'Kiến trúc & công nghệ', desc: 'Mở sơ đồ kiến trúc, nói các thành phần và công nghệ đã chọn.' },
  { id: 'auth', title: 'Đăng ký / đăng nhập', desc: 'Tạo tài khoản, đăng nhập, đăng xuất; thử nhập sai để thấy thông báo lỗi.' },
  { id: 'main', title: 'Chức năng chính', desc: 'Thao tác trọn vẹn luồng quan trọng nhất từ đầu đến cuối.' },
  { id: 'data', title: 'Dữ liệu & quản trị', desc: 'Màn hình quản trị hoặc cơ sở dữ liệu thay đổi sau thao tác.' },
  { id: 'edge', title: 'Xử lý lỗi & trường hợp biên', desc: 'Dữ liệu sai, mất mạng, quyền không đủ… hệ thống phản hồi thế nào.' },
  { id: 'result', title: 'Kết quả & hướng phát triển', desc: 'Tổng kết đã làm được gì, số liệu kiểm thử, hạn chế, hướng mở rộng.' },
];

export interface Cut { shot: Shot; video: string; start: number; end: number; score: number; note: string }

/**
 * Bản trình bày: theo thứ tự cảnh, lấy đoạn điểm cao nhất trong mọi video.
 * Phần video không khớp cảnh nào bị bỏ (cắt), đoạn quay bổ sung tự lấp chỗ thiếu.
 */
export function storyboard(shots: Shot[], videos: { id: string; coverage: Coverage[] }[]) {
  const cuts: Cut[] = [], missing: Shot[] = [], weak: Cut[] = [];
  for (const shot of shots) {
    let best: Cut | null = null;
    for (const v of videos) for (const c of v.coverage) {
      if (c.shotId !== shot.id || !(c.end > c.start)) continue;
      if (!best || c.score > best.score) best = { shot, video: v.id, start: c.start, end: c.end, score: c.score, note: c.note };
    }
    if (!best) missing.push(shot);
    else { cuts.push(best); if (best.score < PASS_SCORE) weak.push(best); }
  }
  const done = cuts.length - weak.length;
  return { cuts, missing, weak, pct: shots.length ? Math.round((done / shots.length) * 100) : 0 };
}

// ---- Rubric chấm đồ án ngành Khoa học Máy tính (thang điểm UK 0–100) ----
export interface Criterion { id: string; title: string; weight: number; desc: string }
export const RUBRIC: Criterion[] = [
  { id: 'func', title: 'Mức độ hoàn thành chức năng', weight: 25, desc: 'Các chức năng trong phạm vi chạy được, trọn luồng, ít lỗi.' },
  { id: 'design', title: 'Phân tích & thiết kế hệ thống', weight: 20, desc: 'Kiến trúc, CSDL, sơ đồ hợp lý và khớp với sản phẩm.' },
  { id: 'tech', title: 'Kỹ thuật & công nghệ', weight: 15, desc: 'Chọn công nghệ có lý do, giải quyết vấn đề kỹ thuật khó, bảo mật.' },
  { id: 'test', title: 'Kiểm thử & kết quả', weight: 15, desc: 'Có kiểm thử, số liệu cụ thể, đánh giá trung thực.' },
  { id: 'report', title: 'Báo cáo & tài liệu', weight: 15, desc: 'Cấu trúc rõ, đủ phần, bảng và sơ đồ dễ hiểu.' },
  { id: 'demo', title: 'Trình bày & video demo', weight: 10, desc: 'Video rõ ràng, đủ cảnh, thuyết minh mạch lạc.' },
];

/** Điểm tổng có trọng số theo thang UK (0–100, làm tròn số nguyên); null nếu chưa chấm đủ tiêu chí. */
export function rubricTotal(scores: Record<string, unknown>): number | null {
  let sum = 0;
  for (const c of RUBRIC) {
    const v = scores[c.id];
    if (typeof v !== 'number' || !(v >= 0 && v <= 100)) return null;
    sum += v * c.weight;
  }
  return Math.round(sum / RUBRIC.reduce((a, c) => a + c.weight, 0));
}

/** Xếp loại theo thang UK. */
export const UK_BANDS = [
  { min: 70, short: 'First', name: 'First Class', vi: 'Xuất sắc', desc: 'Vượt yêu cầu: hiểu sâu, phân tích phản biện, sản phẩm hoàn chỉnh, có tính sáng tạo/độc lập.' },
  { min: 60, short: '2:1', name: 'Upper Second (2:1)', vi: 'Giỏi', desc: 'Đáp ứng tốt mọi yêu cầu, thiết kế và triển khai vững, còn ít thiếu sót nhỏ.' },
  { min: 50, short: '2:2', name: 'Lower Second (2:2)', vi: 'Khá', desc: 'Đáp ứng phần lớn yêu cầu, chủ yếu mô tả, phân tích/kiểm thử còn hạn chế.' },
  { min: 40, short: 'Third', name: 'Third Class', vi: 'Đạt', desc: 'Đạt mức tối thiểu, nhiều thiếu sót về chức năng hoặc tài liệu.' },
  { min: 0, short: 'Fail', name: 'Fail', vi: 'Không đạt', desc: 'Chưa đạt yêu cầu tối thiểu.' },
];
export const ukBand = (mark: number) => UK_BANDS.find((b) => mark >= b.min)!;
