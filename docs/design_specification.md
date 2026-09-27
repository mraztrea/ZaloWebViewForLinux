# Đặc tả thiết kế: Linux Webview Manager

Ngày cập nhật: 12/09/2026. Trạng thái: đặc tả mục tiêu đã rà soát; repo đã có triển khai một phần, chưa nghiệm thu runtime đầy đủ. Chi tiết phần tiếp theo tại [spec/plan phase 4–5](phases/README.md); việc có yêu cầu trong tài liệu không đồng nghĩa code đã đáp ứng.

Yêu cầu gốc: [org_prompt.md](org_prompt.md). Triển khai theo [5 phase](phased_implementation_plan.md) và [8 task](detailed_tasks_plan.md).

## 1. Mục tiêu và phạm vi

Ứng dụng Linux cho phép thêm nhiều website, mỗi cấu hình là một profile đăng nhập riêng. Mỗi profile có cửa sổ không thanh địa chỉ/menu trình duyệt, cấu hình XPath kiểm tra định kỳ, cảnh báo desktop và shortcut trong menu KDE/GNOME. Focus cửa sổ xóa cảnh báo của ứng dụng.

Giữ thanh tiêu đề và nút đóng/thu nhỏ native; yêu cầu “không header trình duyệt” không đồng nghĩa `frame: false`. Dùng Electron, TypeScript và HTML/CSS thuần cho Manager. Chọn một Electron stable còn được hỗ trợ, khóa phiên bản cùng dependency tương thích trong lockfile; không dùng lại bộ phiên bản Electron 29 trong mẫu cũ. Xem [chính sách hỗ trợ Electron](https://www.electronjs.org/docs/latest/tutorial/electron-timelines).

Zalo Web là ca kiểm thử chính, không phải tích hợp API Zalo. Chromium tạo nền tảng tương thích nhưng WebRTC, clipboard, tải lên/tải xuống, âm thanh và đăng nhập vẫn cần thử thực tế. Không cam kết website luôn hỗ trợ Electron hay phiên đăng nhập tồn tại vĩnh viễn.

Các tính năng giao diện đã đặt ra gồm tìm kiếm profile, dark/light theme, icon tùy chọn hoặc tự tải, xem trạng thái runner/cảnh báo, chỉnh sửa, xóa và thử XPath. Không dùng thẻ Electron `<webview>`; runner tải website bằng `BrowserWindow.loadURL`.

## 2. Tiến trình, khóa và định danh

### 2.1. Manager và runner

- `zaloview` hoặc `zaloview --manager`: mở Manager.
- `zaloview --profile <id>`: mở hoặc khôi phục runner của profile đó.
- Manager và mỗi runner là một instance Electron riêng, gồm main process và các renderer/utility process Chromium. Một BrowserWindow không đồng nghĩa một tiến trình hệ điều hành duy nhất.
- Manager khởi chạy runner qua launcher dùng chung bằng `spawn` với mảng argument, không qua shell và không tạo cửa sổ profile trong main process của Manager.
- Runner tiếp tục hoạt động khi Manager đóng. Menu tray mở Manager qua launcher riêng.

Phân tích và kiểm tra CLI trước `app.whenReady()`. Thiếu ID, ID không tồn tại, cờ lạ hoặc kết hợp `--manager --profile` phải báo lỗi và exit khác 0. Xử lý khác biệt argv giữa bản dev và bản đóng gói. Không công bố `--edit` hoặc nhận URL ngoài CLI khi chưa triển khai chúng.

### 2.2. Single-instance đúng phạm vi

Trước khi lấy khóa và trước `ready`, tạo thư mục instance rồi gọi `app.setPath('userData', instanceDir)`; Manager dùng thư mục `manager`, runner dùng `profiles/<id>`. Sau đó mới gọi `app.requestSingleInstanceLock()`. `additionalData` chỉ chuyển dữ liệu sang instance đầu, không phải khóa tùy biến. Xem [app API](https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelockadditionaldata).

Khi nhận `second-instance`, đợi cửa sổ sẵn sàng, restore nếu minimized, show và yêu cầu focus. Profile A và B phải chạy đồng thời; mở A lần nữa chỉ khôi phục A. Không dùng chung thư mục Chromium giữa hai main process.

### 2.3. Liên lạc Manager–runner

Dùng một Unix domain socket cho mỗi runner, đặt trong thư mục runtime riêng của người dùng (quyền thư mục `0700`, socket `0600`). Ưu tiên `XDG_RUNTIME_DIR`; nếu thiếu, tạo thư mục riêng trong vùng dữ liệu ứng dụng, kiểm tra chiều dài đường dẫn socket và báo lỗi rõ khi vượt giới hạn nền tảng.

Hợp đồng lệnh tối thiểu: `status`, `test-xpath`, `clear-attention`, `shutdown`. Request/response JSON theo dòng, có request ID, giới hạn 64 KiB/message và timeout; chỉ một request test đang chờ trên mỗi runner. Main kiểm tra schema, ID đích và không hỗ trợ thực thi JavaScript/lệnh tùy ý. Socket không truy cập từ renderer website.

Manager lấy trạng thái khi mở và làm mới định kỳ khi hiển thị; lỗi kết nối hiển thị “không xác định”, không suy ra chắc chắn đã đóng. Runner đã có khóa mới được dọn socket cũ trong đường dẫn của chính nó. Shutdown phải đợi runner thoát và nhả khóa; timeout thì giữ profile, báo lỗi. Không coi gửi lệnh thành công là đã tắt.

### 2.4. Định danh cửa sổ Linux

Tên desktop entry của runner là `zaloview-<id>.desktop`; thiết lập `app.setDesktopName` tương ứng trước khi tạo cửa sổ. Badge là trạng thái cấp app nên kiến trúc một runner/profile giúp tránh xóa badge của profile khác. Xem [badge API](https://www.electronjs.org/docs/latest/api/app#appsetbadgecountcount).

Không có tùy chọn công khai `BrowserWindow.wmClass` để làm theo mã mẫu cũ. X11 dùng WM_CLASS/StartupWMClass; Wayland dùng app ID khớp tên desktop entry bỏ hậu tố. `StartupWMClass` không tự đặt Wayland app ID.

Cơ chế tạo WM_CLASS/app ID phụ thuộc Electron và backend. Task 3 phải thử cách cấu hình danh tính tiến trình được runtime đã chọn hỗ trợ trước khi tạo window, đo kết quả thực tế và ghi cấu hình hoạt động. Không dùng `@ts-ignore` hay giả định `app.setName` tự đổi danh tính OS. Tham khảo [mã tạo cửa sổ Linux của Electron](https://github.com/electron/electron/blob/main/shell/browser/native_window_views.cc); khi triển khai phải đối chiếu tag đã khóa. Nếu không tách được icon trên một backend, ghi giới hạn đó, không đánh dấu đạt.

## 3. Lưu trữ và dữ liệu

### 3.1. Đường dẫn

Tôn trọng biến XDG khi có giá trị tuyệt đối; biến rỗng hoặc tương đối dùng fallback. Theo [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir/latest/):

| Nội dung | Đường dẫn |
| --- | --- |
| Cấu hình dùng chung | `$XDG_CONFIG_HOME/zaloview/profiles.json`, mặc định `~/.config/zaloview/profiles.json` |
| Icon do app quản lý | `$XDG_DATA_HOME/zaloview/icons/`, mặc định dưới `~/.local/share/` |
| userData Manager | `$XDG_DATA_HOME/zaloview/manager/` |
| userData runner | `$XDG_DATA_HOME/zaloview/profiles/<id>/` |
| Vị trí/kích thước cửa sổ | `window-state.json` trong userData runner |
| Desktop entry | `$XDG_DATA_HOME/applications/zaloview-<id>.desktop` |

Runner tạo `session.fromPartition('persist:zaloview_' + id)` sau khi thiết lập userData và Electron ready. Đặt rõ `sessionData` về thư mục userData của instance trước ready để đường dẫn Chromium không phụ thuộc mặc định ngoài ý muốn. Không tự tạo một `Partitions/` chung rồi giả định Electron sẽ lưu vào đó.

Partition tách cookie, cache, local storage và IndexedDB giữa profile; đây không phải cơ chế mã hóa hay cách ly trước tiến trình khác cùng tài khoản Linux.

### 3.2. Hợp đồng cấu hình

```typescript
interface XPathConfig {
  selector: string; // rỗng: tắt observer
  mode: 'badge_count' | 'text_content' | 'existence';
  pollIntervalMs: number; // số nguyên 1000..60000, mặc định 3000
}

interface DesktopIntegrationConfig {
  flashTaskbar: boolean;
  showTaskbarBadge: boolean;
  minimizeToTray: boolean;
  showDesktopNotification: boolean;
  createDesktopShortcut: boolean;
  enableContextMenu: boolean; // menu chuột phải trong cửa sổ profile, mặc định false
}

interface Profile {
  id: string; // bất biến, duy nhất, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, tối đa 64 ký tự
  name: string; // không rỗng, tối đa 120 ký tự, không có ký tự điều khiển
  url: string; // HTTP(S), không chứa username/password
  iconPath?: string; // file icon đã được app kiểm tra và sao chép
  userAgent?: string;
  xpathConfig: XPathConfig;
  desktopConfig: DesktopIntegrationConfig;
  createdAt: string; // ISO, main tạo một lần
  updatedAt: string; // ISO, main cập nhật
}

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}
```

`profiles.json` là `{ schemaVersion: 1, profiles: Profile[] }`. Main kiểm tra schema khi đọc và trước ghi; không chỉ ép kiểu TypeScript. Tên tiếng Việt không được sinh ID rỗng hoặc đụng ID cũ: main sinh ID bằng UUID hoặc slug kèm hậu tố duy nhất. ID không thay khi đổi tên.

Chỉ Manager ghi registry; runner đọc snapshot cấu hình và chỉ ghi window-state của mình. Ghi file tạm cùng thư mục rồi rename, quyền file dữ liệu riêng tư `0600`. JSON hỏng phải hiện lỗi và giữ nguyên file để khôi phục; không trả danh sách rỗng rồi ghi đè dữ liệu. Khi sửa, merge trường hợp lệ vào bản mới nhất, giữ `createdAt`, `userAgent` và trường không nằm trong form. Không ghi lại snapshot Profile cũ lúc runner đóng.

Thay đổi cấu hình áp dụng từ lần runner khởi động tiếp theo; UI chỉ rõ nếu cần mở lại. Xóa profile yêu cầu runner dừng thành công trước khi xóa registry và shortcut. Mặc định giữ dữ liệu đăng nhập trên đĩa, không tự tái sử dụng ID có dữ liệu còn lại. Xóa dữ liệu đăng nhập là thao tác riêng có thông báo rõ mục tiêu.

## 4. Bảo mật và quyền website

Mọi cửa sổ dùng `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, giữ `webSecurity` và kiểm tra chứng chỉ mặc định. Manager chỉ tải tài nguyên local, CSP hạn chế script về asset đóng gói; render tên/URL bằng `textContent`, không chèn dữ liệu vào `innerHTML`. Bridge chỉ expose từng thao tác cần thiết. Main xác thực sender WebContents, main frame và nguồn tin cậy cho mỗi IPC. Xem [hướng dẫn bảo mật Electron](https://www.electronjs.org/docs/latest/tutorial/security).

Áp dụng cả `setPermissionRequestHandler` và `setPermissionCheckHandler`, mặc định từ chối. Quyền mic/camera, clipboard-read và thông báo phải xét origin yêu cầu, frame và lựa chọn người dùng; không auto-allow chỉ vì tên quyền nằm trong mảng. Lưu quyết định theo origin/quyền trong dữ liệu runner, cho phép thu hồi; website chuyển origin không được kế thừa quyền. Xem [session permissions](https://www.electronjs.org/docs/latest/api/session#sessetpermissionrequesthandlerhandler).

Chỉ điều hướng HTTP(S). Link ngoài được xác minh trước khi mở trình duyệt hệ thống; popup đăng nhập cần session profile và cùng chính sách sandbox/quyền, không preload Manager. Cho phép người dùng phê duyệt origin đăng nhập cần thiết. Không chạy XPath trên origin ngoài phạm vi đã cấu hình/phê duyệt. Không vô hiệu hóa CSP hay chứng chỉ để sửa lỗi đăng nhập.

Dùng Electron `Notification` cho popup native, không thêm thư viện DBus chỉ để gửi thông báo. Khi popup XPath bật, mặc định từ chối quyền Web Notification để tránh hai nguồn báo trùng; khi XPath popup tắt, quyền Web Notification vẫn theo lựa chọn người dùng.

Preload có import module nội bộ phải được bundle thành một file chạy được trong sandbox. Renderer Manager phải build cho trình duyệt, không để `require`/`exports` CommonJS lọt vào trang không có Node. Xem [sandbox preload](https://www.electronjs.org/docs/latest/tutorial/sandbox).

## 5. XPath và trạng thái cảnh báo

### 5.1. Observer và trích xuất

Khởi tạo sau khi DOM sẵn sàng; observer theo dõi `document.documentElement` với `childList`, `subtree`, `characterData`, `attributes`. Debounce 300 ms, poll mặc định 3 giây. Hủy observer, interval và timeout debounce khi đổi config hoặc unload. Selector rỗng tắt toàn bộ việc theo dõi.

Fallback timer cũng có thể bị throttle hoặc dừng khi máy suspend; không đảm bảo quét đúng thời gian thực ở nền. Quét lại khi trang hiển thị/resume. Dùng XPath trả node đầu tiên; selector scalar hoặc sai cú pháp trả lỗi cấu hình phân biệt với “không tìm thấy”. Không quét được DOM trong cross-origin iframe hay xuyên shadow root bằng XPath thông thường.

| Mode | Giá trị có ý nghĩa | Khi tạo cảnh báo mới |
| --- | --- | --- |
| `existence` | Node tồn tại trong DOM; không có nghĩa đang nhìn thấy | false → true; không xét thay đổi text |
| `badge_count` | Text dạng số nguyên không âm, cho phép hậu tố `+`; `99+` → 99 | Count tăng so với mẫu trước |
| `text_content` | `textContent.trim()`, chuỗi rỗng không tạo cảnh báo | Text khác mẫu trước và không rỗng |

Badge không match là count 0; badge có text không hợp lệ (ví dụ `abc`, `-1`, `1.5`) trả lỗi dữ liệu, không đoán thành 1. Giới hạn count ở số nguyên an toàn, text gửi IPC tối đa 500 ký tự; so sánh nội dung trước khi cắt preview. `existence` chỉ là indicator 0/1, không được mô tả là số tin chính xác. Nếu cần bỏ qua node ẩn bằng class/style, selector phải phản ánh trạng thái ứng dụng; XPath không tự đánh giá CSS visibility.

Selector Zalo trong bản cũ chỉ là ví dụ chưa xác minh; người dùng phải chọn và thử trên DOM hiện tại. Poll chỉ thấy mẫu tại thời điểm quét: tin đến rồi biến mất giữa hai mẫu, badge giữ `99+` hoặc hai tin có text giống nhau có thể không được phát hiện.

### 5.2. Luồng trạng thái chuẩn

Preload nhận `xpath:init`, gửi `xpath:state` khi trạng thái đổi và `xpath:error` khi có lỗi. Mẫu hợp lệ có `mode, hasElement, count, text, changedForAlert`; main gắn profile theo sender, không tin ID hay thời gian từ payload. Mode phải khớp config; mọi trường phải được validate. `changedForAlert` được tính theo bảng trên và chỉ là tín hiệu từ nội dung website không tin cậy.

Lưu mẫu trước cho mọi quan sát hợp lệ, kể cả count giảm hoặc node biến mất. Mẫu đầu tiên có dữ liệu được so với trạng thái rỗng và có thể cảnh báo nếu cửa sổ không focus. Lỗi XPath giữ mẫu hợp lệ gần nhất, hiển thị lỗi, không tạo popup tin mới.

Main giữ trạng thái cảnh báo riêng với trạng thái DOM:

1. Cửa sổ không focus, xuất hiện thay đổi tạo cảnh báo: bật attention, cập nhật badge/tray; popup theo cooldown.
2. Count giảm: cập nhật baseline và badge nếu attention đang bật, không popup. Count về 0/node biến mất/text rỗng: xóa attention.
3. Focus hoặc “Xóa cảnh báo”: tắt flash, badge và chấm tray, đóng popup do app giữ; giữ baseline DOM.
4. Trong lúc focus: tiếp tục cập nhật baseline, không tạo attention/popup. Blur không tự báo lại mẫu cũ.
5. Chỉ thay đổi mới sau khi đã xóa mới bật attention trở lại.

Không cần IPC reset baseline khi focus. Xóa cảnh báo không đánh dấu đã đọc trên website. Reload/đổi document tạo observer mới; mẫu đầu có thể báo lại unread khi đang ở nền, đây là hành vi khởi tạo đã xác định.

Cooldown popup 2000 ms được thực thi ở main bằng đồng hồ monotonic, không chặn cập nhật state/badge. Trong cooldown chỉ giữ sự kiện mới nhất chờ gửi; hết hạn chỉ gửi nếu attention còn, cửa sổ vẫn ở nền và config cho phép. Nội dung popup lấy từ trạng thái hợp lệ hiện tại để không báo count cũ nếu count đã giảm trong lúc chờ. Focus, trạng thái rỗng hoặc thoát phải hủy popup đang chờ.

## 6. Linux desktop và vòng đời

### 6.1. Mức hỗ trợ

| Tính năng | Điều kiện nghiệm thu |
| --- | --- |
| Flash/urgency | `flashFrame` là yêu cầu tới desktop; compositor quyết định biểu diễn và focus. Thử riêng X11/Wayland. |
| Badge dock/taskbar | Launcher phải hỗ trợ LauncherEntry DBus và nhận đúng desktop identity; kiểm tra cả giá trị trả về API và hiển thị. |
| System tray | Phụ thuộc host StatusNotifierItem/XEmbed; GNOME có thể cần extension. Tạo đối tượng Tray không chứng minh icon đang nhìn thấy. |
| Popup | Có notification service, `Notification.isSupported()`; chính sách không làm phiền có thể ẩn popup. |
| Tách icon và pin | X11 WM_CLASS/Wayland app ID phải khớp desktop entry trên môi trường được kiểm thử. |

Tham khảo [Tray API](https://www.electronjs.org/docs/latest/api/tray) và [BrowserWindow API](https://www.electronjs.org/docs/latest/api/browser-window). Thiếu tính năng tùy desktop phải báo giới hạn/fallback trong UI; không ghi “hoạt động 100% KDE/GNOME”.

### 6.2. Tray, focus và thoát

Icon bình thường và icon cảnh báo phải khác nhau thật; dùng asset PNG hợp lệ, có icon mặc định đóng gói. Không trả cùng một file cho cả hai trạng thái. Tooltip badge_count ghi count; existence/text ghi “Có thông báo mới”.

Menu có Mở cửa sổ, Xóa cảnh báo, Mở Manager, Thoát profile. Mở cửa sổ luôn restore → show → yêu cầu focus. Bắt close để hide chỉ khi người dùng bật `minimizeToTray`, tạo tray thành công và có đường mở lại bằng Manager/CLI. Mặc định tắt tùy chọn này; không tự suy ra tray hiển thị từ desktop name. Báo người dùng cách mở lại khi bật.

`before-quit` đặt cờ đang thoát để close không bị chặn. Khi đóng thật: lưu normal bounds, dọn listener IPC/socket/timer/notification và tray, thoát runner. Tránh `destroy()` bỏ qua lưu trạng thái. Lưu kích thước debounce và khi close/hide; không lấy bounds đang maximized làm normal bounds. Clamp về màn hình hiện có; vị trí cửa sổ trên Wayland chỉ khôi phục khi compositor cho phép.

### 6.3. Shortcut

Ví dụ minh họa, launcher phải thay bằng đường dẫn đã cài trên máy:

```ini
[Desktop Entry]
Version=1.0
Type=Application
Name=Zalo
Exec=/absolute/path/to/zaloview --profile zalo
Icon=applications-internet
Terminal=false
StartupWMClass=zaloview-zalo
Categories=Network;InstantMessaging;
```

`StartupWMClass` trong ví dụ là giá trị mục tiêu, phải khớp kết quả đo runtime. Không thêm `%u` vì CLI chưa nhận URL. Không thêm desktop action dùng `--edit` khi CLI không có cờ đó.

Serialize riêng Desktop Entry string và Exec argument theo [Exec specification](https://specifications.freedesktop.org/desktop-entry/latest/exec-variables.html); không dùng shell quoting thay thế. Escape backslash, quote, dollar, backtick và percent đúng ngữ cảnh; từ chối CR/LF/NUL trong dữ liệu đầu vào. Dùng launcher ổn định, không mặc định `process.execPath` vì bản dev trỏ tới binary Electron cần thêm app path.

Ghi `.desktop` nguyên tử, mode `0644`; launcher mới cần executable bit. Chỉ ghi/xóa file thuộc ID đã validate trong applications dir. Lưu cấu hình và thao tác shortcut không nguyên tử chung: trả lỗi từng phần và cho phép thử lại nếu config đã lưu nhưng shortcut thất bại.

`update-desktop-database` cập nhật cache liên kết MIME, không đảm bảo refresh menu ngay. Với shortcut không có MimeType, không bắt buộc chạy; nếu dùng, gọi `execFile` với mảng argument và xử lý thiếu utility. Kiểm tra menu và pin thực tế theo từng desktop. Xem [MIME registration](https://specifications.freedesktop.org/desktop-entry/0.9.5/mime-types.html).

## 7. Manager và thử XPath

Form phải điền lại tất cả checkbox, interval, mode, icon và dữ liệu hiện có trước mỗi lần sửa/thêm. Lưu thành công mới đóng form; lỗi đọc/ghi, launcher, shortcut, mạng hoặc test phải hiện rõ. Hỗ trợ bàn phím, label, focus trong dialog, Escape và focus trở về nút mở. Theme theo hệ thống và lựa chọn người dùng.

Main tải favicon/apple-touch-icon qua HTTP(S) với timeout, giới hạn redirect, 2 MiB và kích thước ảnh tối đa 1024×1024. Xác minh mỗi redirect/protocol, không gửi cookie phiên website; URL mạng nội bộ do người dùng cấu hình vẫn được phép. Decode an toàn, chuẩn hóa PNG; SVG không được chèn inline và chỉ nhận nếu pipeline chuyển đổi đã kiểm chứng. Lỗi tải/định dạng dùng icon mặc định, vẫn cho chọn file local.

“Kiểm tra XPath” nhận `profileId, selector, mode`, không chỉ URL. Profile mới phải lưu rồi mở runner/đăng nhập trước. Manager chuyển request qua socket tới chính runner để preload thử trong session và DOM đang dùng, không mở cửa sổ ngầm ở defaultSession. Test chỉ đánh giá, không sửa config/baseline và không phát cảnh báo.

Trả các trạng thái: match (count/text/preview), no-match, invalid-selector, invalid-data, runner-not-running, loading/login-required, timeout. Không tự đoán đã đăng nhập chỉ từ `did-finish-load`; khi cần, hiển thị yêu cầu người dùng mở trang đăng nhập. Highlight chỉ áp dụng Element có thể vẽ, overlay tự gỡ, không thay đổi nội dung/trạng thái đã đọc. Hủy yêu cầu khi runner đổi document hoặc bị đóng.

## 8. Điều kiện hoàn thành

Mỗi yêu cầu phải có task và tiêu chí trong [kế hoạch chi tiết](detailed_tasks_plan.md). Test DOM/mock không chứng minh Linux desktop hoặc Zalo hoạt động.

Báo cáo nghiệm thu phải ghi Electron/Chromium, distro, desktop và phiên bản, X11/Wayland, extension tray/dock nếu có; tách rõ đạt, không đạt, không hỗ trợ và chưa kiểm thử. Chưa chạy trên một môi trường thì không đánh dấu đạt môi trường đó.
