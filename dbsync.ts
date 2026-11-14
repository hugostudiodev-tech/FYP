// Render (gói free) không có ổ đĩa bền → sao lưu file SQLite lên GitHub Releases của 1 repo RIÊNG TƯ.
// Bản sao được nén + mã hoá AES-256-GCM (DB có SĐT và khoá AI của sinh viên) nên lộ repo cũng không đọc được.
// Dùng Release asset (không phải commit) để repo không phình theo mỗi lần lưu.
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const REPO = process.env.GITHUB_DATA_REPO || '';   // VD: hugostudiodev-tech/FYP-data (private)
const TOKEN = process.env.GITHUB_DATA_TOKEN || ''; // fine-grained token: Contents read/write cho đúng repo đó
const SECRET = process.env.DB_SECRET || '';        // chuỗi ngẫu nhiên dài; mất là không giải mã được bản sao
export const enabled = !!(REPO && TOKEN && SECRET);

const API = `https://api.github.com/repos/${REPO}`;
const HEADERS = { authorization: `Bearer ${TOKEN}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'demo-review' };
const KEY = crypto.createHash('sha256').update(SECRET).digest();

/** gzip → AES-256-GCM. Định dạng: iv(12) | tag(16) | dữ liệu. */
export function seal(plain: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const body = Buffer.concat([c.update(zlib.gzipSync(plain)), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}
export function unseal(box: Buffer): Buffer {
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, box.subarray(0, 12));
  d.setAuthTag(box.subarray(12, 28));
  return zlib.gunzipSync(Buffer.concat([d.update(box.subarray(28)), d.final()]));
}

async function gh(path: string, init: RequestInit = {}): Promise<Response> {
  const r = await fetch(path.startsWith('https://') ? path : API + path, { ...init, headers: { ...HEADERS, ...(init.headers as any) } });
  if (!r.ok && r.status !== 404) throw new Error(`GitHub ${init.method || 'GET'} ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r;
}

type Asset = { id: number; name: string };
async function release(): Promise<{ id: number; assets: Asset[] }> {
  let r = await gh('/releases/tags/db');
  if (r.status === 404) {
    r = await gh('/releases', { method: 'POST', body: JSON.stringify({ tag_name: 'db', name: 'Database (mã hoá)', body: 'Bản sao lưu tự động của Demo Review. Không xoá.' }) });
    if (!r.ok) throw new Error('Không tạo được release "db" — repo dữ liệu phải có ít nhất 1 commit (tạo kèm README).');
  }
  return r.json() as any;
}
const newest = (list: Asset[], re: RegExp) => list.filter((a) => re.test(a.name)).sort((a, b) => b.name.localeCompare(a.name, 'en', { numeric: true }));
const SNAP = /^snap-\d+\.enc$/, DAILY = /^daily-\d{4}-\d{2}-\d{2}\.enc$/;

/** Bản mới nhất, hoặc null nếu chưa có (lần chạy đầu). Lỗi mạng/khoá sai → ném lỗi để KHÔNG ghi đè bằng DB rỗng. */
export async function restore(): Promise<Buffer | null> {
  const latest = newest((await release()).assets, SNAP)[0];
  if (!latest) return null;
  const r = await gh(`/releases/assets/${latest.id}`, { headers: { accept: 'application/octet-stream' } });
  if (!r.ok) throw new Error('Không tải được bản sao lưu ' + latest.name);
  return unseal(Buffer.from(await r.arrayBuffer()));
}

/** Tải bản mới lên, giữ 3 bản gần nhất + 1 bản/ngày trong 14 ngày. */
export async function save(db: Buffer): Promise<void> {
  const rel = await release();
  const box = seal(db);
  const upload = async (name: string) => {
    const r = await fetch(`https://uploads.github.com/repos/${REPO}/releases/${rel.id}/assets?name=${name}`, {
      method: 'POST', headers: { ...HEADERS, 'content-type': 'application/octet-stream' }, body: new Uint8Array(box) });
    if (!r.ok) throw new Error(`GitHub upload ${name}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  };
  await upload(`snap-${Date.now()}.enc`);
  const day = new Date().toISOString().slice(0, 10);
  if (!rel.assets.some((a) => a.name === `daily-${day}.enc`)) await upload(`daily-${day}.enc`);
  for (const a of [...newest(rel.assets, SNAP).slice(2), ...newest(rel.assets, DAILY).slice(13)]) {
    await gh(`/releases/assets/${a.id}`, { method: 'DELETE' });
  }
}
