# buzz-tunnel

Công cụ nhỏ để **chia sẻ một community Buzz chạy local** cho người khác tham gia qua internet,
mà không làm hỏng cơ chế xác thực của relay.

Buzz ([`xyz.block.buzz.app`](https://buzz.block.xyz)) chạy một relay ngay trên máy bạn
(`127.0.0.1:28273`). Relay này **không có sẵn tính năng tunnel**, nên mặc định chỉ máy bạn
truy cập được. Repo này thêm một **reverse proxy giữ nguyên Host** + **Tailscale Funnel** để
người ở xa join được community.

---

## 1. Luồng kết nối

```
Người join (ở xa)
   │  wss://dukick-1.tailc0eb7b.ts.net:10000  + API token
   ▼
Tailscale Funnel (:10000, công khai, TLS)
   ▼
buzz-host-proxy.js   (127.0.0.1:28280)   ← pass-through, GIỮ NGUYÊN Host
   ▼
Buzz relay           (127.0.0.1:28273)   ← chạy trong WSL (wslrelay.exe)
   ▼
Community của bạn  → relay trả về NIP-42 ["AUTH", <challenge>]
                     client ký challenge bằng API token → vào được
```

**Điểm mấu chốt:** relay định tuyến mỗi community theo **Host header** của request
(DB `communities.host` là UNIQUE). Community được đăng ký dưới đúng hostname của Funnel
(ví dụ `node.tailnet.ts.net:10000`). Vì vậy proxy **tuyệt đối không được sửa Host** — nếu
rewrite, relay sẽ báo `relay: no community is configured for this host`, và chữ ký
NIP-98/NIP-42 cũng hỏng (URL client ký phải khớp đúng URL thật được kết nối).

---

## 2. Dành cho người muốn JOIN (đơn giản nhất)

1. Mở app Buzz.
2. Vào **Edit Community** (hoặc Add/Join Community).
3. Điền 2 trường do chủ community gửi cho bạn:

   | Trường | Giá trị |
   |--------|---------|
   | **Relay URL** | `wss://dukick-1.tailc0eb7b.ts.net:10000` |
   | **API Token** | `buzz_...` |

4. Lưu lại là xong. Nếu bạn ở cùng Tailnet với chủ community, có thể dùng URL nội bộ
   `wss://dukick-1.tailc0eb7b.ts.net:9443` (không cần Funnel công khai).

---

## 3. Dành cho người muốn TỰ DỰNG (làm chủ community)

### Yêu cầu
- App Buzz desktop đang chạy với một community local.
- [Node.js](https://nodejs.org) (chỉ cần `node`, không cần cài gói nào thêm — proxy dùng
  module `http` có sẵn).
- [Tailscale](https://tailscale.com) đã đăng nhập, và tài khoản đã bật **Funnel**
  (trong Admin console → Access controls / Funnel).

### Bước 1 — Chạy proxy pass-through
```powershell
node "C:\Users\<bạn>\buzz-tunnel\buzz-host-proxy.js"
```
Proxy lắng nghe `127.0.0.1:28280` và forward sang relay `127.0.0.1:28273`, **giữ nguyên
Host header** (có xử lý cả WebSocket upgrade).

### Bước 2 — Mở Tailscale Serve / Funnel trỏ vào proxy
```powershell
# Công khai ra internet (port Funnel cho phép: 443 / 8443 / 10000):
tailscale funnel --bg --https=10000 http://127.0.0.1:28280

# Hoặc chỉ trong tailnet của bạn (không công khai):
tailscale serve --bg --https=9443 http://127.0.0.1:28280
```
Kiểm tra:
```powershell
tailscale funnel status
tailscale serve status
```

### Bước 3 — Đăng ký community dưới đúng hostname Funnel
Trong app Buzz, đặt **Relay URL** của community thành chính URL công khai
`wss://dukick-1.tailc0eb7b.ts.net:10000`. Relay sẽ lưu community dưới host đó — khớp với
Host mà client ở xa gửi tới (vì proxy không rewrite).

### Bước 4 — Tự khởi động cùng Windows (tùy chọn)
Copy `start-proxy-hidden.vbs` vào thư mục Startup để proxy chạy ẩn khi đăng nhập:
```
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\BuzzHostProxy.vbs
```
Nội dung VBS chạy `node buzz-host-proxy.js` với cửa sổ ẩn (style `0`), không cần quyền admin.

> Sửa đường dẫn `node.exe` và `buzz-host-proxy.js` trong file `.vbs` cho khớp máy bạn.

---

## 4. Các file trong repo

| File | Vai trò |
|------|---------|
| `buzz-host-proxy.js` | Reverse proxy pass-through `:28280 → :28273`, giữ nguyên Host, hỗ trợ WebSocket upgrade. |
| `start-proxy-hidden.vbs` | Chạy proxy bằng Node ở chế độ ẩn khi đăng nhập Windows. |
| `communities-backup.csv` | Backup bảng `communities` của relay (tham khảo; cột `signing_key` để trống, không chứa bí mật). |

---

## 5. Khắc phục sự cố

| Triệu chứng | Nguyên nhân / cách xử lý |
|-------------|--------------------------|
| `relay: no community is configured for this host` | Host không khớp. Đừng rewrite Host trong proxy; đảm bảo Relay URL của community trùng đúng hostname Funnel bạn đưa cho người join. |
| Người join báo không kết nối được | Kiểm tra `tailscale funnel status` còn `Funnel on` không; proxy (`:28280`) và relay (`:28273`) còn chạy không. |
| Kết nối mở rồi rớt ngay | Sai API token, hoặc client không ký được NIP-42 challenge. Gửi lại đúng token `buzz_...`. |
| Port Funnel bị từ chối | Funnel chỉ cho `443 / 8443 / 10000`. Nếu 443/8443 đã bận, dùng `10000`. |

---

## 6. Vì sao là "pass-through" chứ không "rewrite"?

Phiên bản đầu từng ép Host về `127.0.0.1:28273`. Cách đó **sai** vì:
- Relay tra community theo Host → community thật ra được đăng ký dưới hostname Funnel.
- Buzz dùng Nostr NIP-98/NIP-42: client ký vào đúng URL nó kết nối tới. Nếu proxy đổi Host,
  chữ ký không khớp và relay từ chối.

Nên proxy chỉ việc **forward nguyên trạng** — hostname Funnel chảy thẳng tới relay và mọi thứ khớp.
