# Kế hoạch chi tiết: 8 task triển khai Linux Webview Manager

Ngày cập nhật: 12/09/2026. Trạng thái: chưa triển khai. Tài liệu này quy định công việc và kiểm tra cần thực hiện, không chứa kết quả build/test đã chạy.

Nguồn chuẩn: [Đặc tả thiết kế](design_specification.md). Thứ tự nghiệm thu: [Lộ trình 5 phase](phased_implementation_plan.md).

Các mã triển khai dài trong bản cũ có lỗi build, vòng đời, bảo mật và thiếu handler; đã thay bằng hợp đồng và ca kiểm tra dưới đây. Không sao chép lại mẫu cũ từ lịch sử Git làm implementation chuẩn.

## Phụ thuộc và nguyên tắc

| Phase | Task | Phụ thuộc |
| --- | --- | --- |
| 1 — Runner và dữ liệu | 1, 2, 3 | 2 sau 1; 3 sau 2 |
| 2 — XPath | 4 | 3 |
| 3 — Thông báo | 5 | 4 |
| 4 — Shortcut | 6 | 3, 5 |
| 5 — Manager và nghiệm thu | 7, 8 | 7 sau 6; 8 sau 7 |

Các file dưới đây là file dự kiến tạo, chưa tồn tại trong repo. Tên module có thể gộp khi hợp lý nhưng phải giữ đủ hành vi. Không cần tạo class chỉ để bọc một hàm, mock setup trống hoặc scaffold chưa dùng.

Với logic lưu trữ, trạng thái, CLI, IPC và serialization, viết kiểm tra hành vi trước khi triển khai, chạy lại sau thay đổi. Test phải bắt được lỗi đã nêu, không chỉ so sánh chuỗi/implementation với chính nó. Không đánh dấu đạt chỉ vì TypeScript biên dịch.

## Task 1 — Build, runtime và launcher cơ bản

**File dự kiến:** `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `scripts/build.mjs`, `bin/zaloview.js`, entry tối thiểu `src/main/index.ts`.

**Đầu ra:** bộ công cụ chạy được trên máy Linux từ checkout mới.

- [ ] Chọn Electron stable còn được hỗ trợ, Node phát triển và các phiên bản TypeScript/Vitest/JSDOM tương thích; ghi yêu cầu Node vào package và khóa dependency. Không sao chép Electron 29 hay các phiên bản mẫu cũ.
- [ ] Dùng một bundler, chẳng hạn esbuild, cho preload và renderer; main target Node/CommonJS với Electron external, preload bundle CommonJS giữ `electron` external, renderer bundle browser không có Node. Không tắt sandbox để né lỗi import.
- [ ] `tsc --noEmit` kiểm tra type; build chuyển mã và copy đúng HTML/CSS/icon vào dist, không copy đè JS đã biên dịch bằng cây source và không nuốt lỗi qua `2>/dev/null`.
- [ ] Định nghĩa script: `build`, `typecheck`, `test`, `prestart` chạy build, `start` chạy `electron .`. Không cố định `--manager` trong start; argument của người dùng phải đến dispatcher nguyên vẹn.
- [ ] Launcher dev tìm app root theo file launcher, không theo cwd; gọi binary Electron kèm app path và argument bằng `spawn`. Xử lý spawn error, exit code và signal, không biến thất bại thành exit 0.
- [ ] Launcher đóng gói phải chạy application executable thật. Phân biệt Electron dùng lúc dev với binary đã bundle khi phân phối; không yêu cầu người dùng cài devDependencies để chạy bản đóng gói.
- [ ] Ghi launcher path dùng cho shortcut; chmod executable khi cài launcher. Không tự cài toàn cục bằng sudo trong build.

**Kiểm tra:**

- [ ] Checkout mới: `npm ci`, `npm run typecheck`, `npm run build`, `npm test` chạy đúng với file của task hiện tại.
- [ ] Smoke load renderer/preload sandbox: không có `exports is not defined` hoặc lỗi require module nội bộ.
- [ ] Chạy launcher từ cwd khác và đường dẫn chứa khoảng trắng; argument/exit code vẫn đúng. Kiểm tra lỗi khi thiếu runtime.

## Task 2 — Kiểu dữ liệu, lưu trữ và validation

**File dự kiến:** `src/shared/types.ts`, `src/main/profile-manager.ts`, `tests/profile-manager.test.ts`.

**Hợp đồng:** `Profile`, `XPathConfig`, `DesktopIntegrationConfig`, `WindowState` theo đặc tả; thao tác đọc registry, tạo/cập nhật/xóa profile và đọc/ghi window-state riêng.

- [ ] Resolve XDG_CONFIG_HOME/XDG_DATA_HOME, chỉ nhận đường dẫn tuyệt đối; rỗng hoặc tương đối về fallback.
- [ ] Parse registry `{ schemaVersion: 1, profiles: [...] }`; validate schema/version và tất cả dữ liệu trước sử dụng. File chưa có khác với file hỏng.
- [ ] Validate ID bất biến/duy nhất, tên, HTTP(S) URL không credentials, enum mode, boolean và poll interval 1000..60000 ms. Chặn path traversal, CR/LF/NUL tại trường dùng trong file/shortcut.
- [ ] Main sinh ID an toàn kể cả tên hoàn toàn tiếng Việt hoặc trùng nhau; giữ createdAt khi sửa và cập nhật updatedAt. Không tái sử dụng ID có dữ liệu đăng nhập còn giữ.
- [ ] Registry chỉ có Manager ghi; phase đầu dùng fixture cấu hình trong thư mục XDG thử nghiệm khi chưa có GUI. Runner đọc snapshot và tự ghi window-state, không ghi lại toàn bộ Profile lúc đóng.
- [ ] Ghi nguyên tử qua file tạm cùng thư mục rồi rename; quyền thư mục/file riêng tư. Khi parse/ghi lỗi, trả lỗi có thể hành động và giữ dữ liệu cũ.
- [ ] Xóa profile chỉ sau khi xác minh runner đã dừng. Xóa shortcut thuộc profile, mặc định giữ session; không xóa file icon gốc người dùng đã chọn. UI phải nói rõ dữ liệu nào còn lại.
- [ ] Lưu cấu hình sửa khi runner đang chạy được phép nhưng chỉ có hiệu lực lần mở lại; giữ thông báo “cần mở lại”.

**Kiểm tra:**

- [ ] Round-trip tạo/sửa/xóa, trùng ID, Unicode name, ID traversal, URL protocol xấu, enum lạ, NaN/interval ngoài khoảng.
- [ ] JSON lỗi/schema không hỗ trợ không bị ghi đè; lỗi rename/write không làm mất registry cũ.
- [ ] Sửa tên/cấu hình rồi đóng runner không làm mất thay đổi hoặc tạo lại profile đã xóa.
- [ ] XDG tùy chỉnh, giá trị tương đối, profile dir tách biệt, window-state không ghi vào registry.

## Task 3 — Runner, single-instance và kênh điều khiển

**File dự kiến:** `src/main/index.ts`, `src/main/window-service.ts`, `src/main/runner-control.ts`, `tests/runner.test.ts`; mở rộng launcher Task 1.

**Đầu ra:** profile khởi chạy độc lập bằng CLI, có session riêng và điều khiển an toàn từ Manager sau này.

- [ ] Parser nhận `--manager` hoặc `--profile <id>`, mặc định Manager; xử lý argv dev/packaged và lỗi CLI theo đặc tả. Trong phase 1, chế độ Manager có thể chỉ hiện cửa sổ trạng thái tối thiểu; chưa tính là đạt GUI.
- [ ] Chọn userData/sessionData riêng cho Manager và mỗi runner trước ready và trước lấy single-instance lock; dữ liệu bổ sung không dùng làm lock key.
- [ ] `second-instance` chờ ready/cửa sổ tạo xong rồi restore/show/focus đúng profile; không mở profile từ instance khác vào process hiện tại.
- [ ] Tạo BrowserWindow với khung native, ẩn menu, preload riêng, contextIsolation/nodeIntegration/sandbox đúng đặc tả và partition persist riêng.
- [ ] Thiết lập permission check/request theo origin và lựa chọn người dùng; lưu/thu hồi quyền. Test microphone/camera thật, không auto-allow toàn bộ `media` hoặc clipboard.
- [ ] Kiểm soát navigation, popup đăng nhập và external links; popup chỉ có quyền/session của runner, không có Manager bridge. Xử lý load failure/reload và lỗi chứng chỉ mà không bỏ bảo vệ.
- [ ] Lưu normal bounds debounce và khi close/hide; restore maximized sau khi áp bounds, xử lý màn hình đã ngắt và giới hạn Wayland.
- [ ] Implement socket status/shutdown với schema, request ID, giới hạn kích thước, timeout và quyền filesystem theo đặc tả. Task 4 thêm test-xpath, Task 5 thêm clear-attention.
- [ ] Status trả running/loading/error, attention/count và config revision đang dùng; disconnected là unknown. Kiểm tra socket path quá dài, socket cũ và request lỗi.
- [ ] Khi shutdown: thoát bằng lifecycle bình thường, dọn socket/listener và nhả khóa; lỗi hoặc timeout không cho phép xóa profile.
- [ ] Thử định danh Linux sớm bằng desktop entry fixture: đặt desktopName, kiểm tra WM_CLASS X11 và app ID Wayland trên runtime đã khóa. Ghi cấu hình khởi chạy đã chứng minh hoạt động; không dùng thuộc tính `wmClass` hoặc `@ts-ignore`.

**Kiểm tra:**

- [ ] Mở A rồi B: cả hai tồn tại; mở A lần hai từ CLI/shortcut chỉ restore A. Lặp khi A minimized, hidden và đang startup.
- [ ] Đăng nhập hai tài khoản độc lập, đóng/mở giữ session riêng. Manager thoát không đóng runner.
- [ ] JSON socket quá lớn/sai schema, permission ngoài origin, IPC từ iframe/webContents khác bị từ chối.
- [ ] Chuyển origin không kế thừa quyền; decline mic/cam vẫn dùng chat được.
- [ ] Ghi rõ kết quả Linux identity spike và môi trường. Chưa hỗ trợ một backend thì không đánh dấu đạt tách icon ở backend đó.

## Task 4 — XPath observer, trích xuất và baseline

**File dự kiến:** `src/preload/xpath-evaluator.ts`, `src/preload/webview-preload.ts`, `tests/xpath-evaluator.test.ts`; mở rộng runner control.

**Hợp đồng IPC:** main → preload `xpath:init`; preload → main `xpath:state`, `xpath:error`; thử thủ công dùng `xpath:test`/`xpath:test-result` với request ID. Không còn hai tên sự kiện focus-reset khác nhau trong tài liệu.

- [ ] Evaluate node đầu tiên bằng XPath, phân biệt selector lỗi/scalar với no-match. Selector rỗng tắt observer.
- [ ] Thực hiện ba mode và parse badge theo bảng đặc tả; không dùng regex lấy nhóm chữ số bất kỳ trong `-1` hay `1.5`, không dùng fallback count 1 khi dữ liệu sai.
- [ ] Tách hàm so sánh trạng thái theo mode. Luôn cập nhật mẫu trước khi count giảm/node mất; sự thay đổi text không được tạo alert trong existence/badge mode.
- [ ] Chờ DOM sẵn sàng, observe attributes và subtree; debounce 300 ms và fallback interval đã validate. Hủy cả debounce pending, poll và observer khi init lại/unload.
- [ ] Chỉ gửi state khi đổi; gửi mẫu khởi tạo một lần. Giới hạn preview IPC 500 ký tự nhưng so sánh text đầy đủ để nhận thay đổi sau vị trí này.
- [ ] Main xác thực sender/main frame/origin/mode/schema; gắn ID từ runner. Website không được gọi API quản lý profile.
- [ ] Không reset baseline khi focus; main quyết định attention. Phát lỗi selector/dữ liệu có dedup, không spam log hoặc popup.
- [ ] Thử XPath qua socket của runner đang chạy, chuyển tới preload trong document hiện tại; không dùng hidden window ở defaultSession.
- [ ] Test không đổi baseline/config, trả match/no-match/error và preview; timeout khi page loading không hoàn tất, hủy khi navigation/close. Highlight overlay tạm thời không kích hoạt cảnh báo giả.

**Kiểm tra:**

- [ ] Badge `3`, `99+`, `0`, no-match, text rỗng, `abc`, `-1`, `1.5`, số quá lớn; XPath sai hoặc scalar trả đúng trạng thái lỗi.
- [ ] Chuỗi count `5 → 3 → 4` phát hiện lần tăng cuối; disappearance/reappearance; existence không báo lại chỉ vì text thay đổi.
- [ ] Class/attribute đổi được observer bắt; init hai lần không nhân đôi timer; teardown dọn callback pending.
- [ ] Selector rỗng không poll. Page reload có baseline mới đúng hành vi khởi tạo trong đặc tả.
- [ ] Thử XPath dùng đúng profile và đăng nhập đang có, không tạo alert; response sai request ID hoặc từ document cũ bị bỏ.

## Task 5 — Attention, notification và tray

**File dự kiến:** `src/main/notifier.ts`, `src/main/tray-manager.ts`, `assets/default-icon.png`, `assets/unread-icon.png`, `tests/notifier.test.ts`; mở rộng WindowService.

**Hợp đồng:** một state machine attention ở main/profile; badge/tray đồng bộ mọi state, cooldown chỉ chi phối popup.

- [ ] Thực hiện luồng state của đặc tả: background/new change bật attention; decrease cập nhật badge; zero/empty clear; focused cập nhật baseline nhưng không cảnh báo.
- [ ] Cooldown popup 2000 ms ở main bằng đồng hồ monotonic; coalesce sự kiện mới nhất. Hết cooldown kiểm tra lại focus/config/state trước gửi.
- [ ] Focus và lệnh clear-attention xóa flash/badge/chấm tray, popup đang giữ và timer pending; không reset baseline và không đánh dấu đã đọc trên website.
- [ ] Dùng Electron Notification, kiểm tra hỗ trợ/lỗi show; click popup restore/show/focus. Phối hợp quyền Web Notification tránh popup đôi theo đặc tả.
- [ ] Badge count theo mode; không dùng `payload.count || 1` làm count 0 thành unread. Gắn đúng desktop identity và xử lý API trả false.
- [ ] Tray có icon trạng thái khác nhau thật, asset được đóng gói, tooltip không gọi indicator existence là số tin. Dùng icon profile nếu decode được, fallback rõ.
- [ ] Menu Mở, Xóa cảnh báo, Mở Manager, Thoát; mở Manager bằng launcher instance riêng.
- [ ] minimizeToTray mặc định false; chỉ hide khi đã bật và tạo tray thành công. UI chỉ đường khôi phục qua CLI/Manager khi tray host không hiển thị.
- [ ] before-quit bỏ chặn close; save state rồi dọn timer, IPC listener, notification và tray. Không dùng destroy để né lifecycle lưu dữ liệu.

**Kiểm tra:**

- [ ] `5 → focus → blur → 5`: không báo lại; `5 → focus → blur → 6`: báo mới.
- [ ] Đang focus nhận tăng count không bật attention; blur không báo bù. Count giảm cập nhật badge, zero xóa hết.
- [ ] Nhiều sự kiện trong 2 giây: badge cập nhật ngay, popup không vượt tần suất; count giảm trước hạn được phản ánh trong nội dung popup, focus/zero trước hạn hủy popup pending.
- [ ] Profile A focus không xóa badge B. Reload/window close không rò listener.
- [ ] Đóng X và Quit có hành vi khác nhau đúng config; tray lỗi/không host vẫn có đường mở lại. Icon unread khác icon thường cả nội dung lẫn hiển thị.

## Task 6 — Desktop entry và đường khởi chạy đã cài

**File dự kiến:** `src/main/desktop-service.ts`, `tests/desktop-service.test.ts`; hoàn thiện launcher/cài đặt từ Task 1.

**Hợp đồng:** tạo/cập nhật/xóa shortcut theo ID với XDG_DATA_HOME; Exec trỏ launcher đã xác minh.

- [ ] Serialize Desktop Entry và Exec theo hai bộ escaping tương ứng; validate dữ liệu trước khi ghi, không shell interpolation.
- [ ] Exec chỉ `<launcher> --profile <id>`, không `%u` hoặc action `--edit` chưa hỗ trợ. Không mặc định process.execPath bản dev.
- [ ] Đồng bộ desktop filename, desktopName và danh tính đo ở Task 3; Icon là file tuyệt đối do app quản lý hoặc tên icon theme.
- [ ] Ghi nguyên tử mode 0644 trong applications dir; chỉ xóa file của profile hợp lệ. Đổi tên/icon cập nhật shortcut, tắt checkbox thì gỡ.
- [ ] Trả kết quả lỗi từng phần nếu registry đã lưu nhưng shortcut lỗi, cho retry. Không báo lưu thành công toàn bộ khi install thất bại.
- [ ] Không coi update-desktop-database là refresh menu bắt buộc; nếu có gọi thì execFile với argument và xử lý thiếu utility.
- [ ] Ghi cách cài launcher/bản đóng gói để shortcut hoạt động từ desktop session không có shell dev, kể cả cwd/PATH khác.

**Kiểm tra:**

- [ ] Các trường có khoảng trắng, dấu quote, backslash, dollar, backtick, percent; CR/LF/NUL và ID traversal bị từ chối.
- [ ] Chạy `desktop-file-validate` trên fixture sinh ra khi utility có sẵn; ghi thiếu utility nếu chưa thể kiểm tra.
- [ ] Shortcut thực mở đúng profile từ menu và cwd khác; không chỉ kiểm tra chuỗi Exec.
- [ ] KDE/GNOME: tìm trong menu, pin/unpin, icon riêng, mở lặp chỉ focus runner cũ. Thử riêng X11/Wayland theo ma trận.

## Task 7 — Manager dashboard và nối đầy đủ API

**File dự kiến:** `src/preload/manager-preload.ts`, `src/renderer/manager/index.html`, `styles.css`, `app.ts`, `src/main/icon-fetcher.ts`, `tests/manager.test.ts`; mở rộng main handlers.

**Bridge được phép và handler bắt buộc:**

| API | Xử lý tại main |
| --- | --- |
| getProfiles | Đọc registry đã validate |
| saveProfile | Validate, merge, lưu và đồng bộ shortcut; trả lỗi từng phần |
| deleteProfile | Dừng runner, xác minh dừng, xóa cấu hình/shortcut; giữ session mặc định |
| launchProfile | Launcher instance riêng; xử lý spawn error |
| toggleShortcut | Cập nhật lựa chọn trong registry và đồng bộ file |
| getRunnerStatus | Socket; phân biệt running/stopped/unknown |
| clearAttention | Chuyển lệnh tới runner |
| testXPath | profileId + selector + mode tới đúng runner và document |
| chooseIcon / fetchIcon | Dialog chọn file hoặc tải icon có giới hạn, chuẩn hóa và sao chép an toàn |

- [ ] Mỗi API có handler thật, validate sender/main frame local Manager và payload. Không expose ipcRenderer, event hoặc generic invoke.
- [ ] Cards hiển thị name/icon/URL, trạng thái runner và attention; search, launch, edit, delete, shortcut, clear. Refresh status chỉ khi Manager hiển thị.
- [ ] Dùng DOM/textContent cho dữ liệu người dùng; CSP cho asset local, không inline script hay HTML nội suy từ profile.
- [ ] Form reset trước khi mở; khi edit nạp lại đủ năm checkbox, mode, interval và các trường hiện có. Giữ createdAt/userAgent; ID không đổi theo tên.
- [ ] Lưu lỗi giữ form và dữ liệu người dùng; hiển thị partial shortcut failure và “cần mở lại” khi runner đang dùng config cũ.
- [ ] Nối nút test XPath đầy đủ; profile chưa lưu/chưa mở thì hướng dẫn lưu/mở/đăng nhập, hiển thị đúng lỗi và timeout. Test chọn đúng mode.
- [ ] Icon tự tải/favicon/apple-touch-icon và file local theo giới hạn đặc tả; PNG mặc định khi lỗi, không nhúng SVG từ mạng vào Manager.
- [ ] Dark/light theo hệ thống và lựa chọn người dùng; dialog dùng bàn phím được, focus/label/Escape đầy đủ.
- [ ] Xóa profile báo rõ giữ session; thao tác xóa session riêng chỉ khi người dùng yêu cầu và xác nhận mục tiêu. Runner shutdown thất bại thì không xóa.
- [ ] Mở Manager từ tray không tạo dashboard bên trong runner process.

**Kiểm tra:**

- [ ] Tên như `<img src=x onerror=alert(1)>` hiển thị literal, không chạy script.
- [ ] Sửa profile có checkbox false rồi lưu giữ nguyên false; thêm mới sau sửa dùng defaults; createdAt không đổi.
- [ ] Mỗi bridge có test handler thành công/lỗi và từ chối sender website/iframe; nút test/toggleShortcut không có missing handler.
- [ ] Tải icon timeout, redirect protocol xấu, ảnh quá lớn/hỏng và file không tồn tại vẫn dùng fallback.
- [ ] CRUD → launch → XPath test → alert → focus → shortcut → delete chạy xuyên suốt với session thực.

## Task 8 — Kiểm tra tích hợp và bàn giao

**File dự kiến:** `tests/integration.test.ts`, hướng dẫn chạy/cài ở README gốc khi đã có app, `docs/verification.md` khi thực sự nghiệm thu.

- [ ] Chạy từ checkout sạch với lockfile: `npm ci`, `npm run typecheck`, `npm run build`, `npm test`.
- [ ] Chạy ứng dụng dev và bản phân phối; kiểm tra asset/preload path, sandbox, launcher và permissions trên bản thực.
- [ ] Ghi ma trận KDE X11, KDE Wayland, GNOME X11 (nếu có), GNOME Wayland; mỗi môi trường ghi phiên bản và extension. Không có môi trường thì đánh dấu chưa kiểm thử/không áp dụng với lý do.
- [ ] Thử hai tài khoản, giữ phiên, mic/cam, upload/download, clipboard, notification nền, focus clear, tray, quit, shortcut và test XPath đúng session.
- [ ] Thử JSON hỏng, đĩa không ghi được, runner crash, Manager restart, socket cũ, mất mạng và đổi màn hình; không mất registry/session.
- [ ] Ghi dependency/runtime đã khóa, cách chạy, cách cài launcher, giới hạn XPath/Linux và cách phục hồi cửa sổ khi tray không hiện.
- [ ] Đối chiếu từng yêu cầu đặc tả với kết quả; chỉ đánh dấu các mục có bằng chứng thực tế. Không ghi “all tests pass” hoặc số test dự đoán trước khi chạy.

## Checklist chất lượng tài liệu trước khi triển khai

- [ ] Chốt runtime và kết quả identity spike trên backend đích.
- [ ] API/kiểu dữ liệu và tên IPC nhất quán với đặc tả.
- [ ] Tất cả bridge có handler, đường lỗi và kiểm tra sender.
- [ ] Các tiêu chí desktop được nghiệm thu trên môi trường thật, không suy từ mock.
- [ ] Các thay đổi triển khai được cập nhật đồng thời vào đặc tả và lộ trình.
