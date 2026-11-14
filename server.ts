// Demo Review — server: Node stdlib (http + node:sqlite + fetch). Không dependency runtime.
// Sinh viên: tài khoản bằng MSSV, CRUD bài trình bày. Giảng viên: không tài khoản, vào bằng link review bí mật.
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import { setTimeout as sleep } from 'node:timers/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import {
  splitByHeadings, parseRange, cleanAnchor, driveRef, validateStudent, normMssv, parseCookies, KINDS, KIND_TITLE,
  checklistMissing, mergeMissing, storyboard, DEFAULT_SHOTS, RUBRIC, rubricTotal, UK_BANDS, ukBand, type Section, type Missing, type Shot, type Coverage,
} from './lib.ts';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const UPLOADS = path.join(ROOT, 'uploads');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1'; // chỉ nghe nội bộ; Caddy đứng trước lo HTTPS (Docker thì đặt HOST=0.0.0.0)
const GKEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || ''; // 1 key cho cả Gemini + Drive
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
// Thử Flash trước (tốt hơn), hết lượt miễn phí thì xuống Flash-Lite (quota/ngày lớn hơn nhiều).
// Gemini free tier: Flash-Lite ~500 lượt/ngày (đủ dùng), Flash chỉ ~20 lượt/ngày → Lite trước, Flash dự phòng.
// Quota tính theo từng Google Cloud project → sinh viên nhập key riêng thì bài của họ không tranh quota chung.
const GEMINI_MODELS = (process.env.GEMINI_MODELS || 'gemini-flash-lite-latest,gemini-flash-latest').split(',');
// Nhà cung cấp AI cho việc chỉ có chữ (chuẩn OpenAI chat/completions, đều có gói miễn phí). Chỉ cho chọn trong danh sách
// này — không nhận URL tuỳ ý để server không bị lợi dụng gọi ra ngoài. Model mặc định sinh viên đổi được.
const PROVIDERS: Record<string, { name: string; base: string; model: string; json: boolean }> = {
  groq: { name: 'Groq', base: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b', json: true },
  github: { name: 'GitHub Models', base: 'https://models.github.ai/inference', model: 'openai/gpt-4.1-mini', json: true },
  mistral: { name: 'Mistral', base: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', json: true },
  openrouter: { name: 'OpenRouter', base: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free', json: false },
  // Claude: không có gói miễn phí (trả theo token) — gọi qua SDK chính thức, xem claude() bên dưới.
  claude: { name: 'Claude (Anthropic)', base: '', model: 'claude-opus-5-5', json: true },
};
type ProviderCfg = { id: string; key: string; model: string };
// Khoá chung của server (tuỳ chọn) làm dự phòng sau khoá của sinh viên.
const GROQ_KEY = process.env.GROQ_API_KEY || '';
const MAX_UPLOAD = 2 * 1024 ** 3;
const MAX_INLINE_PDF = 18 * 1024 ** 2; // Gemini nhận inline ~20MB/request
const VIDEO_EXT = ['.mp4', '.webm', '.mov', '.m4v'];
const REPORT_EXT = ['.pdf', '.md', '.txt', '.html']; // .docx được trình duyệt đổi sang .html (mammoth)
const SESSION_DAYS = 30;
fs.mkdirSync(UPLOADS, { recursive: true });

const db = new DatabaseSync(path.join(ROOT, 'data.db'));
function q0(sql: string, ...args: any[]) { db.prepare(sql).run(...args); }
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS students (mssv TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, mssv TEXT NOT NULL REFERENCES students(mssv), created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES students(mssv),
    title TEXT NOT NULL, review_token TEXT NOT NULL UNIQUE, created INTEGER NOT NULL,
    report TEXT, sections TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT '');
  CREATE TABLE IF NOT EXISTS videos (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL, file TEXT NOT NULL, pos INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    author TEXT NOT NULL, role TEXT NOT NULL, body TEXT NOT NULL, anchor TEXT NOT NULL,
    created INTEGER NOT NULL, resolved INTEGER NOT NULL DEFAULT 0);
`);
// Cột thêm sau (CSDL cũ chưa có thì thêm, đã có thì bỏ qua).
for (const sql of ["ALTER TABLE projects ADD COLUMN missing TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE videos ADD COLUMN chapters TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE videos ADD COLUMN coverage TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE videos ADD COLUMN summary TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE videos ADD COLUMN ai_state TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE projects ADD COLUMN shots TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE students ADD COLUMN gemini_key TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE students ADD COLUMN ai_providers TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE projects ADD COLUMN rubric_ai TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE projects ADD COLUMN brief TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE comments ADD COLUMN author_key TEXT NOT NULL DEFAULT ''"]) try { db.exec(sql); } catch {}
// Theo dõi lượt gọi & token AI theo ngày để sinh viên biết mình dùng bao nhiêu.
db.exec(`CREATE TABLE IF NOT EXISTS ai_usage (mssv TEXT NOT NULL, day TEXT NOT NULL, provider TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0, tokens INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (mssv, day, provider))`);
// Phiếu chấm: mỗi giảng viên (nhận diện bằng mã ngẫu nhiên lưu trong trình duyệt) 1 phiếu / dự án.
db.exec(`CREATE TABLE IF NOT EXISTS evaluations (project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  lecturer_key TEXT NOT NULL, lecturer TEXT NOT NULL, scores TEXT NOT NULL DEFAULT '{}', notes TEXT NOT NULL DEFAULT '{}',
  overall TEXT NOT NULL DEFAULT '', published INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL,
  PRIMARY KEY (project_id, lecturer_key))`);

q0('DELETE FROM sessions WHERE created < ?', Date.now() - SESSION_DAYS * 86400_000); // dọn phiên hết hạn mỗi lần khởi động

const id = () => crypto.randomUUID().slice(0, 8);
const token = () => crypto.randomBytes(18).toString('base64url');
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const q = (sql: string) => db.prepare(sql);

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function send(res: ServerResponse, code: number, data: unknown, headers: Record<string, string> = {}) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(data));
}

async function readJson(req: IncomingMessage): Promise<any> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 200_000) throw new HttpError(413, 'Dữ liệu quá lớn');
  }
  return JSON.parse(raw || '{}');
}

// Stream body thẳng xuống đĩa (không buffer video vào RAM).
async function saveUpload(req: IncomingMessage, allowed: string[]): Promise<string> {
  const ext = path.extname(str(decodeURIComponent(String(req.headers['x-filename'] || '')), 200)).toLowerCase();
  if (!allowed.includes(ext)) throw new HttpError(400, `Chỉ nhận: ${allowed.join(', ')}`);
  if (Number(req.headers['content-length']) > MAX_UPLOAD) throw new HttpError(413, 'File quá 2GB');
  const file = crypto.randomUUID() + ext;
  await pipeline(req, fs.createWriteStream(path.join(UPLOADS, file)));
  return file;
}

const removeUpload = (file: string | null) => {
  if (file && !file.startsWith('drive:')) fs.rm(path.join(UPLOADS, path.basename(file)), { force: true }, () => {});
};

// ---- Phiên đăng nhập (cookie HttpOnly) ----
function sessionCookie(req: IncomingMessage, value: string, maxAge: number) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `sid=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}
function startSession(req: IncomingMessage, mssv: string) {
  const t = token();
  q('INSERT INTO sessions (token, mssv, created) VALUES (?, ?, ?)').run(t, mssv, Date.now());
  return { 'set-cookie': sessionCookie(req, t, SESSION_DAYS * 86400) };
}
function currentStudent(req: IncomingMessage): { mssv: string; name: string } | undefined {
  const sid = parseCookies(req.headers.cookie).sid;
  if (!sid) return;
  return q(`SELECT s.mssv, s.name FROM sessions x JOIN students s ON s.mssv = x.mssv
            WHERE x.token = ? AND x.created > ?`).get(sid, Date.now() - SESSION_DAYS * 86400_000) as any;
}

// Quyền với 1 dự án: chủ (sinh viên đã đăng nhập) hoặc giảng viên (có review token trong header).
function access(req: IncomingMessage, proj: any): 'owner' | 'lecturer' | null {
  if (currentStudent(req)?.mssv === proj.owner) return 'owner';
  const a = Buffer.from(String(req.headers['x-review-token'] || '')), b = Buffer.from(proj.review_token);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? 'lecturer' : null;
}

// Giảng viên không có tài khoản: trình duyệt tự sinh 1 mã ngẫu nhiên → chỉ người giữ mã sửa/xoá được góp ý & phiếu chấm của mình.
function lecturerKey(req: IncomingMessage): string {
  const k = String(req.headers['x-lecturer-key'] || '');
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(k)) throw new HttpError(400, 'Thiếu mã giảng viên, hãy tải lại trang');
  return k;
}

// ---- AI (Gemini, free tier): tách báo cáo thành các phần ----
const SECTION_ITEM = {
  type: 'OBJECT', required: ['title', 'kind', 'markdown', 'mermaid'],
  properties: { title: { type: 'STRING' }, kind: { type: 'STRING', enum: KINDS }, markdown: { type: 'STRING' }, mermaid: { type: 'STRING' } },
};
const MISSING_ITEM = {
  type: 'OBJECT', required: ['kind', 'question'],
  properties: { kind: { type: 'STRING', enum: KINDS }, question: { type: 'STRING' } },
};
const SECTION_SCHEMA = {
  type: 'OBJECT', required: ['sections', 'missing'],
  properties: { sections: { type: 'ARRAY', items: SECTION_ITEM }, missing: { type: 'ARRAY', items: MISSING_ITEM } },
};

// Hướng dẫn vẽ sơ đồ: Mermaid v11 phủ gần hết sơ đồ một đồ án CNTT cần.
const DIAGRAM_GUIDE =
  'Sơ đồ viết bằng cú pháp Mermaid v11 HỢP LỆ (không bọc ```), nhãn có dấu cách/ký tự đặc biệt thì đặt trong ngoặc kép. ' +
  'Chọn loại phù hợp: flowchart TD (luồng chức năng, use case), sequenceDiagram (giao thức, API, đăng nhập), ' +
  'classDiagram (thiết kế OOP), erDiagram (cơ sở dữ liệu), stateDiagram-v2 (trạng thái đối tượng), ' +
  'gantt (kế hoạch, timeline, dateFormat YYYY-MM-DD), mindmap (tổng quan tính năng), timeline (các mốc), ' +
  'architecture-beta hoặc flowchart LR với subgraph (kiến trúc hệ thống), ' +
  'pie (tỉ lệ, ví dụ phân bố kết quả kiểm thử), xychart-beta (số liệu theo thời gian/hạng mục, ví dụ thời gian phản hồi). ' +
  'Mỗi sơ đồ là một phần kind="diagram", markdown giải thích ngắn sơ đồ thể hiện gì.';
// Giảng viên đọc bảng nhanh hơn đoạn văn: chuyển mọi thông tin có cấu trúc thành bảng Markdown (GFM).
const TABLE_GUIDE =
  'Trình bày cho giảng viên NHÌN LÀ HIỂU: mọi thông tin có cấu trúc phải chuyển thành bảng Markdown (GFM, có dòng tiêu đề), ' +
  'đoạn văn chỉ giữ phần giải thích ngắn. Các bảng nên có khi báo cáo có dữ liệu: ' +
  'Công nghệ sử dụng (Thành phần | Công nghệ | Lý do chọn); Phạm vi (Chức năng | Làm/Không làm | Ghi chú); ' +
  'Kế hoạch (Giai đoạn | Thời gian | Công việc | Người phụ trách | Trạng thái); Phân công nhóm (Thành viên | Vai trò | Công việc); ' +
  'API (Method | Endpoint | Mô tả | Xác thực); Cơ sở dữ liệu (Bảng | Trường chính | Quan hệ); ' +
  'Kết quả kiểm thử (Ca kiểm thử | Kỳ vọng | Kết quả | Đạt?); So sánh giải pháp (Tiêu chí | Phương án A | Phương án B); Rủi ro (Rủi ro | Ảnh hưởng | Cách xử lý). ' +
  'Chỉ điền số liệu có trong tài liệu, ô không có dữ liệu ghi "—" (không bịa). ';
const MISSING_GUIDE =
  'Trường missing: liệt kê các thông tin giảng viên cần nhưng báo cáo còn thiếu hoặc quá sơ sài (ví dụ: thiếu số liệu kiểm thử, ' +
  'không rõ CSDL gồm bảng nào, không có timeline, không nói cách xác thực), mỗi mục là một câu hỏi cụ thể, ngắn gọn, ' +
  'xưng "bạn", để sinh viên trả lời ngay. Tối đa 8 câu, quan trọng nhất trước.';
const PROMPT =
  'Đây là báo cáo đồ án sinh viên. Tách nó thành các phần để giảng viên review: tổng quan, scope, plan/timeline, ' +
  'kiến trúc, giao thức, kết quả... Giữ đủ ý của báo cáo (không bỏ thông tin), viết lại dạng Markdown, giữ nguyên ngôn ngữ gốc. ' +
  TABLE_GUIDE +
  'Vẽ lại MỌI hình/sơ đồ có trong báo cáo. Sau đó TỰ VẼ THÊM các sơ đồ quan trọng mà báo cáo chưa có nhưng suy ra được từ nội dung ' +
  '(kiến trúc, ERD, sequence cho luồng chính, gantt cho kế hoạch, use case), ghi "*(AI đề xuất từ nội dung báo cáo)*" ở đầu markdown của chúng. ' +
  DIAGRAM_GUIDE + ' Các phần không phải sơ đồ để mermaid là chuỗi rỗng. ' + MISSING_GUIDE;

async function extractWithGemini(full: string, isPdf: boolean, pid: string, key: string): Promise<{ sections: Section[]; missing: any[] }> {
  const parts: any[] = isPdf
    ? [{ inline_data: { mime_type: 'application/pdf', data: fs.readFileSync(full).toString('base64') } }]
    : [{ text: fs.readFileSync(full, 'utf8') }];
  parts.push({ text: PROMPT });
  return gemini(parts, SECTION_SCHEMA, {}, pid, key);
}

// Chuẩn hoá output AI → Section/Missing có id, kind hợp lệ.
const toSections = (list: any[]): Section[] => (list || []).map((s) => ({
  id: 's' + id(), title: str(s.title, 200) || 'Không tên', kind: KINDS.includes(s.kind) ? s.kind : 'other',
  markdown: typeof s.markdown === 'string' ? s.markdown : '', mermaid: typeof s.mermaid === 'string' ? s.mermaid : '' }));
const toMissing = (list: any[]): Missing[] => (list || []).filter((m) => str(m.question, 500)).map((m) => ({
  id: 'm' + id(), kind: KINDS.includes(m.kind) ? m.kind : 'other', question: str(m.question, 500), source: 'ai' as const }));

// Đọc–sửa–ghi đồng bộ (không await ở giữa) nên không giẫm lên nhau khi nhiều tác vụ AI chạy song song.
function updateProject(pid: string, fn: (p: { sections: Section[]; missing: Missing[] }) => void) {
  const row = q('SELECT sections, missing FROM projects WHERE id = ?').get(pid) as any;
  if (!row) return;
  const p = { sections: JSON.parse(row.sections), missing: JSON.parse(row.missing) };
  fn(p);
  q('UPDATE projects SET sections = ?, missing = ? WHERE id = ?').run(JSON.stringify(p.sections), JSON.stringify(p.missing), pid);
}
const setStatus = (pid: string, s: string) => q('UPDATE projects SET status = ? WHERE id = ?').run(s, pid);

const NO_AI = 'Chưa có khoá AI: sinh viên vào Tài khoản › Cài đặt AI cá nhân để thêm khoá Gemini (miễn phí)';
const ownerOf = (pid: string): string => (q('SELECT owner FROM projects WHERE id = ?').get(pid) as any)?.owner || '';
/** Key Gemini cho 1 dự án: key riêng của sinh viên chủ dự án, không có thì key chung của server. */
const keyFor = (pid: string): string =>
  (q('SELECT s.gemini_key AS k FROM projects p JOIN students s ON s.mssv = p.owner WHERE p.id = ?').get(pid) as any)?.k || GKEY;
const providersFor = (pid: string): ProviderCfg[] =>
  JSON.parse((q('SELECT s.ai_providers AS v FROM projects p JOIN students s ON s.mssv = p.owner WHERE p.id = ?').get(pid) as any)?.v || '[]');

function recordUsage(pid: string, provider: string, tokens: number) {
  const mssv = ownerOf(pid);
  if (!mssv) return;
  q(`INSERT INTO ai_usage (mssv, day, provider, calls, tokens) VALUES (?, ?, ?, 1, ?)
     ON CONFLICT (mssv, day, provider) DO UPDATE SET calls = calls + 1, tokens = tokens + excluded.tokens`)
    .run(mssv, new Date().toISOString().slice(0, 10), provider, tokens || 0);
}

// JSON đôi khi bị model bọc trong ```json … ``` hoặc kèm chữ → lấy phần object.
function parseJson(text: string): any {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('AI không trả về JSON');
  return JSON.parse(m[0]);
}

// Gọi Gemini, ép trả JSON theo schema. Hết lượt free ở model này thì tự chuyển model kế.
async function gemini(parts: any[], schema: object, extra: object, pid: string, key = keyFor(pid)): Promise<any> {
  if (!key) throw new HttpError(400, NO_AI);
  const body = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, ...extra },
  });
  let last = '';
  for (const model of GEMINI_MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.trim()}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body,
    });
    const j: any = await r.json().catch(() => ({}));
    if (r.status === 429 || r.status >= 500) { last = `${model}: ${j.error?.message || r.status}`; continue; } // thử model kế
    if (!r.ok) throw new Error(j.error?.message || `Gemini lỗi ${r.status}`);
    recordUsage(pid, 'gemini', j.usageMetadata?.totalTokenCount);
    const cand = j.candidates?.[0];
    const text = cand?.content?.parts?.map((x: any) => x.text || '').join('');
    if (!text) throw new Error('Gemini không trả kết quả (' + (cand?.finishReason || j.promptFeedback?.blockReason || '?') + ')');
    return parseJson(text);
  }
  throw new HttpError(429, 'Gemini đã hết lượt miễn phí hôm nay, thử lại sau hoặc thêm nhà cung cấp khác ở Cài đặt AI (' + last + ')');
}

// Schema kiểu Gemini (OBJECT/STRING…) → JSON Schema cho structured outputs của Claude.
function toJsonSchema(sc: any): any {
  const out: any = { type: String(sc.type).toLowerCase() };
  if (sc.enum) out.enum = sc.enum;
  if (sc.items) out.items = toJsonSchema(sc.items);
  if (sc.properties) {
    out.properties = Object.fromEntries(Object.entries(sc.properties).map(([k, v]) => [k, toJsonSchema(v)]));
    out.required = Object.keys(sc.properties);
    out.additionalProperties = false;
  }
  return out;
}

// Claude qua SDK chính thức. Tiết kiệm token: effort "low", đầu ra ép đúng JSON schema (không phải gọi lại vì hỏng JSON).
async function claude(p: ProviderCfg, system: string, prompt: string, schema: object): Promise<{ text: string; tokens: number }> {
  const model = p.model || PROVIDERS.claude.model;
  const client = new Anthropic({ apiKey: p.key });
  const gen5 = /^claude-(opus|sonnet|haiku|fable)-5/.test(model);
  // Server-side fallback khi Claude từ chối (refusal) — chỉ các model hỗ trợ.
  const fallback = /^claude-(opus-5|sonnet-5-5|fable-5)/.test(model);
  const msg: any = await client.beta.messages.create({
    model, max_tokens: 16000, system, messages: [{ role: 'user', content: prompt }],
    ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    output_config: { ...(gen5 ? { effort: 'low' } : {}), format: { type: 'json_schema', schema: toJsonSchema(schema) } },
  } as any);
  if (msg.stop_reason === 'refusal') throw new Error('Claude từ chối xử lý yêu cầu này');
  const text = msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  return { text, tokens: (msg.usage?.input_tokens || 0) + (msg.usage?.output_tokens || 0) };
}

/** Gọi 1 nhà cung cấp chuẩn OpenAI. maxTokens nhỏ dùng để kiểm tra khoá. */
async function compat(p: ProviderCfg, messages: any[], opts: { json?: boolean; maxTokens?: number } = {}): Promise<any> {
  const pv = PROVIDERS[p.id];
  if (!pv) throw new Error('Nhà cung cấp không hỗ trợ');
  const model = p.model || pv.model;
  const r = await fetch(`${pv.base}/chat/completions`, {
    method: 'POST', headers: { authorization: `Bearer ${p.key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages,
      ...(opts.json && pv.json ? { response_format: { type: 'json_object' } } : {}),
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      ...(model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}), // bớt token "suy nghĩ"
    }) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(r.status === 401 || r.status === 403 ? 400 : r.status, `${pv.name}: ${j.error?.message || j.message || r.status}`);
  return j;
}

/** Việc chỉ có chữ: lần lượt các nhà cung cấp sinh viên đã thêm → khoá chung của server → Gemini. */
async function aiText(pid: string, prompt: string, schema: object): Promise<any> {
  const list = [...providersFor(pid), ...(GROQ_KEY ? [{ id: 'groq', key: GROQ_KEY, model: '' }] : [])];
  const system = 'Chỉ trả về một object JSON hợp lệ theo đúng cấu trúc (mô tả kiểu OpenAPI): ' + JSON.stringify(schema);
  for (const p of list) {
    try {
      if (p.id === 'claude') {
        const r = await claude(p, system, prompt, schema);
        recordUsage(pid, 'claude', r.tokens);
        return parseJson(r.text);
      }
      const j = await compat(p, [
        { role: 'system', content: 'Chỉ trả về một object JSON hợp lệ theo đúng cấu trúc (mô tả kiểu OpenAPI): ' + JSON.stringify(schema) },
        { role: 'user', content: prompt }], { json: true });
      recordUsage(pid, p.id, j.usage?.total_tokens);
      return parseJson(j.choices[0].message.content);
    } catch (e) { console.error(`${p.id} lỗi → thử tiếp:`, (e as Error).message); }
  }
  return gemini([{ text: prompt }], schema, {}, pid);
}

// ---- Trợ lý AI cho sinh viên ----
// Rút gọn khoảng trắng & đệm bảng trước khi gửi AI (bớt ~10–20% token, không đổi nội dung).
const compact = (t: string) => t.replace(/[ \t]+/g, ' ').replace(/ ?\| ?/g, '|').replace(/\n{3,}/g, '\n\n').trim();
const reportText = (sections: Section[]) => compact(sections.map((s) =>
  `### [${s.id}] ${s.title} (${s.kind})\n${s.markdown}${s.mermaid ? '\n```mermaid\n' + s.mermaid + '\n```' : ''}`).join('\n\n'));
// Dàn ý ngắn (tiêu đề + vài câu đầu) cho việc không cần cả bài, VD quét từng video.
const reportOutline = (sections: Section[]) => compact(sections.map((s) => `- ${s.title}: ${s.markdown.replace(/\s+/g, ' ').slice(0, 200)}`).join('\n'));

// Giảng viên ảo: đọc báo cáo, ghim nhận xét vào từng phần trước khi sinh viên gửi link thật.
async function aiPreReview(pid: string, sections: Section[]) {
  if (!sections.length) throw new HttpError(400, 'Chưa có báo cáo để AI đọc');
  const r = await aiText(pid,
    'Bạn là giảng viên hướng dẫn đồ án tốt nghiệp ngành CNTT, khó tính nhưng mang tính xây dựng. ' +
    'Đọc báo cáo dưới đây (mỗi phần có id trong ngoặc vuông) và chỉ ra những điểm giảng viên thật sẽ hỏi hoặc trừ điểm: ' +
    'scope mơ hồ, thiếu kế hoạch/timeline, sơ đồ không khớp mô tả, thiếu giao thức/bảo mật, thiếu kết quả đo được, mâu thuẫn. ' +
    'Mỗi nhận xét ngắn gọn, cụ thể, có gợi ý sửa, tiếng Việt. Tối đa 12 nhận xét, quan trọng nhất trước.\n\n' + reportText(sections) ,
  { type: 'OBJECT', required: ['comments'], properties: { comments: { type: 'ARRAY', items: {
    type: 'OBJECT', required: ['sectionId', 'comment'],
    properties: { sectionId: { type: 'STRING' }, comment: { type: 'STRING' } } } } } });
  const ids = new Set(sections.map((s) => s.id));
  q("DELETE FROM comments WHERE project_id = ? AND role = 'ai'").run(pid); // chạy lại thì thay bộ nhận xét cũ
  const ins = q("INSERT INTO comments (id, project_id, author, role, body, anchor, created) VALUES (?, ?, 'Trợ lý AI', 'ai', ?, ?, ?)");
  let n = 0;
  for (const c of r.comments || []) {
    const anchor = ids.has(c.sectionId) ? { type: 'section', section: c.sectionId } : { type: 'general' };
    ins.run(id(), pid, str(c.comment, 5000), JSON.stringify(anchor), Date.now() + n++);
  }
  return { count: n };
}

// Gom góp ý chưa sửa của giảng viên thành danh sách việc cần làm, việc quan trọng trước.
async function aiTodo(pid: string, sections: Section[]) {
  const open = q("SELECT id, body, anchor FROM comments WHERE project_id = ? AND role = 'lecturer' AND resolved = 0").all(pid) as any[];
  if (!open.length) return { items: [] };
  const title = (sid: string) => sections.find((s) => s.id === sid)?.title || '';
  const list = open.map((c) => {
    const a = JSON.parse(c.anchor);
    const where = a.type === 'video' ? `video tại giây ${Math.round(a.t)}` : a.type === 'text' ? `đoạn "${a.quote}" trong phần ${title(a.section)}`
      : a.type === 'section' ? `phần ${title(a.section)}` : 'chung';
    return `- [${c.id}] (${where}) ${c.body}`;
  }).join('\n');
  const r = await aiText(pid,
    'Đây là các góp ý giảng viên cho đồ án của sinh viên (mỗi dòng có id trong ngoặc vuông). ' +
    'Gom các góp ý trùng ý, chuyển thành danh sách việc cần làm rõ ràng, có thể hành động ngay, tiếng Việt, ' +
    'sắp xếp việc quan trọng/ảnh hưởng điểm nhất lên đầu. Mỗi việc ghi các id góp ý liên quan.\n\n' + list ,
  { type: 'OBJECT', required: ['items'], properties: { items: { type: 'ARRAY', items: {
    type: 'OBJECT', required: ['task', 'priority', 'commentIds'],
    properties: { task: { type: 'STRING' }, priority: { type: 'STRING', enum: ['cao', 'trung bình', 'thấp'] },
      commentIds: { type: 'ARRAY', items: { type: 'STRING' } } } } } } });
  return { items: r.items || [] };
}

// ---- Trợ lý AI cho giảng viên ----
function projectContext(pid: string, proj: any): string {
  const videos = q('SELECT * FROM videos WHERE project_id = ? ORDER BY pos').all(pid) as any[];
  const sb = storyboard(shotsOf(proj), videos.map((v) => ({ id: v.id, coverage: JSON.parse(v.coverage) })));
  return reportText(JSON.parse(proj.sections)).slice(0, 60_000) +
    `\n\n## Video demo: ${videos.length} video, đạt ${sb.pct}% yêu cầu cảnh quay` +
    (sb.missing.length ? `; THIẾU cảnh: ${sb.missing.map((x) => x.title).join(', ')}` : '') +
    (sb.weak.length ? `; cảnh CHƯA RÕ: ${sb.weak.map((c) => `${c.shot.title} (${c.score}/100: ${c.note})`).join('; ')}` : '') +
    '\n' + videos.filter((v) => v.summary).map((v) => `### Video "${v.name}"\n${v.summary}`).join('\n\n').slice(0, 30_000);
}

// Tóm tắt cho giảng viên: tự tạo khi mở link, lưu lại, chỉ tạo lại khi bài thay đổi.
const contentHash = (pid: string, proj: any) => crypto.createHash('sha1')
  .update(proj.sections + proj.shots + JSON.stringify(q('SELECT coverage, summary FROM videos WHERE project_id = ?').all(pid))).digest('hex');

async function aiBrief(pid: string, proj: any) {
  const videos = q('SELECT 1 FROM videos WHERE project_id = ?').all(pid);
  const hash = contentHash(pid, proj);
  const cached = proj.brief ? JSON.parse(proj.brief) : null;
  if (cached?.hash === hash) return cached.data;
  if (!JSON.parse(proj.sections).length && !videos.length) return null;
  const data = await aiText(pid,
    'Bạn hỗ trợ giảng viên ngành Khoa học Máy tính review nhanh đồ án sinh viên. Đọc toàn bộ bài dưới đây và trả về, tiếng Việt, ngắn gọn:\n' +
    '- summary: 2–3 câu: đồ án làm gì, cho ai, mức độ hoàn thiện;\n- stack: các công nghệ chính (mỗi mục 1–3 từ);\n' +
    '- strengths: tối đa 4 điểm mạnh cụ thể;\n- risks: tối đa 5 điểm yếu/rủi ro giảng viên nên kiểm tra (thiếu sót, mâu thuẫn, chỗ có thể bị trừ điểm);\n' +
    '- questions: 5–8 câu hỏi phản biện sắc, bám vào nội dung bài (q) kèm lý do nên hỏi (why).\nChỉ dựa trên nội dung bài, không bịa.\n\n' +
    projectContext(pid, proj),
    { type: 'OBJECT', required: ['summary', 'stack', 'strengths', 'risks', 'questions'], properties: {
      summary: { type: 'STRING' }, stack: { type: 'ARRAY', items: { type: 'STRING' } },
      strengths: { type: 'ARRAY', items: { type: 'STRING' } }, risks: { type: 'ARRAY', items: { type: 'STRING' } },
      questions: { type: 'ARRAY', items: { type: 'OBJECT', required: ['q', 'why'], properties: { q: { type: 'STRING' }, why: { type: 'STRING' } } } } } });
  q('UPDATE projects SET brief = ? WHERE id = ?').run(JSON.stringify({ hash, data }), pid);
  return data;
}

// Gợi ý góp ý tại đúng chỗ đang ghim (đoạn văn / giây video / phần); có nháp thì viết lại cho rõ.
async function aiSuggest(pid: string, proj: any, b: any) {
  const a = cleanAnchor(b.anchor);
  const draft = str(b.text, 2000);
  const sections: Section[] = JSON.parse(proj.sections);
  let where = '';
  if (a.type === 'text' || a.type === 'section') {
    const s = sections.find((x) => x.id === a.section);
    where = `Phần "${s?.title}" của báo cáo:\n${(s?.markdown || '').slice(0, 6000)}` + (a.type === 'text' ? `\n\nGiảng viên đang bôi đen đoạn: "${a.quote}"` : '');
  } else if (a.type === 'video') {
    const v: any = q('SELECT * FROM videos WHERE id = ? AND project_id = ?').get(a.video, pid);
    const near = v ? (JSON.parse(v.coverage) as Coverage[]).filter((c) => c.start - 5 <= a.t && a.t <= c.end + 5) : [];
    const chap = v ? (JSON.parse(v.chapters) as any[]).filter((c) => c.t <= a.t).pop() : null;
    where = `Video "${v?.name}" tại giây ${Math.round(a.t)}${chap ? `, chương "${chap.title}"` : ''}.` +
      (near.length ? ` AI đã nhận xét đoạn này: ${near.map((c) => `${c.score}/100 – ${c.note}`).join('; ')}` : '') +
      (v?.summary ? `\nTóm tắt video:\n${v.summary.slice(0, 4000)}` : '');
  } else where = 'Góp ý chung cho cả đồ án.\n' + projectContext(pid, proj).slice(0, 20_000);
  return aiText(pid,
    'Bạn giúp giảng viên Khoa học Máy tính viết góp ý cho đồ án sinh viên: ngắn (1–3 câu), cụ thể, chỉ ra vấn đề và hướng sửa, giọng chuyên nghiệp, tiếng Việt. ' +
    (draft ? `Giảng viên đã viết nháp: "${draft}". Gợi ý đầu tiên là bản viết lại rõ ràng hơn của nháp (giữ nguyên ý), 2 gợi ý sau là cách diễn đạt khác hoặc bổ sung ý liên quan.`
      : 'Đưa ra 3 góp ý khác nhau đáng nói nhất tại vị trí này.') + '\n\nVị trí đang xem:\n' + where,
    { type: 'OBJECT', required: ['suggestions'], properties: { suggestions: { type: 'ARRAY', items: { type: 'STRING' } } } });
}

// Gợi ý điểm rubric kèm lý do; giảng viên quyết định cuối cùng.
async function aiRubric(pid: string, proj: any) {
  const hash = contentHash(pid, proj); // bài không đổi → dùng lại gợi ý cũ, mọi giảng viên dùng chung 1 lượt gọi
  const cached = proj.rubric_ai ? JSON.parse(proj.rubric_ai) : null;
  if (cached?.hash === hash) return cached.data;
  const r = await aiText(pid,
    'Bạn là trợ lý chấm đồ án ngành Khoa học Máy tính theo THANG ĐIỂM UK (0–100, số nguyên). Mốc: ' +
    UK_BANDS.map((b) => `${b.min}+ ${b.name}: ${b.desc}`).join(' | ') +
    '. Theo thông lệ UK, điểm trên 80 chỉ dành cho bài thực sự xuất sắc. Chấm GỢI Ý từng tiêu chí dưới đây dựa trên bài, ' +
    'kèm lý do 1–2 câu chỉ rõ bằng chứng trong bài; nghiêm túc, không cho điểm cao khi thiếu bằng chứng. overall: nhận xét chung 3–4 câu, tiếng Việt.\n' +
    RUBRIC.map((c) => `- ${c.id}: ${c.title} (${c.weight}%) — ${c.desc}`).join('\n') + '\n\n' + projectContext(pid, proj),
    { type: 'OBJECT', required: ['criteria', 'overall'], properties: {
      criteria: { type: 'ARRAY', items: { type: 'OBJECT', required: ['id', 'score', 'reason'], properties: {
        id: { type: 'STRING' }, score: { type: 'NUMBER' }, reason: { type: 'STRING' } } } },
      overall: { type: 'STRING' } } });
  const ids = new Set(RUBRIC.map((c) => c.id));
  const data = { overall: str(r.overall, 3000), criteria: (r.criteria || []).filter((c: any) => ids.has(c.id)).map((c: any) => ({
    id: c.id, score: Math.max(0, Math.min(100, Math.round(Number(c.score) || 0))), reason: str(c.reason, 600) })) };
  q('UPDATE projects SET rubric_ai = ? WHERE id = ?').run(JSON.stringify({ hash, data }), pid);
  return data;
}

// Sinh viên viết Mermaid lỗi → AI sửa dựa trên thông báo lỗi.
async function aiFixMermaid(pid: string, code: string, error: string) {
  const r = await aiText(pid,
    'Sửa đoạn mã Mermaid v11 dưới đây cho hợp lệ, GIỮ NGUYÊN ý nghĩa và nội dung tiếng Việt. Nhãn có dấu cách/ký tự đặc biệt/ngoặc phải đặt trong ngoặc kép. ' +
    'Trả về code (chỉ mã Mermaid, không bọc ```) và explain (1–2 câu tiếng Việt: lỗi gì, đã sửa gì).\n\nLỗi trình vẽ báo: ' + error.slice(0, 1000) +
    '\n\nMã:\n' + code.slice(0, 20_000),
    { type: 'OBJECT', required: ['code', 'explain'], properties: { code: { type: 'STRING' }, explain: { type: 'STRING' } } });
  return { code: String(r.code || '').replace(/^```(mermaid)?\n?|```$/g, '').trim(), explain: str(r.explain, 500) };
}

async function processReport(projectId: string, file: string) {
  const full = path.join(UPLOADS, file);
  const isPdf = file.endsWith('.pdf');
  let sections: Section[] = [], missing: Missing[] = [], status = '';
  const key = keyFor(projectId);
  try {
    if (!key) {
      if (isPdf) status = 'Chưa có khoá AI nên chưa đọc được PDF. Thêm khoá ở Tài khoản › Khoá AI rồi tải lại, hoặc tự thêm các phần.';
      else { sections = toSections(splitByHeadings(fs.readFileSync(full, 'utf8'))); status = 'Chưa có AI: đã tách theo heading (#).'; }
    } else if (isPdf && fs.statSync(full).size > MAX_INLINE_PDF) {
      status = 'PDF lớn hơn 18MB: hãy nén PDF (giảm chất lượng ảnh) rồi tải lại.';
    } else {
      const r = await extractWithGemini(full, isPdf, projectId, key);
      sections = toSections(r.sections);
      missing = toMissing(r.missing);
    }
  } catch (e) {
    console.error(e);
    if (!isPdf) sections = toSections(splitByHeadings(fs.readFileSync(full, 'utf8')));
    status = 'AI lỗi: ' + (e as Error).message;
  }
  updateProject(projectId, (p) => { p.sections = sections; p.missing = missing; }); // báo cáo mới thay toàn bộ
  setStatus(projectId, status);
}

// Vẽ thêm các sơ đồ còn thiếu dựa trên nội dung hiện tại (kể cả phần sinh viên vừa bổ sung).
async function aiDiagrams(pid: string, sections: Section[]) {
  if (!sections.length) throw new HttpError(400, 'Chưa có nội dung để vẽ sơ đồ');
  const r = await aiText(pid,
    'Đây là bài trình bày đồ án (các phần, bảng và sơ đồ hiện có). Hãy tạo THÊM các sơ đồ và bảng còn thiếu mà giảng viên cần để hiểu hệ thống ' +
    '(không lặp lại cái đã có), tối đa 6 phần mới, chỉ dựa trên thông tin có trong bài, không bịa chi tiết. ' +
    'Bảng đặt trong markdown của phần (kind phù hợp, mermaid rỗng), sơ đồ đặt trong mermaid (kind="diagram"). ' + TABLE_GUIDE + DIAGRAM_GUIDE +
    ' Nếu thiếu thông tin để vẽ đúng, đưa câu hỏi vào missing. ' + MISSING_GUIDE + '\n\n' + reportText(sections) +
    '\n\n## Tóm tắt các video demo (AI đã xem)\n' + (q("SELECT name, summary FROM videos WHERE project_id = ? AND summary != ''").all(pid) as any[])
      .map((v) => `### ${v.name}\n${v.summary}`).join('\n\n').slice(0, 40_000) ,
  SECTION_SCHEMA);
  const add = toSections(r.sections).filter((s) => s.mermaid || s.markdown.includes('|'))
    .map((s) => ({ ...s, kind: s.mermaid ? 'diagram' as const : s.kind, markdown: '*(AI tạo từ nội dung bài)*\n\n' + s.markdown }));
  updateProject(pid, (p) => { p.sections.push(...add); p.missing = mergeMissing(p.missing, toMissing(r.missing)); });
  return { count: add.length };
}

// ---- Quét video: đối chiếu với "cảnh cần quay", chia chương, tóm tắt ----
// Gemini File API (free tier): upload resumable → chờ xử lý → hỏi → xoá file.
// Mỗi dự án 1 hàng đợi, quét lần lượt từng video (đỡ đụng giới hạn free).
const GEMINI_FILES = 'https://generativelanguage.googleapis.com';
type Job = { queue: string[]; total: number; done: number; current?: { video: string; name: string; stage: string; pct: number | null } };
const jobs = new Map<string, Job>();

function enqueueVideos(pid: string, videoIds: string[]) {
  if (!keyFor(pid) || !videoIds.length) return;
  for (const v of videoIds) q("UPDATE videos SET ai_state = 'queued' WHERE id = ?").run(v);
  const job = jobs.get(pid);
  if (job) { job.queue.push(...videoIds.filter((v) => !job.queue.includes(v))); job.total = job.done + job.queue.length + (job.current ? 1 : 0); return; }
  const j: Job = { queue: [...videoIds], total: videoIds.length, done: 0 };
  jobs.set(pid, j);
  (async () => {
    while (j.queue.length) {
      const v: any = q('SELECT * FROM videos WHERE id = ? AND project_id = ?').get(j.queue.shift()!, pid);
      if (v) await analyzeVideo(pid, v, j);
      j.done++;
    }
    jobs.delete(pid);
  })();
}

function shotsOf(proj: { shots: string }): Shot[] {
  const list = JSON.parse(proj.shots || '[]');
  return list.length ? list : DEFAULT_SHOTS;
}

function uploadStream(url: string, body: Readable, size: number, onBytes: (n: number) => void): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'POST', headers: {
      'content-length': size, 'x-goog-upload-offset': '0', 'x-goog-upload-command': 'upload, finalize' } }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => (res.statusCode! < 300 ? resolve(JSON.parse(raw)) : reject(new Error('Upload video lên Gemini lỗi: ' + raw.slice(0, 300)))));
    });
    req.on('error', reject);
    let sent = 0;
    body.on('data', (c: Buffer) => onBytes((sent += c.length))).on('error', reject).pipe(req);
  });
}

async function analyzeVideo(pid: string, v: any, job: Job) {
  const cur = (job.current = { video: v.id, name: v.name, stage: 'Chuẩn bị', pct: 0 as number | null });
  q("UPDATE videos SET ai_state = 'scanning' WHERE id = ?").run(v.id);
  let geminiFile = '';
  const key = keyFor(pid); // upload và hỏi phải cùng 1 key (file thuộc project của key đó)
  try {
    // 1. Lấy luồng dữ liệu video (Drive hoặc file trên server)
    let stream: Readable, size: number, mime: string;
    if (v.file.startsWith('drive:')) {
      const fid = v.file.slice(6);
      const meta = await driveJson(`/${fid}?fields=size,mimeType`);
      const r = await fetch(`${DRIVE}/${fid}?alt=media&supportsAllDrives=true&key=${GKEY}`);
      if (!r.ok || !r.body) throw new Error('Không tải được video từ Drive');
      stream = Readable.fromWeb(r.body as any); size = Number(meta.size); mime = meta.mimeType;
    } else {
      const full = path.join(UPLOADS, v.file);
      stream = fs.createReadStream(full); size = fs.statSync(full).size; mime = TYPES[path.extname(full)] || 'video/mp4';
    }
    // 2. Upload resumable — % thật theo số byte đã gửi
    cur.stage = 'Gửi video cho AI';
    const start = await fetch(`${GEMINI_FILES}/upload/v1beta/files`, { method: 'POST', headers: {
      'x-goog-api-key': key, 'content-type': 'application/json', 'x-goog-upload-protocol': 'resumable',
      'x-goog-upload-command': 'start', 'x-goog-upload-header-content-length': String(size), 'x-goog-upload-header-content-type': mime },
      body: JSON.stringify({ file: { display_name: v.name } }) });
    const uploadUrl = start.headers.get('x-goog-upload-url');
    if (!uploadUrl) throw new Error('Gemini từ chối upload: ' + (await start.text()).slice(0, 300));
    let file = (await uploadStream(uploadUrl, stream, size, (n) => { cur.pct = Math.min(99, Math.round((n / size) * 100)); })).file;
    geminiFile = file.name;
    // 3. Chờ Gemini xử lý video (không có %, hiện dạng chờ)
    cur.stage = 'AI đang xem video'; cur.pct = null;
    for (let i = 0; file.state === 'PROCESSING' && i < 120; i++) {
      await sleep(5000);
      file = await (await fetch(`${GEMINI_FILES}/v1beta/${file.name}`, { headers: { 'x-goog-api-key': key } })).json();
    }
    if (file.state !== 'ACTIVE') throw new Error('Gemini không xử lý được video (' + file.state + ')');
    // 4. Chấm theo danh sách cảnh cần quay
    cur.stage = 'Đối chiếu yêu cầu';
    const proj: any = q('SELECT sections, shots FROM projects WHERE id = ?').get(pid);
    const shots = shotsOf(proj);
    const r = await gemini([
      { file_data: { mime_type: file.mimeType, file_uri: file.uri } },
      { text: `Đây là video demo "${v.name}" của đồ án sinh viên. Các CẢNH CẦN CÓ (id: tên — yêu cầu):\n` +
        shots.map((x) => `- ${x.id}: ${x.title} — ${x.desc}`).join('\n') + '\n\nHãy trả về:\n' +
        '1) coverage: mỗi đoạn video thể hiện một cảnh ở trên → shotId, start/end (giây), score 0–100 (rõ ràng, đầy đủ, ' +
        'có thuyết minh, thao tác trọn vẹn, không lỗi = điểm cao), note: nhận xét ngắn và nếu điểm < 60 thì nói cần quay lại thế nào. ' +
        'Bỏ qua đoạn thừa (chờ tải, thao tác lặp, lạc đề). Cảnh không có trong video thì không liệt kê.\n' +
        '2) chapters: chia video theo từng thao tác/màn hình, t là giây bắt đầu, title ngắn tiếng Việt;\n' +
        '3) summary: bảng Markdown (Thời điểm | Chức năng được demo | Kết quả quan sát | Lỗi/ghi chú) rồi 1–2 câu nhận xét;\n' +
        '4) missing: câu hỏi cho sinh viên về những gì video cho thấy nhưng báo cáo chưa giải thích. ' + MISSING_GUIDE +
        '\n\nDàn ý báo cáo:\n' + reportOutline(JSON.parse(proj.sections)).slice(0, 8000) }],
    { type: 'OBJECT', required: ['coverage', 'chapters', 'summary', 'missing'], properties: {
      coverage: { type: 'ARRAY', items: { type: 'OBJECT', required: ['shotId', 'start', 'end', 'score', 'note'], properties: {
        shotId: { type: 'STRING' }, start: { type: 'NUMBER' }, end: { type: 'NUMBER' }, score: { type: 'NUMBER' }, note: { type: 'STRING' } } } },
      chapters: { type: 'ARRAY', items: { type: 'OBJECT', required: ['t', 'title'], properties: { t: { type: 'NUMBER' }, title: { type: 'STRING' } } } },
      summary: { type: 'STRING' },
      missing: { type: 'ARRAY', items: MISSING_ITEM } } },
    { mediaResolution: 'MEDIA_RESOLUTION_LOW' }, pid, key); // độ phân giải thấp: ~1/4 token mà vẫn đọc được màn hình
    // 5. Lưu
    const ids = new Set(shots.map((x) => x.id));
    const coverage: Coverage[] = (r.coverage || []).filter((c: any) => ids.has(c.shotId)).map((c: any) => ({
      shotId: c.shotId, start: Math.max(0, Number(c.start) || 0), end: Math.max(0, Number(c.end) || 0),
      score: Math.max(0, Math.min(100, Math.round(Number(c.score) || 0))), note: str(c.note, 500) }));
    const chapters = (r.chapters || []).map((c: any) => ({ t: Math.max(0, Number(c.t) || 0), title: str(c.title, 200) }))
      .sort((a: any, b: any) => a.t - b.t);
    q("UPDATE videos SET coverage = ?, chapters = ?, summary = ?, ai_state = 'done' WHERE id = ?")
      .run(JSON.stringify(coverage), JSON.stringify(chapters), str(r.summary, 20_000), v.id);
    updateProject(pid, (p) => { p.missing = mergeMissing(p.missing, toMissing(r.missing)); });
  } catch (e) {
    console.error(e);
    q('UPDATE videos SET ai_state = ? WHERE id = ?').run('error:' + (e as Error).message.slice(0, 300), v.id);
  } finally {
    job.current = undefined;
    if (geminiFile) fetch(`${GEMINI_FILES}/v1beta/${geminiFile}`, { method: 'DELETE', headers: { 'x-goog-api-key': key } }).catch(() => {});
  }
}

// Danh sách cảnh cần quay, rút từ báo cáo (mỗi chức năng trong scope = 1 cảnh).
async function aiShots(pid: string, sections: Section[]) {
  if (!sections.length) throw new HttpError(400, 'Cần có báo cáo để AI lập danh sách cảnh quay');
  const r = await aiText(pid,
    'Từ báo cáo đồ án dưới đây, lập danh sách CẢNH CẦN QUAY cho video demo để giảng viên đánh giá được đầy đủ, theo thứ tự trình bày hợp lý: ' +
    'giới thiệu, kiến trúc, rồi từng chức năng chính trong scope (mỗi chức năng một cảnh), quản trị/dữ liệu, xử lý lỗi, kết quả. ' +
    '6–15 cảnh. title ngắn; desc nói cụ thể cần thao tác/nói gì trong cảnh đó (1–2 câu), tiếng Việt.\n\n' + reportText(sections).slice(0, 60_000) ,
  { type: 'OBJECT', required: ['shots'], properties: { shots: { type: 'ARRAY', items: {
    type: 'OBJECT', required: ['title', 'desc'], properties: { title: { type: 'STRING' }, desc: { type: 'STRING' } } } } } });
  const shots = cleanShots(r.shots);
  if (!shots.length) throw new Error('AI không lập được danh sách cảnh');
  q('UPDATE projects SET shots = ? WHERE id = ?').run(JSON.stringify(shots), pid);
  return { count: shots.length };
}

const cleanShots = (list: any): Shot[] => (Array.isArray(list) ? list : []).slice(0, 30)
  .filter((x: any) => str(x?.title, 120))
  .map((x: any) => ({ id: str(x.id, 20) || 'sh' + id(), title: str(x.title, 120), desc: str(x.desc, 500) }));

// ---- Google Drive: dán link file/folder → tự lấy video + báo cáo ----
// File phải share "Bất kỳ ai có link". Dùng API key (không cần OAuth) vì chỉ đọc file công khai.
async function driveJson(query: string) {
  const r = await fetch(`${DRIVE}${query}&supportsAllDrives=true&key=${GKEY}`);
  const j: any = await r.json();
  if (!r.ok) throw new HttpError(400, 'Drive: ' + (j.error?.message || r.status) + ' (file đã share "Bất kỳ ai có link" chưa?)');
  return j;
}

async function addFromDrive(pid: string, link: string) {
  const ref = driveRef(link);
  if (!ref) throw new HttpError(400, 'Link Google Drive không hợp lệ: ' + link.slice(0, 100));
  if (!GKEY) throw new HttpError(500, 'Server chưa cấu hình GOOGLE_API_KEY');
  const fields = 'id,name,mimeType';
  const files: { id: string; name: string; mimeType: string }[] = ref.kind === 'folder'
    ? (await driveJson(`?q=${encodeURIComponent(`'${ref.id}' in parents and trashed=false`)}` +
        `&orderBy=name&pageSize=1000&includeItemsFromAllDrives=true&fields=files(${fields})`)).files
    : [await driveJson(`/${ref.id}?fields=${fields}`)];
  let report = '';
  const added: string[] = [];
  let pos = nextPos(pid);
  for (const f of files) {
    if (f.mimeType.startsWith('video/')) {
      const vid = id();
      q('INSERT INTO videos (id, project_id, name, file, pos) VALUES (?, ?, ?, ?, ?)')
        .run(vid, pid, f.name.replace(/\.[^.]+$/, ''), 'drive:' + f.id, pos++);
      added.push(vid);
    } else if (!report && (f.mimeType === 'application/pdf' || /\.(md|txt)$/i.test(f.name))) {
      const r = await fetch(`${DRIVE}/${f.id}?alt=media&supportsAllDrives=true&key=${GKEY}`);
      if (!r.ok || !r.body) throw new HttpError(400, 'Không tải được báo cáo từ Drive: ' + f.name);
      const file = crypto.randomUUID() + (f.mimeType === 'application/pdf' ? '.pdf' : path.extname(f.name).toLowerCase());
      await pipeline(Readable.fromWeb(r.body as any), fs.createWriteStream(path.join(UPLOADS, file)));
      setReport(pid, file);
      report = f.name;
    }
  }
  enqueueVideos(pid, added); // tự quét ngay
  return { videos: added.length, report };
}

function setReport(pid: string, file: string) {
  const old = q('SELECT report FROM projects WHERE id = ?').get(pid) as { report: string | null };
  removeUpload(old.report);
  q("UPDATE projects SET report = ?, status = 'AI đang đọc báo cáo…' WHERE id = ?").run(file, pid);
  processReport(pid, file); // chạy nền, trang project tự poll status
}

const nextPos = (pid: string) =>
  (q('SELECT COALESCE(MAX(pos) + 1, 0) AS n FROM videos WHERE project_id = ?').get(pid) as { n: number }).n;

// Stream video Drive qua server (giữ Range) để <video> tua được và web đọc được giây hiện tại.
// ponytail: băng thông đi qua server; nếu VPS nghẽn thì chuyển video sang R2/S3 rồi trỏ src thẳng tới đó.
async function proxyDrive(req: IncomingMessage, res: ServerResponse, fileId: string) {
  if (!q('SELECT 1 FROM videos WHERE file = ?').get('drive:' + fileId)) return send(res, 404, { error: 'not found' });
  const ac = new AbortController();
  res.on('close', () => ac.abort()); // người xem tua/đóng tab → huỷ request lên Drive
  const up = await fetch(`${DRIVE}/${fileId}?alt=media&supportsAllDrives=true&key=${GKEY}`, {
    headers: req.headers.range ? { range: req.headers.range } : {}, signal: ac.signal });
  const headers: Record<string, string> = { 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=3600' };
  for (const h of ['content-type', 'content-length', 'content-range']) {
    const v = up.headers.get(h);
    if (v) headers[h] = v;
  }
  res.writeHead(up.status, headers);
  if (up.body) Readable.fromWeb(up.body as any).on('error', () => res.destroy()).pipe(res);
  else res.end();
}

// ---- Static + video có hỗ trợ Range ----
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.pdf': 'application/pdf', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

// ponytail: file upload phục vụ công khai theo tên UUID (không đoán được); thêm kiểm tra quyền nếu cần chặn chia sẻ link file.
function serveFile(req: IncomingMessage, res: ServerResponse, base: string, rel: string) {
  const full = path.join(base, path.normalize(rel));
  if (!full.startsWith(base + path.sep)) return send(res, 403, { error: 'forbidden' });
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, { error: 'not found' });
    const headers = { 'content-type': TYPES[path.extname(full)] || 'application/octet-stream', 'accept-ranges': 'bytes' };
    const range = parseRange(req.headers.range, st.size);
    if (range) {
      res.writeHead(206, { ...headers, 'content-range': `bytes ${range.start}-${range.end}/${st.size}`,
        'content-length': range.end - range.start + 1 });
      return fs.createReadStream(full, range).pipe(res);
    }
    res.writeHead(200, { ...headers, 'content-length': st.size });
    fs.createReadStream(full).pipe(res);
  });
}

// ---- API ----
function projectView(proj: any, role: 'owner' | 'lecturer') {
  const videos = q('SELECT * FROM videos WHERE project_id = ? ORDER BY pos').all(proj.id).map((v: any) => ({
    id: v.id, name: v.name, chapters: JSON.parse(v.chapters), summary: v.summary,
    coverage: JSON.parse(v.coverage) as Coverage[], aiState: role === 'owner' ? v.ai_state : undefined,
    src: v.file.startsWith('drive:') ? '/drive/' + v.file.slice(6) : '/uploads/' + v.file }));
  const shots = shotsOf(proj);
  const sb = storyboard(shots, videos);
  return {
    id: proj.id, title: proj.title, created: proj.created, status: proj.status, role,
    sections: JSON.parse(proj.sections),
    author: q('SELECT name, mssv FROM students WHERE mssv = ?').get(proj.owner),
    videos,
    shots,
    // Bản trình bày tự cắt + tình trạng từng cảnh; giảng viên chỉ cần phần cắt.
    story: role === 'owner' ? sb : { cuts: sb.cuts },
    job: role === 'owner' ? jobs.get(proj.id) ?? null : undefined,
    hasReport: !!proj.report,
    // Thông tin còn thiếu: khung bắt buộc (tính lại theo nội dung hiện tại) + câu hỏi AI rút ra.
    missing: role === 'owner' ? [...checklistMissing(JSON.parse(proj.sections)), ...JSON.parse(proj.missing)] : undefined,
    reviewToken: role === 'owner' ? proj.review_token : undefined,
  };
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  const p = url.pathname.split('/').filter(Boolean);
  const m = req.method;

  if (p[0] !== 'api') {
    if (p[0] === 'drive' && p[1]) return proxyDrive(req, res, p[1]);
    if (p[0] === 'uploads') return serveFile(req, res, UPLOADS, p.slice(1).join('/'));
    return serveFile(req, res, PUBLIC, p.length ? p.join('/') : 'index.html');
  }

  // --- Tài khoản sinh viên ---
  // Đăng nhập chỉ bằng MSSV — quyết định thiết kế (đơn giản cho sinh viên), không mật khẩu/OTP.
  if (p[1] === 'register' && m === 'POST') {
    const s = validateStudent(await readJson(req));
    if (typeof s === 'string') throw new HttpError(400, s);
    if (q('SELECT 1 FROM students WHERE mssv = ?').get(s.mssv)) throw new HttpError(409, 'MSSV này đã có tài khoản, hãy đăng nhập');
    q('INSERT INTO students (mssv, name, phone, created) VALUES (?, ?, ?, ?)').run(s.mssv, s.name, s.phone, Date.now());
    return send(res, 201, { mssv: s.mssv, name: s.name }, startSession(req, s.mssv));
  }
  if (p[1] === 'login' && m === 'POST') {
    const mssv = normMssv((await readJson(req)).mssv);
    const s = mssv && q('SELECT mssv, name FROM students WHERE mssv = ?').get(mssv);
    if (!s) throw new HttpError(404, 'Chưa có tài khoản với MSSV này, hãy đăng ký');
    return send(res, 200, s, startSession(req, mssv));
  }
  if (p[1] === 'logout' && m === 'POST') {
    q('DELETE FROM sessions WHERE token = ?').run(parseCookies(req.headers.cookie).sid || '');
    return send(res, 200, { ok: true }, { 'set-cookie': sessionCookie(req, '', 0) });
  }
  if (p[1] === 'me' && !p[2] && m === 'GET') {
    const me = currentStudent(req);
    if (!me) return send(res, 401, { error: 'Chưa đăng nhập' });
    const k = q('SELECT gemini_key, ai_providers FROM students WHERE mssv = ?').get(me.mssv) as any;
    // Chỉ trả 4 ký tự cuối để sinh viên nhận ra khoá, không lộ khoá.
    return send(res, 200, { ...me, gemini: k.gemini_key ? '…' + k.gemini_key.slice(-4) : '',
      providers: (JSON.parse(k.ai_providers) as ProviderCfg[]).map((p) => ({ id: p.id, name: PROVIDERS[p.id]?.name, model: p.model, key: '…' + p.key.slice(-4) })),
      presets: Object.entries(PROVIDERS).map(([id, p]) => ({ id, name: p.name, model: p.model })),
      usage: q('SELECT provider, calls, tokens FROM ai_usage WHERE mssv = ? AND day = ?').all(me.mssv, new Date().toISOString().slice(0, 10)),
      serverGemini: !!GKEY, serverText: !!GROQ_KEY });
  }
  const keyOk = (k: string) => /^[A-Za-z0-9_\-.]{20,200}$/.test(k);
  // Khoá Gemini cá nhân (bắt buộc cho PDF & video) — kiểm tra với Google trước khi lưu.
  if (p[1] === 'me' && p[2] === 'ai-key' && m === 'PUT') {
    const me = currentStudent(req);
    if (!me) throw new HttpError(401, 'Hãy đăng nhập');
    const key = str((await readJson(req)).gemini, 200);
    if (key) {
      if (!keyOk(key)) throw new HttpError(400, 'Khoá không đúng định dạng (có thể bị thừa dấu cách)');
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { headers: { 'x-goog-api-key': key } });
      if (!r.ok) throw new HttpError(400, `Google từ chối khoá này (mã ${r.status}) — kiểm tra đã sao chép đủ chưa`);
    }
    q('UPDATE students SET gemini_key = ? WHERE mssv = ?').run(key, me.mssv);
    return send(res, 200, { ok: true });
  }
  // Nhà cung cấp chữ bổ sung: thêm (kiểm tra bằng 1 lệnh gọi rất nhỏ), xoá, đổi thứ tự ưu tiên.
  if (p[1] === 'me' && p[2] === 'providers') {
    const me = currentStudent(req);
    if (!me) throw new HttpError(401, 'Hãy đăng nhập');
    const list: ProviderCfg[] = JSON.parse((q('SELECT ai_providers FROM students WHERE mssv = ?').get(me.mssv) as any).ai_providers);
    const save = () => q('UPDATE students SET ai_providers = ? WHERE mssv = ?').run(JSON.stringify(list), me.mssv);
    if (m === 'POST' && !p[3]) {
      const b = await readJson(req);
      const cfg = { id: str(b.id, 20), key: str(b.key, 200), model: str(b.model, 100) };
      if (!PROVIDERS[cfg.id]) throw new HttpError(400, 'Nhà cung cấp không hỗ trợ');
      if (!keyOk(cfg.key)) throw new HttpError(400, 'Khoá không đúng định dạng (có thể bị thừa dấu cách)');
      if (list.length >= 6) throw new HttpError(400, 'Tối đa 6 nhà cung cấp');
      if (cfg.id === 'claude') { // tra thông tin model: xác nhận khoá + tên model mà không tốn token
        try { await new Anthropic({ apiKey: cfg.key }).models.retrieve(cfg.model || PROVIDERS.claude.model); }
        catch (e) { throw new HttpError(400, 'Claude: ' + ((e as any).status === 401 ? 'khoá không hợp lệ' : (e as any).status === 404 ? 'không có model này' : (e as Error).message)); }
      } else await compat(cfg, [{ role: 'user', content: 'ping' }], { maxTokens: 8 }); // ~10 token, xác nhận khoá + tên model
      list.push(cfg);
      save();
      return send(res, 201, { ok: true });
    }
    const i = Number(p[3]);
    if (!(i >= 0 && i < list.length)) throw new HttpError(404, 'Không tìm thấy');
    if (m === 'DELETE') { list.splice(i, 1); save(); return send(res, 200, { ok: true }); }
    if (m === 'PATCH') {
      const j = i + ((await readJson(req)).move === -1 ? -1 : 1);
      if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
      save();
      return send(res, 200, { ok: true });
    }
  }

  if (p[1] !== 'projects') throw new HttpError(404, 'not found');

  // --- Danh sách / tạo dự án của chính mình ---
  if (!p[2]) {
    const me = currentStudent(req);
    if (!me) throw new HttpError(401, 'Hãy đăng nhập');
    if (m === 'GET') return send(res, 200, q(
      `SELECT p.id, p.title, p.created, p.sections, p.missing, p.report IS NOT NULL AS hasReport,
        (SELECT COUNT(*) FROM videos v WHERE v.project_id = p.id) AS videos,
        (SELECT COUNT(*) FROM comments c WHERE c.project_id = p.id) AS comments,
        (SELECT COUNT(*) FROM comments c WHERE c.project_id = p.id AND c.resolved = 0 AND c.role = 'lecturer') AS open
       FROM projects p WHERE owner = ? ORDER BY created DESC`).all(me.mssv).map(({ sections, missing, ...p }: any) => ({
        ...p, hasReport: !!p.hasReport,
        missing: checklistMissing(JSON.parse(sections)).length + JSON.parse(missing).length })));
    if (m === 'POST') {
      const title = str((await readJson(req)).title, 200);
      if (!title) throw new HttpError(400, 'Cần tên dự án');
      const pid = id();
      q('INSERT INTO projects (id, owner, title, review_token, created) VALUES (?, ?, ?, ?, ?)')
        .run(pid, me.mssv, title, token(), Date.now());
      return send(res, 201, { id: pid });
    }
  }

  const proj: any = q('SELECT * FROM projects WHERE id = ?').get(p[2]);
  const role = proj && access(req, proj);
  if (!role) throw new HttpError(404, 'Không tìm thấy dự án hoặc link review không đúng');
  const pid: string = proj.id;
  const ownerOnly = () => { if (role !== 'owner') throw new HttpError(403, 'Chỉ sinh viên chủ dự án được sửa'); };
  const sub = p[3], subId = p[4];

  // --- Dự án ---
  if (!sub) {
    if (m === 'GET') return send(res, 200, projectView(proj, role));
    ownerOnly();
    if (m === 'PATCH') {
      const title = str((await readJson(req)).title, 200);
      if (!title) throw new HttpError(400, 'Cần tên dự án');
      q('UPDATE projects SET title = ? WHERE id = ?').run(title, pid);
      return send(res, 200, { ok: true });
    }
    if (m === 'DELETE') {
      for (const v of q('SELECT file FROM videos WHERE project_id = ?').all(pid) as any[]) removeUpload(v.file);
      removeUpload(proj.report);
      q('DELETE FROM projects WHERE id = ?').run(pid);
      return send(res, 200, { ok: true });
    }
  }

  // Tạo link review mới (link cũ hết hiệu lực).
  if (sub === 'review-token' && m === 'POST') {
    ownerOnly();
    const t = token();
    q('UPDATE projects SET review_token = ? WHERE id = ?').run(t, pid);
    return send(res, 200, { reviewToken: t });
  }

  // --- Video ---
  if (sub === 'videos') {
    ownerOnly();
    if (m === 'PUT' && !subId) {
      const file = await saveUpload(req, VIDEO_EXT);
      const name = str(decodeURIComponent(String(req.headers['x-filename'] || '')), 200).replace(/\.[^.]+$/, '');
      const vid = id();
      q('INSERT INTO videos (id, project_id, name, file, pos) VALUES (?, ?, ?, ?, ?)').run(vid, pid, name, file, nextPos(pid));
      enqueueVideos(pid, [vid]); // tự quét ngay
      return send(res, 201, { id: vid });
    }
    const v: any = subId && q('SELECT * FROM videos WHERE id = ? AND project_id = ?').get(subId, pid);
    if (!v) throw new HttpError(404, 'Không tìm thấy video');
    if (m === 'PATCH') {
      const b = await readJson(req);
      if (b.name !== undefined) q('UPDATE videos SET name = ? WHERE id = ?').run(str(b.name, 200) || v.name, v.id);
      if (b.move === -1 || b.move === 1) { // đổi chỗ với video kề bên
        const other: any = q(`SELECT id, pos FROM videos WHERE project_id = ? AND pos ${b.move < 0 ? '<' : '>'} ?
                              ORDER BY pos ${b.move < 0 ? 'DESC' : 'ASC'} LIMIT 1`).get(pid, v.pos);
        if (other) {
          q('UPDATE videos SET pos = ? WHERE id = ?').run(other.pos, v.id);
          q('UPDATE videos SET pos = ? WHERE id = ?').run(v.pos, other.id);
        }
      }
      return send(res, 200, { ok: true });
    }
    if (m === 'DELETE') {
      removeUpload(v.file);
      q('DELETE FROM videos WHERE id = ?').run(v.id);
      return send(res, 200, { ok: true });
    }
  }

  if (sub === 'drive' && m === 'POST') {
    ownerOnly();
    return send(res, 200, await addFromDrive(pid, str((await readJson(req)).url, 500)));
  }

  if (sub === 'report' && m === 'PUT') {
    ownerOnly();
    setReport(pid, await saveUpload(req, REPORT_EXT));
    return send(res, 202, { ok: true });
  }

  // --- Các phần của báo cáo (scope, plan, sơ đồ...) ---
  if (sub === 'sections') {
    ownerOnly();
    const sections: Section[] = JSON.parse(proj.sections);
    const save = () => q('UPDATE projects SET sections = ? WHERE id = ?').run(JSON.stringify(sections), pid);
    const clean = (b: any, base: Section): Section => ({
      ...base,
      title: str(b.title, 200) || base.title,
      kind: KINDS.includes(b.kind) ? b.kind : base.kind,
      markdown: typeof b.markdown === 'string' ? b.markdown.slice(0, 100_000) : base.markdown,
      mermaid: typeof b.mermaid === 'string' ? b.mermaid.slice(0, 20_000) : base.mermaid,
    });
    if (m === 'POST' && !subId) {
      const s = clean(await readJson(req), { id: 's' + id(), title: 'Phần mới', kind: 'other', markdown: '', mermaid: '' });
      sections.push(s);
      save();
      return send(res, 201, s);
    }
    const i = sections.findIndex((s) => s.id === subId);
    if (i < 0) throw new HttpError(404, 'Không tìm thấy phần này');
    if (m === 'PATCH') {
      const b = await readJson(req);
      sections[i] = clean(b, sections[i]);
      const j = i + (b.move === -1 ? -1 : b.move === 1 ? 1 : 0);
      if (j !== i && j >= 0 && j < sections.length) [sections[i], sections[j]] = [sections[j], sections[i]];
      save();
      return send(res, 200, { ok: true });
    }
    if (m === 'DELETE') {
      sections.splice(i, 1);
      save();
      return send(res, 200, { ok: true });
    }
  }

  if (sub === 'ai' && m === 'POST' && ['brief', 'suggest', 'rubric'].includes(subId)) { // giảng viên (và sinh viên) dùng được
    if (subId === 'brief') return send(res, 200, { brief: await aiBrief(pid, proj) });
    if (subId === 'suggest') return send(res, 200, await aiSuggest(pid, proj, await readJson(req)));
    if (subId === 'rubric') return send(res, 200, await aiRubric(pid, proj));
  }
  if (sub === 'ai' && m === 'POST') {
    ownerOnly();
    const sections: Section[] = JSON.parse(proj.sections);
    if (subId === 'fix-mermaid') {
      const b = await readJson(req);
      return send(res, 200, await aiFixMermaid(pid, String(b.code || ''), String(b.error || '')));
    }
    if (subId === 'review') return send(res, 200, await aiPreReview(pid, sections));
    if (subId === 'todo') return send(res, 200, await aiTodo(pid, sections));
    if (subId === 'diagrams') return send(res, 200, await aiDiagrams(pid, sections));
    if (subId === 'shots') return send(res, 200, await aiShots(pid, sections));
    if (subId === 'scan') { // quét lại: 1 video (p[5]) hoặc tất cả
      if (!keyFor(pid)) throw new HttpError(400, NO_AI);
      const ids = (q('SELECT id FROM videos WHERE project_id = ? ORDER BY pos').all(pid) as any[]).map((v) => v.id)
        .filter((v) => !p[5] || v === p[5]);
      if (!ids.length) throw new HttpError(404, 'Không có video để quét');
      enqueueVideos(pid, ids);
      return send(res, 202, { ok: true });
    }
  }

  // --- Danh sách cảnh cần quay: sinh viên sửa cả danh sách một lần ---
  if (sub === 'shots' && m === 'PUT') {
    ownerOnly();
    const shots = cleanShots((await readJson(req)).shots);
    if (!shots.length) throw new HttpError(400, 'Cần ít nhất 1 cảnh');
    q('UPDATE projects SET shots = ? WHERE id = ?').run(JSON.stringify(shots), pid);
    return send(res, 200, { ok: true });
  }

  // --- Thông tin còn thiếu: sinh viên trả lời → gắn vào đúng phần ---
  if (sub === 'missing' && subId) {
    ownerOnly();
    const b = m === 'POST' ? await readJson(req) : {};
    const all = [...checklistMissing(JSON.parse(proj.sections)), ...JSON.parse(proj.missing)];
    const item = all.find((x) => x.id === subId);
    if (!item) throw new HttpError(404, 'Câu hỏi không còn');
    if (m === 'POST') {
      const answer = typeof b.answer === 'string' ? b.answer.trim().slice(0, 20_000) : '';
      if (!answer) throw new HttpError(400, 'Hãy nhập câu trả lời');
      updateProject(pid, (p) => {
        const target = p.sections.find((s) => s.kind === item.kind);
        const block = `**${item.question}**\n\n${answer}`;
        if (target) target.markdown = (target.markdown.trim() + '\n\n' + block).trim();
        else p.sections.push({ id: 's' + id(), title: KIND_TITLE[item.kind as keyof typeof KIND_TITLE] || 'Bổ sung', kind: item.kind, markdown: block, mermaid: '' });
        p.missing = p.missing.filter((x) => x.id !== item.id);
      });
      return send(res, 200, { ok: true });
    }
    if (m === 'DELETE') { // bỏ qua câu hỏi AI (câu hỏi khung chỉ hết khi có nội dung)
      updateProject(pid, (p) => { p.missing = p.missing.filter((x) => x.id !== item.id); });
      return send(res, 200, { ok: true });
    }
  }

  // --- Phiếu chấm rubric: giảng viên chấm (tự lưu nháp), bấm gửi thì sinh viên mới thấy ---
  if (sub === 'evaluations') {
    const view = (e: any) => ({ lecturer: e.lecturer, scores: JSON.parse(e.scores), notes: JSON.parse(e.notes), overall: e.overall,
      published: !!e.published, updated: e.updated, total: rubricTotal(JSON.parse(e.scores)),
      band: (() => { const t = rubricTotal(JSON.parse(e.scores)); return t === null ? null : ukBand(t); })() });
    if (m === 'GET') {
      if (role === 'owner') return send(res, 200, { rubric: RUBRIC, bands: UK_BANDS,
        list: (q('SELECT * FROM evaluations WHERE project_id = ? AND published = 1 ORDER BY updated').all(pid) as any[]).map(view) });
      const e = q('SELECT * FROM evaluations WHERE project_id = ? AND lecturer_key = ?').get(pid, lecturerKey(req));
      return send(res, 200, { rubric: RUBRIC, bands: UK_BANDS, mine: e ? view(e) : null });
    }
    if (m === 'PUT') {
      if (role !== 'lecturer') throw new HttpError(403, 'Chỉ giảng viên chấm điểm');
      const k = lecturerKey(req), b = await readJson(req);
      const lecturer = str(b.lecturer, 100);
      if (!lecturer) throw new HttpError(400, 'Hãy nhập tên giảng viên');
      const scores: Record<string, number> = {}, notes: Record<string, string> = {};
      for (const c of RUBRIC) {
        const v = Number(b.scores?.[c.id]);
        if (b.scores?.[c.id] !== '' && b.scores?.[c.id] != null && v >= 0 && v <= 100) scores[c.id] = Math.round(v);
        if (str(b.notes?.[c.id], 1000)) notes[c.id] = str(b.notes[c.id], 1000);
      }
      const published = b.published ? 1 : 0;
      if (published && rubricTotal(scores) === null) throw new HttpError(400, 'Hãy chấm đủ tất cả tiêu chí trước khi gửi');
      q(`INSERT INTO evaluations (project_id, lecturer_key, lecturer, scores, notes, overall, published, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (project_id, lecturer_key) DO UPDATE SET lecturer = excluded.lecturer, scores = excluded.scores, notes = excluded.notes,
         overall = excluded.overall, published = excluded.published, updated = excluded.updated`)
        .run(pid, k, lecturer, JSON.stringify(scores), JSON.stringify(notes), str(b.overall, 5000), published, Date.now());
      const total = rubricTotal(scores);
      return send(res, 200, { total, band: total === null ? null : ukBand(total) });
    }
  }

  // --- Góp ý: giảng viên viết/sửa/xoá góp ý của mình; sinh viên trả lời + đánh dấu đã sửa ---
  if (sub === 'comments') {
    const myKey = role === 'lecturer' ? lecturerKey(req) : '';
    if (m === 'GET' && !subId) return send(res, 200, q(
      `SELECT id, author, role, body, anchor, created, resolved, author_key FROM comments WHERE project_id = ?
       ${role === 'lecturer' ? "AND role != 'ai'" : ''} ORDER BY created`).all(pid)
      .map(({ author_key, ...c }: any) => ({ ...c, anchor: JSON.parse(c.anchor), resolved: !!c.resolved,
        mine: role === 'lecturer' ? author_key === myKey : c.role === 'student' })));
    if (m === 'POST' && !subId) {
      const b = await readJson(req);
      const body = str(b.body, 5000);
      const author = role === 'owner' ? currentStudent(req)!.name : str(b.author, 100);
      if (!body || !author) throw new HttpError(400, 'Thiếu nội dung hoặc tên');
      const cid = id();
      q('INSERT INTO comments (id, project_id, author, role, body, anchor, created, author_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(cid, pid, author, role === 'owner' ? 'student' : 'lecturer', body, JSON.stringify(cleanAnchor(b.anchor)), Date.now(), myKey);
      return send(res, 201, { id: cid });
    }
    const c: any = subId && q('SELECT * FROM comments WHERE id = ? AND project_id = ?').get(subId, pid);
    if (!c) throw new HttpError(404, 'Không tìm thấy góp ý');
    const own = role === 'lecturer' ? c.role === 'lecturer' && c.author_key === myKey : c.role === 'student';
    if (m === 'PATCH') {
      const b = await readJson(req);
      if (b.resolved !== undefined) {
        ownerOnly();
        q('UPDATE comments SET resolved = ? WHERE id = ?').run(b.resolved ? 1 : 0, c.id);
      }
      if (b.body !== undefined) {
        if (!own) throw new HttpError(403, 'Chỉ sửa được góp ý của chính mình');
        const body = str(b.body, 5000);
        if (!body) throw new HttpError(400, 'Nội dung trống');
        q('UPDATE comments SET body = ? WHERE id = ?').run(body, c.id);
      }
      return send(res, 200, { ok: true });
    }
    if (m === 'DELETE') {
      if (!own && !(role === 'owner' && c.role === 'ai')) throw new HttpError(403, 'Chỉ xoá được góp ý của chính mình');
      q('DELETE FROM comments WHERE id = ?').run(c.id);
      return send(res, 200, { ok: true });
    }
  }
  throw new HttpError(404, 'not found');
}

http.createServer((req, res) => route(req, res).catch((e) => {
  if (!(e instanceof HttpError)) console.error(e);
  if (!res.headersSent) send(res, e instanceof HttpError ? e.status : 400, { error: e.message });
})).listen(PORT, HOST, () => console.log(`Demo Review: http://${HOST}:${PORT}`));
