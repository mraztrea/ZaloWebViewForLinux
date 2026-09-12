# Kế hoạch phase 5 — Manager và nghiệm thu đầu cuối

> Dành cho agent triển khai sau này: dùng `superpowers:executing-plans`, thực hiện từng đầu việc và kiểm tra trước khi đánh dấu. Đợt hiện tại chỉ biên soạn tài liệu.

**Mục tiêu:** hoàn thiện Manager đủ API/GUI và bàn giao nghiệm thu đầu cuối có bằng chứng.

**Kiến trúc:** renderer local gọi bridge hẹp; main tái sử dụng ProfileManager, socket và desktop service. Runner vẫn độc lập, giữ snapshot cấu hình đến lần khởi động tiếp theo.

**Công nghệ:** Node.js `>= 22.0.0`, Electron `>= 44.3.0`, TypeScript strict, HTML/CSS thuần, esbuild, Vitest.

**Đặc tả:** [spec.md](spec.md). **Ràng buộc toàn cục:** [quy tắc chung](../README.md). Phụ thuộc phase 4 bàn giao service sync/remove và đường launcher hoạt động; chưa đủ bằng chứng nền tảng thì giữ phần nghiệm thu tương ứng chưa đạt.

## P5-T1 — Bridge và hợp đồng status (P5-01, P5-02, P5-04)

Dự kiến tạo: `src/preload/manager-preload.ts`, `src/main/manager-handlers.ts`, `tests/manager.test.ts`. File đã có cần nối sau này: `src/main/index.ts`, `src/shared/types.ts`, `scripts/build.mjs`.

- [ ] Định nghĩa payload/result đúng bảng API trong spec; dùng `Profile`, `XPathEvaluationResult`, `RunnerStatusData` và `ShortcutSyncResult`, không tạo bộ type profile song song.
- [ ] Viết test handler: sender website/iframe/local URL sai, null/array/thừa trường nguy hiểm bị từ chối; tên và boolean hợp lệ được chấp nhận. Expected: không gọi storage/socket khi validation lỗi.
- [ ] Tạo bridge chỉ expose từng API; nối `createManagerWindow` với preload riêng và thêm bundle build. Test smoke Manager sandbox không lỗi `require`/`exports` và không có bridge Manager trên website.
- [ ] Theo R03, bổ sung revision snapshot và trạng thái tải/lỗi từ runner để `getRunnerStatus`/`restartRequired` có dữ liệu thật; giữ unknown khi socket lỗi.
- [ ] Chạy `npm test -- tests/manager.test.ts tests/runner-control.test.ts tests/build.test.ts`; `npm run typecheck` và `npm run build`.

Đầu ra: mọi tên bridge có handler thành công/lỗi; trạng thái “đã yêu cầu mở” khác “runner sẵn sàng”.

## P5-T2 — Lưu, launch, shortcut và xóa an toàn (P5-03 đến P5-05, P5-07, P5-08)

File: `src/main/manager-handlers.ts`, `src/main/profile-manager.ts`, `src/main/runner-control.ts`, `src/main/desktop-service.ts`; test `tests/manager.test.ts`, `tests/profile-manager.test.ts`.

- [ ] Kiểm tra create/update whitelist; giữ ID/createdAt/userAgent và mọi checkbox false. Save registry xong gọi sync shortcut, trả lỗi từng phần; test I/O lỗi và retry không nhân đôi profile.
- [ ] Launch bằng argument array, tách process và xử lý spawn error; dùng đường cài phase 4. Test đóng Manager không đóng runner và mở lặp restore đúng profile.
- [ ] Test delete khi status unknown, shutdown ACK nhưng PID còn sống, timeout, entry gỡ lỗi, registry ghi lỗi. Chỉ xóa registry sau xác nhận dừng và gỡ entry thành công; lỗi từng bước phải được phản ánh như spec.
- [ ] Theo R04, tạo profile không tái sử dụng ID có session giữ lại; thêm hành động xóa session riêng với xác nhận native, validate mục tiêu và runner đã dừng. Test hủy xác nhận, path traversal và giữ dữ liệu profile khác.
- [ ] Chạy `npm test -- tests/manager.test.ts tests/profile-manager.test.ts tests/runner-control.test.ts tests/desktop-service.test.ts`.

Đầu ra: CRUD và lifecycle có kết quả đủ để UI giữ form, báo partial failure và hướng dẫn retry.

## P5-T3 — Icon có giới hạn (P5-09)

Dự kiến tạo: `src/main/icon-fetcher.ts`, `tests/icon-fetcher.test.ts`; nối handlers chọn/tải icon, dùng thư mục XDG icon hiện có.

- [ ] Test HTTP(S), redirect đổi protocol, redirect thứ 6, timeout 5000 ms, stream vượt 2 MiB dù header nhỏ/thiếu, ảnh vượt 1024×1024, ảnh hỏng và file không tồn tại. Expected: fallback PNG, không làm hỏng form và không gửi cookie runner.
- [ ] Dùng fetch/AbortController hiện có, đếm byte thực, validate từng redirect; decode và chuẩn hóa PNG bằng Electron trước khi lưu. Dialog chọn file đi qua cùng kiểm tra ảnh; SVG mạng không được render inline.
- [ ] Test favicon/apple-touch-icon URL tương đối, URL mạng nội bộ do người dùng cấu hình, hủy chọn file và ảnh mặc định; chạy `npm test -- tests/icon-fetcher.test.ts tests/manager.test.ts`.

Đầu ra: đường icon app quản lý dùng cho cards, runner/tray và shortcut; lỗi có lý do để UI trình bày.

## P5-T4 — Dashboard và thử XPath (P5-02, P5-03, P5-06, P5-10)

File đã có: `src/renderer/manager/app.ts`, `index.html`, `styles.css` cùng thư mục. File nối: Manager bridge/handlers; `src/main/index.ts` cho vòng đời test XPath. Test: `tests/manager.test.ts`, `tests/runner-control-xpath.test.ts`.

- [ ] Tạo cards/search/loading/empty/error, launch/edit/delete/shortcut/clear; status refresh khi hiện và dừng timer khi ẩn/đóng. Không nội suy profile vào `innerHTML`.
- [ ] Form thêm dùng defaults từ mô hình hiện có; form sửa nạp đủ mode/interval/icon/năm checkbox. Lỗi lưu giữ dữ liệu; partial shortcut failure thông báo phần đã lưu; config thay đổi hiển thị trạng thái cần mở lại từ revision.
- [ ] Nối test XPath bằng ID đã lưu, selector và mode form đang nhập; profile chưa mở hướng dẫn mở/đăng nhập. Theo R05/R06, hoàn thiện cleanup timeout/navigation/close và validate mọi response trước khi đưa lên UI.
- [ ] Test match/no-match/selector sai/dữ liệu sai/loading/timeout, kết quả document cũ bị bỏ; test không thay baseline/config và không tạo attention. Response code dùng enum hiện có (`no_match`, `invalid_selector`, `invalid_data`), chỉ Việt hóa nhãn UI.
- [ ] Thử tên chứa HTML như spec, keyboard Tab/Escape/focus return, label, dark/light/system; chạy `npm test -- tests/manager.test.ts tests/runner-control-xpath.test.ts tests/xpath-evaluator.test.ts`.

Đầu ra: GUI hoàn chỉnh gọi handler thật, không còn nút chỉ ghi log. Không coi DOM mock là nghiệm thu Electron hoặc Zalo.

## P5-T5 — Tích hợp, phân phối và báo cáo (P5-11, P5-12)

Dự kiến tạo: `tests/integration.test.ts`, `docs/verification.md` khi có kết quả thực. Cập nhật `docs/installation.md` từ phase 4 và hướng dẫn chạy/cài hiện có khi triển khai.

- [ ] Chạy chuỗi GUI: thêm A/B → mở/đăng nhập riêng → thử XPath → nhận cảnh báo → focus clear → shortcut → mở lặp → sửa → xóa giữ session. Xác nhận A focus không xóa badge B, Manager restart không đóng runner.
- [ ] Thử upload/download, clipboard, mic/cam grant/deny, session sau restart; lỗi JSON/ghi/mạng, runner crash, socket cũ và màn hình bị tháo. Mọi lỗi phát hiện chỉ đánh dấu đã sửa sau khi có ca hồi quy và phép thử lại.
- [ ] Từ checkout sạch chạy `npm ci`, `npm run typecheck`, `npm run build`, `npm test`; sau đó smoke bản phân phối theo đường cài, preload/assets/runtime và sandbox thực.
- [ ] Điền ma trận spec cho các desktop có sẵn; giữ “Chưa kiểm thử” khi không truy cập được display. Ghi extension/DND và fallback CLI khi tray không hiện.
- [ ] Ghi `docs/verification.md` với mã P4/P5, commit, phiên bản, lệnh/thao tác, kết quả và bằng chứng; không thay kết quả desktop bằng 102 unit test của lần biên soạn.
- [ ] Đối chiếu P5-01…P5-12 và các lỗi R03–R06; chỉ đóng gate khi đáp ứng phạm vi nghiệm thu đã ghi, cập nhật tài liệu tổng bằng kết quả thực.
