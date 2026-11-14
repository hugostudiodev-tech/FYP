# Demo Review — fyp.hugowishpax.studio

Web nộp và review đồ án **dành cho sinh viên ngành Khoa học Máy tính**, chỉ mở trên máy tính (điện thoại/máy tính bảng bị chặn). Sinh viên đăng video demo và báo cáo (PDF, Word, Markdown). AI (Gemini, miễn phí) tách báo cáo thành
Scope, Plan, Kiến trúc…, tự vẽ sơ đồ, xem video và hỏi những thông tin còn thiếu. Sau đó sinh viên gửi **link review** cho giảng viên.
Giảng viên mở link, dừng video hoặc bôi đen đoạn báo cáo để bình luận đúng chỗ. Sinh viên nhấn vào bình luận là nhảy tới đúng giây
hoặc đúng đoạn được nhận xét.

## Luồng sử dụng

**Sinh viên** (có tài khoản)
1. Tạo tài khoản: họ và tên, MSSV, số điện thoại. Đăng nhập chỉ cần MSSV.
2. Tạo dự án, rồi dán link **folder Google Drive** chứa video (hệ thống không lưu video), và tải báo cáo lên (PDF/Word/MD ≤ 4MB, lớn hơn thì để trong folder Drive).
3. AI tách báo cáo thành các phần, vẽ lại sơ đồ có sẵn và **tự vẽ thêm** sơ đồ còn thiếu (kiến trúc, ERD, sequence, Gantt…).
4. Hệ thống hiện **"Bài trình bày còn thiếu thông tin"**: các câu hỏi cụ thể để trả lời ngay, câu trả lời tự gắn vào đúng phần.
5. Thêm video là AI tự quét: chia chương, chấm từng cảnh cần quay, tóm tắt demo (xem mục Video bên dưới).
6. Có thể bấm "Góp ý trước khi gửi" để AI đóng vai giảng viên nhận xét trước. Nhận xét này chỉ sinh viên thấy.
7. Sao chép **link gửi giảng viên**. "Tạo link mới" làm link cũ hết hiệu lực.
8. Nhận góp ý, bấm "Việc cần làm từ góp ý" để AI gom thành danh sách việc, sửa xong thì tick "Đã sửa".

Sinh viên sửa/thêm/xoá/đổi thứ tự được mọi thứ: tên dự án, video, từng phần báo cáo, sơ đồ Mermaid.

**Giảng viên** (không cần tài khoản). Mở link lần đầu thì hướng dẫn 4 bước và bảng phím tắt tự hiện ra. Các tính năng:
- **Tóm tắt AI** tự hiện ở đầu trang: đồ án làm gì, công nghệ, điểm mạnh, rủi ro, câu hỏi phản biện (bấm **Hỏi** là đưa vào ô góp ý).
  Kết quả được lưu lại và dùng chung cho mọi giảng viên; chỉ tạo lại khi bài thay đổi.
- **Góp ý đúng chỗ**: dừng video thì ghim vào đúng giây, bôi đen đoạn báo cáo thì ghim vào đoạn đó. Nút **Gợi ý**: AI soạn 3 góp ý tại vị trí đang ghim,
  hoặc viết lại bản nháp cho rõ. Giảng viên sửa và xoá được góp ý của chính mình.
- **Chấm điểm theo thang UK (0–100)**: 6 tiêu chí có trọng số, xếp loại First / 2:1 / 2:2 / Third / Fail, có bảng mô tả từng mức.
  AI gợi ý điểm kèm lý do (chỉ điền vào ô trống), tự lưu nháp, bấm **Gửi cho sinh viên** thì sinh viên mới thấy.
- **Phím tắt**: Space phát/dừng, ← → tua 5 giây, J/K đoạn trước/sau, C viết góp ý, ? mở hướng dẫn.
- **Thông báo (toast)** tự hiện khi có góp ý mới, khi sinh viên đánh dấu đã sửa, khi có điểm.

## Chạy

```bash
npm install          # @anthropic-ai/sdk (cho nhà cung cấp Claude) + công cụ dev
cp .env.example .env # điền khoá (tuỳ chọn)
npm start            # http://localhost:3000
npm test             # test các hàm thuần trong lib.ts
npm run typecheck
```

Cần Node ≥ 23.6 (chạy `.ts` trực tiếp, `node:sqlite` có sẵn).

| Biến môi trường | Dùng cho | Thiếu thì |
|---|---|---|
| `GOOGLE_API_KEY` | Đọc Google Drive. Kiêm khoá Gemini **dự phòng** cho sinh viên chưa có khoá riêng | Không dán được link Drive; sinh viên bắt buộc dùng khoá riêng |
| `GROQ_API_KEY` | Khoá Groq dự phòng cho việc chỉ có chữ | Bỏ qua |
| `GEMINI_MODELS` | Thứ tự model Gemini | `gemini-flash-lite-latest,gemini-flash-latest` |
| `PORT`, `HOST` | Cổng và địa chỉ nghe | `3000`, `127.0.0.1` (Render: `0.0.0.0`) |
| `DRIVE_BROWSER_KEY` | Phát video thẳng từ Google (khoá giới hạn theo tên miền) | Video đi qua `/drive/<id>` của server |
| `PUBLIC_API_ORIGIN` | Địa chỉ public của API (Render) | Cùng địa chỉ với trang |
| `GITHUB_DATA_REPO`, `GITHUB_DATA_TOKEN`, `DB_SECRET` | Sao lưu DB (mã hoá) lên GitHub, tự khôi phục khi khởi động | Chỉ dùng file `data.db` trên máy |
| `MAX_REPORT_MB` | Dung lượng báo cáo tải lên | `4` (giới hạn body của Vercel) |

Khoá Drive: trong Google Cloud Console bật **Google Drive API** cho project của key. Video/folder phải share "Bất kỳ ai có đường liên kết".

## AI: mỗi sinh viên dùng khoá riêng (quy mô 30+ đồ án)

Gemini miễn phí giới hạn **theo từng Google project**: Flash-Lite khoảng 500 lượt/ngày, Flash khoảng 20 lượt/ngày, và Google đổi mức này thường xuyên.
Dùng một khoá chung cho 30 đồ án sẽ hết lượt trong vài giờ. Vì vậy mỗi sinh viên tự thêm khoá ở **Tài khoản › Cài đặt AI cá nhân**;
trang này có hướng dẫn từng bước cho mỗi nhà cung cấp, và hệ thống kiểm tra khoá ngay khi lưu.

| Nhà cung cấp | Vai trò | Chi phí |
|---|---|---|
| Google Gemini | **Bắt buộc**: đọc PDF/Word, xem video (chỉ Gemini làm được) | Miễn phí |
| Groq | Việc chỉ có chữ, rất nhanh (khoảng 1.000 lượt/ngày) | Miễn phí |
| GitHub Models | Việc chỉ có chữ, dùng tài khoản GitHub sẵn có | Miễn phí (giới hạn theo ngày) |
| Mistral | Việc chỉ có chữ | Miễn phí (gói Experiment) |
| OpenRouter | Dự phòng, chỉ dùng model `:free` | Miễn phí (khoảng 50 lượt/ngày) |
| Claude (Anthropic) | Việc chỉ có chữ, chất lượng cao; gọi qua SDK chính thức | **Trả phí** theo token |

Việc chỉ có chữ chạy lần lượt theo thứ tự sinh viên xếp, sau đó tới khoá chung của server, cuối cùng là Gemini.
Khi AI review bài của sinh viên nào thì tính vào khoá của sinh viên đó, kể cả khi giảng viên là người bấm.

**Cách hệ thống tiết kiệm token:**
- Tóm tắt cho giảng viên và gợi ý rubric được lưu theo nội dung bài. Bài không đổi thì không gọi lại, và mọi giảng viên dùng chung một lượt gọi.
- Video gửi Gemini ở độ phân giải thấp (khoảng 1/4 token). Khi quét video chỉ gửi **dàn ý** báo cáo thay vì cả bài.
- Rút gọn khoảng trắng và phần đệm bảng trước khi gửi.
- Model có "suy nghĩ" chạy ở mức thấp (`reasoning_effort` low cho gpt-oss, `effort` low cho Claude).
- Claude trả JSON theo đúng schema nên không phải gọi lại vì hỏng định dạng.
- Kiểm tra khoá chỉ tốn khoảng 10 token; riêng Claude không tốn token nào.
- Lượt và token dùng trong ngày hiện ở trang Cài đặt AI.

## Video: hướng dẫn quay → tự quét → quay bổ sung → bản trình bày tự cắt

1. Nút **Hướng dẫn quay** mở checklist: thiết bị, cài đặt, cách quay, cách đặt tên file, và **danh sách cảnh cần quay** của dự án.
   Danh sách cảnh có sẵn một mẫu chung, hoặc bấm "AI lập từ báo cáo" (mỗi chức năng trong scope là một cảnh).
2. Thêm video là hệ thống **tự quét**. Thanh tiến độ hiện `video 2/5 · Gửi video cho AI 45%`: phần trăm là số byte thật đã gửi,
   sau đó là các giai đoạn "AI đang xem video" và "Đối chiếu yêu cầu".
3. Mục **Yêu cầu video** chia cảnh thành ba nhóm: *thiếu*, *chưa rõ* (điểm < 60, kèm lời khuyên quay lại) và *đạt* (thu gọn).
   Mỗi cảnh thiếu hoặc chưa rõ có nút **Quay bổ sung**.
4. **Bản trình bày**: với mỗi cảnh, hệ thống lấy đoạn có điểm cao nhất trong mọi video, bỏ đoạn thừa, xếp theo thứ tự cảnh.
   Trình phát tự nhảy từ đoạn này sang đoạn kế, kể cả khi hai đoạn nằm ở hai video khác nhau.
   Đây là cắt ảo, không render lại file nên xong ngay và không giảm chất lượng. Đoạn quay bổ sung tốt hơn sẽ tự thay đoạn cũ.

## Thư viện phía trình duyệt (CDN, không cần cài)

| Thư viện | Dùng cho |
|---|---|
| Mermaid v11 | Mọi sơ đồ: flowchart, sequence, class, ERD, state, Gantt, mindmap, timeline, architecture, pie, xychart |
| marked + DOMPurify | Hiển thị Markdown (bảng GFM) an toàn |
| mammoth | Đọc báo cáo `.docx` ngay trên trình duyệt (tải khi cần) |

## Sơ đồ

Dùng **Mermaid v11**: một thư viện vẽ được flowchart/use case, sequence (giao thức, API), class (OOP), ERD (CSDL), state,
Gantt (kế hoạch), mindmap, timeline, architecture, pie, xychart. AI viết mã Mermaid, trình duyệt vẽ ra. AI cũng chuyển mọi thông tin
có cấu trúc thành **bảng** (công nghệ, phạm vi, kế hoạch, API, CSDL, kiểm thử…).

Trình sửa sơ đồ (⋯ › Sửa):
- Xem trước trực tiếp khi gõ, báo lỗi kèm nội dung lỗi.
- Chèn mẫu theo 9 loại sơ đồ, có bảng cú pháp và danh sách lỗi hay gặp.
- Nút **AI sửa lỗi** sửa mã dựa trên thông báo lỗi.

## Hệ thống không lưu file

- **Video**: 100% nằm trên Google Drive cá nhân của sinh viên (folder chia sẻ "Bất kỳ ai có đường liên kết"). Hệ thống chỉ đọc để phát và để AI quét.
  Dán link folder một lần; về sau bỏ video mới vào folder thì mở trang dự án là hệ thống **tự đồng bộ**: thêm video mới và tự quét.
- **Báo cáo**: đọc một lần để AI tách phần, bảng, sơ đồ; file gốc không được lưu.
- **Dữ liệu** (tài khoản, các phần báo cáo, góp ý, điểm…): một file SQLite. Trên Render được **sao lưu mã hoá lên GitHub** và tự khôi phục khi khởi động (xem `dbsync.ts`).

## Deploy miễn phí: Vercel + Render + GitHub + Cloudflare

| Thành phần | Dịch vụ (gói miễn phí) | Ghi chú |
|---|---|---|
| Giao diện (`public/`) | **Vercel** | `vercel.json` chuyển `/api/*` sang Render nên trình duyệt thấy cùng 1 tên miền (cookie đăng nhập chạy bình thường) |
| API (`server.ts`) | **Render** Web Service | Ngủ sau 15 phút không có request; GitHub Actions ping 10 phút/lần để giữ thức |
| Database | **GitHub** Releases của 1 repo riêng tư | Nén + mã hoá AES-256-GCM; lưu khi có thay đổi (tối đa 1 lần/phút) và khi Render tắt server; giữ 3 bản mới nhất + 14 bản theo ngày |
| Video | **Google Drive** của sinh viên | Hệ thống không lưu |
| Tên miền | **Cloudflare** DNS | `fyp.hugowishpax.studio` → Vercel |

### Bước 1. Repo lưu dữ liệu (GitHub, khoảng 3 phút)
1. Tạo repo mới **Private** tên `FYP-data`, tích **Add a README file** (cần ít nhất 1 commit).
2. Tạo token: GitHub › Settings › Developer settings › **Fine-grained tokens** › Generate new token
   - Repository access: **Only select repositories** → `FYP-data`
   - Permissions › Repository permissions › **Contents: Read and write**
   - Sao chép token (bắt đầu bằng `github_pat_`). Đây là `GITHUB_DATA_TOKEN`; `GITHUB_DATA_REPO` = `tên-tài-khoản/FYP-data`.
3. Tạo `DB_SECRET` (chuỗi ngẫu nhiên). Trên Mac: `openssl rand -base64 48`.
   **Cất vào trình quản lý mật khẩu**: mất chuỗi này thì không giải mã được bản sao lưu.

### Bước 2. Khoá Google Drive (Google Cloud, khoảng 5 phút)
1. [console.cloud.google.com](https://console.cloud.google.com) › tạo hoặc chọn project › **APIs & Services › Library** › bật **Google Drive API**.
2. **Credentials › Create credentials › API key** → `GOOGLE_API_KEY`. Bấm Edit key › API restrictions › chỉ chọn **Google Drive API**.
3. (Tuỳ chọn, nên làm) Tạo khoá thứ hai → `DRIVE_BROWSER_KEY`:
   - Application restrictions › **Websites**: `https://fyp.hugowishpax.studio/*`
   - API restrictions: **Google Drive API**
   - Có khoá này thì video phát thẳng từ Google, không tốn băng thông Render (gói free giới hạn 100 GB/tháng).

### Bước 3. API trên Render (khoảng 5 phút)
1. [render.com](https://render.com) › đăng nhập bằng GitHub › **New › Blueprint** › chọn repo `FYP`. Render đọc `render.yaml`.
2. Điền các biến được hỏi: `DB_SECRET`, `GITHUB_DATA_REPO`, `GITHUB_DATA_TOKEN`, `GOOGLE_API_KEY`, `DRIVE_BROWSER_KEY` (tuỳ chọn), `GROQ_API_KEY` (tuỳ chọn), rồi bấm **Apply**.
3. Đợi deploy xong, mở `https://fyp-api.onrender.com/api/health`. Phải thấy `{"ok":true}`.
   Tab Logs có dòng *"Chưa có bản sao lưu — tạo DB mới"* (lần đầu).
4. Nếu Render đặt địa chỉ khác `fyp-api.onrender.com` (do tên đã có người dùng), sửa 3 chỗ:
   - Biến `PUBLIC_API_ORIGIN` trên Render
   - Phần `destination` trong `vercel.json`
   - Biến Actions `API_URL` của repo `FYP` (Settings › Secrets and variables › Actions › Variables)

### Bước 4. Giao diện trên Vercel (khoảng 3 phút)
1. [vercel.com](https://vercel.com) › đăng nhập bằng GitHub › **Add New › Project** › Import `FYP`.
2. Framework Preset: **Other**, giữ nguyên các mục khác (đã có `vercel.json`) › **Deploy**.
3. Project › **Settings › Domains** › thêm `fyp.hugowishpax.studio`. Vercel hiện bản ghi DNS cần tạo (thường là CNAME). Giữ trang này để dùng ở Bước 5.

### Bước 5. Gắn tên miền trên Cloudflare (khoảng 2 phút)
dash.cloudflare.com › `hugowishpax.studio` › **DNS › Records › Add record**:

| Type | Name | Target | Proxy status |
|---|---|---|---|
| CNAME | `fyp` | giá trị Vercel hiện ở Bước 4 (VD: `cname.vercel-dns.com`) | **DNS only (mây xám)** |

Quay lại Vercel › Domains, đợi hiện **Valid Configuration**. Vercel tự cấp HTTPS.

### Bước 6. Giữ server thức
Repo `FYP` › tab **Actions** › bật workflow **keep-alive** (bấm *Run workflow* để thử). Ping 10 phút/lần. GitHub tự tắt lịch này nếu repo không có commit trong 60 ngày; khi đó vào bật lại.

### Kiểm tra sau khi deploy
- [ ] `https://fyp.hugowishpax.studio` mở được, đăng ký được tài khoản sinh viên
- [ ] Tạo dự án, dán link folder Drive có video, thấy video phát và tua được
- [ ] Repo `FYP-data` › Releases › `db` có file `snap-….enc` sau khoảng 1 phút
- [ ] Render › **Manual Deploy › Restart**, đăng nhập lại: dữ liệu vẫn còn
- [ ] Mở trên điện thoại: thấy màn hình "Vui lòng mở trên máy tính"

### Cập nhật code
`git push` lên `main` thì Vercel và Render **tự deploy lại**. Trước khi tắt, Render gửi tín hiệu dừng; server lưu DB lên GitHub rồi mới tắt, và bản mới tự khôi phục khi khởi động.

### Giới hạn của gói miễn phí
| Dịch vụ | Giới hạn | Ảnh hưởng |
|---|---|---|
| Render free | 512 MB RAM, ngủ sau 15 phút, 750 giờ/tháng (đủ chạy 1 service cả tháng) | Có keep-alive thì gần như không ngủ |
| Vercel Hobby | Dùng cá nhân/phi thương mại; body request ≤ ~4,5 MB | Báo cáo tải lên ≤ 4 MB, lớn hơn thì để trên Drive |
| GitHub Releases | Mỗi file ≤ 2 GB | DB chỉ vài MB |
| Gemini free | Theo khoá của từng sinh viên | Xem mục AI |

### Xử lý lỗi
| Hiện tượng | Kiểm tra |
|---|---|
| Trang mở được nhưng mọi thao tác báo lỗi | `https://fyp-api.onrender.com/api/health`; Render › Logs |
| Render log: *"Không tạo được release db"* | Repo `FYP-data` chưa có commit nào: tạo README |
| Render log: lỗi GitHub 401/403 | Token sai hoặc thiếu quyền Contents: Read and write |
| Render log: lỗi giải mã khi khởi động | `DB_SECRET` khác lúc lưu: đặt lại đúng chuỗi cũ |
| Video không phát | Folder Drive chưa chia sẻ "Bất kỳ ai có đường liên kết"; hoặc `DRIVE_BROWSER_KEY` chưa cho phép đúng tên miền |
| Domain chưa nhận | Bản ghi `fyp` đang bật proxy (mây cam): chuyển sang DNS only |

## Cấu trúc

- [server.ts](server.ts): HTTP API, SQLite, tài khoản, phân quyền chủ dự án / link review, Drive, AI nhiều nhà cung cấp, phiếu chấm
- [dbsync.ts](dbsync.ts): sao lưu và khôi phục DB mã hoá qua GitHub Releases; test ở [dbsync.test.ts](dbsync.test.ts)
- [vercel.json](vercel.json), [render.yaml](render.yaml), [.github/workflows/keepalive.yml](.github/workflows/keepalive.yml): cấu hình deploy
- [lib.ts](lib.ts): kiểu dữ liệu, rubric & thang UK, bản trình bày tự cắt, hàm thuần; test ở [lib.test.ts](lib.test.ts)
- [public/ui.js](public/ui.js): icon, toast, menu, hộp xác nhận, chặn thiết bị di động
- [public/index.html](public/index.html): đăng nhập/đăng ký, danh sách dự án của tôi
- [public/project.html](public/project.html), [public/project.js](public/project.js): trang dự án (chế độ sinh viên và giảng viên)

## Chưa làm (cố ý)

- Đăng nhập chỉ bằng MSSV là quyết định thiết kế: đồ án cần đơn giản, không dùng mật khẩu hay OTP.
- Realtime: bình luận đang tự cập nhật mỗi 10 giây.
