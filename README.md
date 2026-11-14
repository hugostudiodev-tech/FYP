# Demo Review — fyp.hugowishpax.studio

Web nộp và review đồ án **dành cho sinh viên ngành Khoa học Máy tính**, chỉ mở trên máy tính (điện thoại/máy tính bảng bị chặn). Sinh viên đăng video demo và báo cáo (PDF, Word, Markdown). AI (Gemini, miễn phí) tách báo cáo thành
Scope, Plan, Kiến trúc…, tự vẽ sơ đồ, xem video và hỏi những thông tin còn thiếu. Sau đó sinh viên gửi **link review** cho giảng viên.
Giảng viên mở link, dừng video hoặc bôi đen đoạn báo cáo để bình luận đúng chỗ. Sinh viên nhấn vào bình luận là nhảy tới đúng giây
hoặc đúng đoạn được nhận xét.

## Luồng sử dụng

**Sinh viên** (có tài khoản)
1. Tạo tài khoản: họ và tên, MSSV, số điện thoại. Đăng nhập chỉ cần MSSV.
2. Tạo dự án, rồi thêm video (dán link Google Drive file/folder hoặc upload) và báo cáo (.pdf / .md / .txt).
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
| `PORT`, `HOST` | Cổng và địa chỉ nghe | `3000`, `127.0.0.1` (chỉ nội bộ, Caddy đứng trước) |

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

## Video trên Google Drive

Khung xem trước nhúng từ Drive không cho web biết video đang ở giây nào. Vì vậy server lấy video qua Drive API và phát trong trình phát
của web (vẫn tua được). Server chỉ phát lại những file đã được đăng trong một dự án.
Lưu ý: dung lượng video đi qua server, và Drive có thể tạm chặn file bị xem quá nhiều. Khi đó chuyển video sang Cloudflare R2 / S3.

## Deploy lên fyp.hugowishpax.studio

Cần một máy chạy Node liên tục và có ổ đĩa (SQLite và file upload nằm trên đĩa). Vì vậy dùng **VPS**, không dùng hosting tĩnh hay serverless.

### 1. Thuê VPS
- Ubuntu 24.04, tối thiểu 1 vCPU, 2 GB RAM, 40 GB SSD, có IPv4 công khai (khoảng 5–6$/tháng ở Hetzner, Vultr, DigitalOcean…).
- Nếu sinh viên tải video trực tiếp lên server (không qua Drive), chọn ổ đĩa lớn hơn: mỗi video demo khoảng 50–300 MB.

### 2. Gắn tên miền
Vào trang quản lý DNS của `hugowishpax.studio` và thêm bản ghi:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `fyp` | IP của VPS | Auto |

- Dùng **Cloudflare**: để bản ghi này ở chế độ **DNS only (mây xám)**. Bật proxy (mây cam) thì gói miễn phí chặn upload trên 100 MB và cắt kết nối sau 100 giây, nên tải video sẽ lỗi.
- Kiểm tra: `dig +short fyp.hugowishpax.studio` phải trả về đúng IP VPS (thường mất vài phút).

### 3. Cài đặt trên VPS

**Cách nhanh (khuyên dùng):** SSH vào VPS bằng root và chạy một lệnh. Lệnh này tự cài mọi thứ ở dưới, và chạy lại lần nữa là cập nhật lên code mới:
```bash
curl -fsSL https://raw.githubusercontent.com/hugostudiodev-tech/FYP/main/deploy/setup.sh | bash
```

**Cách làm tay** (giống hệt những gì script làm):
```bash
ssh root@IP_VPS

# Cập nhật hệ thống + tường lửa (chỉ mở SSH, HTTP, HTTPS)
apt update && apt upgrade -y
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable

# Node.js (cần >= 23.6) và git
curl -fsSL https://deb.nodesource.com/setup_current.x | bash -
apt install -y nodejs git
node -v

# Caddy (reverse proxy + HTTPS tự động)
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

# User riêng để chạy app (không chạy bằng root)
adduser --system --group --home /opt/fyp fyp
git clone https://github.com/hugostudiodev-tech/FYP.git /opt/fyp
chown -R fyp:fyp /opt/fyp
cd /opt/fyp && sudo -u fyp npm ci --omit=dev

# Cấu hình (khoá API chung là tuỳ chọn, xem bảng biến môi trường ở trên)
sudo -u fyp cp .env.example .env && nano .env && chmod 600 .env

# Chạy nền + tự khởi động lại
cp deploy/fyp.service /etc/systemd/system/fyp.service
systemctl daemon-reload && systemctl enable --now fyp
systemctl status fyp            # phải thấy "active (running)"

# HTTPS cho tên miền
cp deploy/Caddyfile /etc/caddy/Caddyfile
systemctl reload caddy
```
Mở **https://fyp.hugowishpax.studio**. Lần đầu Caddy xin chứng chỉ mất khoảng 10–30 giây.

### 4. Cập nhật phiên bản mới
```bash
cd /opt/fyp && sudo -u fyp git pull && sudo -u fyp npm ci --omit=dev && systemctl restart fyp
```

### 5. Sao lưu hằng ngày (dữ liệu chỉ nằm ở `data.db` và `uploads/`)
```bash
mkdir -p /root/backup
crontab -e   # thêm dòng dưới: 3 giờ sáng mỗi ngày, giữ 14 bản gần nhất
0 3 * * * cd /opt/fyp && node -e "new (require('node:sqlite').DatabaseSync)('data.db').exec(\"VACUUM INTO '/root/backup/data-$(date +\%F).db'\")" && tar czf /root/backup/uploads-$(date +\%F).tgz uploads && find /root/backup -mtime +14 -delete
```

### 6. Theo dõi và xử lý lỗi
| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Không vào được, lỗi chứng chỉ | DNS chưa trỏ đúng, hoặc Cloudflare đang bật proxy | `dig +short fyp.hugowishpax.studio`; chuyển sang DNS only |
| 502 Bad Gateway | App không chạy | `journalctl -u fyp -n 50` để xem lỗi, `systemctl restart fyp` |
| 413 khi tải video | Đi qua proxy Cloudflare | Chuyển DNS only, hoặc dùng link Google Drive |
| Xem log trực tiếp | | `journalctl -u fyp -f` |

App chỉ nghe ở `127.0.0.1:3000`; mọi truy cập từ ngoài phải đi qua Caddy (HTTPS).
Caddy gửi kèm `X-Forwarded-Proto: https` nên cookie đăng nhập tự bật cờ `Secure`.

## Cấu trúc

- [server.ts](server.ts): HTTP API, SQLite, tài khoản, phân quyền chủ dự án / link review, Drive, AI nhiều nhà cung cấp, phiếu chấm
- [lib.ts](lib.ts): kiểu dữ liệu, rubric & thang UK, bản trình bày tự cắt, hàm thuần; test ở [lib.test.ts](lib.test.ts)
- [public/ui.js](public/ui.js): icon, toast, menu, hộp xác nhận, chặn thiết bị di động
- [public/index.html](public/index.html): đăng nhập/đăng ký, danh sách dự án của tôi
- [public/project.html](public/project.html), [public/project.js](public/project.js): trang dự án (chế độ sinh viên và giảng viên)

## Chưa làm (cố ý)

- Đăng nhập chỉ bằng MSSV là quyết định thiết kế: đồ án cần đơn giản, không dùng mật khẩu hay OTP.
- Realtime: bình luận đang tự cập nhật mỗi 10 giây.
