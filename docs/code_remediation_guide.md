# Hướng dẫn xử lý các điểm code ảnh hưởng phase 4–5

Ngày rà soát: 12/09/2026. Mốc code `27a7681`, nhánh `develop`. Đây là hướng dẫn cho lần triển khai sau; không có code, test hoặc cấu hình chạy nào được sửa trong đợt tài liệu này. Không mở rộng tài liệu riêng cho phase 1–3.

## Căn cứ và giới hạn

Đã đối chiếu tài liệu chuẩn, spec/hợp đồng nền tảng, code hiện tại và chạy kiểm tra tự động. GitNexus repo `ZaloWebViewForLinux` chậm 4 commit; query/context chỉ hỗ trợ định vị, các nhận định dưới đây được kiểm tra lại bằng source. Chưa làm impact để sửa code và không coi kết quả graph này là kết luận rủi ro thấp.

| Kiểm tra tại thời điểm biên soạn | Kết quả |
| --- | --- |
| Node.js của môi trường | `v24.20.0` |
| Electron trong lockfile | `44.3.0` |
| Vitest trong lockfile | `3.2.7` |
| `npm run typecheck` | Đạt |
| `npm test` | 14 file, 102 test đạt |
| Build/runtime/desktop trong lần biên soạn | Chưa chạy nghiệm thu thực |

Test đạt không chứng minh các ca chưa có test đã đúng. Bằng chứng cũ trong `specs/004-desktop-attention-tray/quickstart.md` ghi Electron không kết nối được `wayland-0`; không được diễn giải là KDE Wayland đạt hoặc chắc chắn không hỗ trợ.

## Phần chưa triển khai theo lộ trình

`src/main/desktop-service.ts`, `src/preload/manager-preload.ts`, `src/main/icon-fetcher.ts` chưa có. `src/renderer/manager/app.ts` chỉ log khi bấm thêm profile; `createManagerWindow` đang nạp `webview-preload.js`. Đây là phần việc phase 4–5 còn thiếu, không phải hồi quy đã được chứng minh. Thực hiện theo [plan phase 4](phases/phase-4-shortcuts/plan.md) và [plan phase 5](phases/phase-5-manager/plan.md).

## R01 — Launcher hiện tại chỉ phục vụ môi trường có runtime dev

**Bằng chứng:** [bin/zaloview.js](../bin/zaloview.js) tìm `node_modules/electron/cli.js`, báo cài `npm install` nếu thiếu và dùng Node `process.execPath` để mở CLI Electron.

**Ảnh hưởng:** entry trỏ launcher này chưa đủ chứng minh dùng được trong desktop session hoặc bản phân phối không có devDependencies. Đây là khoảng thiếu đóng gói, chưa phải lỗi launcher dev.

**Hướng sửa:** P4-T1 chốt cách cài app/runtime và launcher tuyệt đối. Giữ argv array, xác minh Node/runtime nếu cần; tài liệu cài phải cho biết đường dẫn thực dùng ở Exec. Không trỏ riêng binary Electron dev mà bỏ app path.

**Ca kiểm tra:** cài vào đường có khoảng trắng, cwd khác, PATH tối thiểu; mở profile hợp lệ và runtime thiếu. Chỉ ghi đạt sau khi entry thực mở được runner từ menu.

## R02 — Atomic writer cố định `0600`, chưa phù hợp trực tiếp với desktop entry

**Bằng chứng:** [atomic-writer.ts](../src/main/atomic-writer.ts) mở/chmod file tạm bằng `0o600` trước rename.

**Ảnh hưởng:** đúng cho registry/permission, nhưng nếu phase 4 dùng nguyên API để ghi entry sẽ không đáp ứng mode `0644` của đặc tả. Đây là điểm cần mở rộng có chủ đích, không phải lỗi quyền registry.

**Hướng sửa:** P4-T2 có thể thêm tham số mode giới hạn `0o600 | 0o644`, mặc định giữ `0o600`; áp mode trước rename. Chạy impact `atomicWriteFile` và báo mọi caller storage/permission bị ảnh hưởng trước sửa; không đổi mặc định toàn bộ app thành `0644`.

**Ca kiểm tra:** stat registry vẫn `0600`, entry `0644`; lỗi write/fsync/rename giữ file cũ; file tạm được dọn. Dùng lại test atomic writer và thêm test service.

## R03 — Status chưa đủ dữ liệu cho Manager báo tải/lỗi và cần mở lại

**Bằng chứng:** callback `onStatus` ở [index.ts](../src/main/index.ts) trả `status: 'running'` cố định; [RunnerStatusData](../src/shared/types.ts) chưa có config revision. `loadURL` tại [window-service.ts](../src/main/window-service.ts) chỉ ghi log khi thất bại.

**Ảnh hưởng:** P5-02/P5-04 không thể phân biệt trang tải lỗi hoặc runner đang dùng config cũ bằng hợp đồng hiện có.

**Hướng sửa:** P5-T1 nối trạng thái navigation/loading/error thực và revision snapshot lúc runner khởi động (có thể dùng `updatedAt` nhất quán) vào status. Manager so với profile mới lưu; không kết nối được thì unknown. Không đổi “đã spawn” thành “đang chạy thành công”.

**Ca kiểm tra:** tải thành công, load failure, đang tải; lưu profile khi runner mở tạo restartRequired; khởi động lại xóa cờ; socket timeout giữ unknown. Kiểm tra trên handler thật, không chỉ type.

## R04 — Tạo lại profile có thể dùng ID của session đã giữ

**Bằng chứng:** `ProfileManager.deleteProfile` trong [profile-manager.ts](../src/main/profile-manager.ts) chỉ gỡ registry và giữ dữ liệu trên đĩa; `createProfile` chỉ kiểm tra ID trùng trong registry, không kiểm tra thư mục dữ liệu còn lại.

**Ảnh hưởng:** workflow P5-07 xóa profile rồi tạo lại cùng tên/ID có thể gắn profile mới với phiên đăng nhập cũ, trái yêu cầu không tự tái sử dụng ID.

**Hướng sửa:** P5-T2 kiểm tra ID đã có dữ liệu khi cấp ID tự động hoặc ID chỉ định; chọn ID mới cho trường hợp tự sinh, từ chối ID chỉ định đã giữ session. Không xóa session để giải quyết trùng tên. Workflow Manager đợi dừng runner trước gọi xóa registry; hành động xóa session tách riêng và xác nhận native.

**Ca kiểm tra:** tạo A, đặt marker session, xóa giữ dữ liệu, tạo cùng tên phải có ID khác; ID chỉ định cũ bị từ chối; marker còn nguyên; shutdown timeout không gọi delete.

## R05 — Timeout thử XPath chưa dọn request và listener ở main

**Bằng chứng:** callback `onTestXPath` trong [index.ts](../src/main/index.ts) thêm `pendingXPathTests` và listener `once('did-start-navigation')`. Khi response thành công, map được xóa nhưng listener chưa được gỡ; timeout 5000 ms trong [runner-control.ts](../src/main/runner-control.ts) chỉ trả lỗi socket/nhả cờ pending, không hủy Promise/map ở main.

**Ảnh hưởng:** Manager bấm thử lặp khi preload không trả lời có thể tích lũy pending request/listener; một test thành công vẫn để listener chờ navigation. Đây là kết luận từ vòng đời code, chưa phải phép đo memory leak runtime.

**Hướng sửa:** P5-T4 quy tụ kết thúc request vào cleanup idempotent: gỡ map, timer, navigation/close listener ở cả success, lỗi, timeout, navigation và đóng cửa sổ. Đồng bộ timeout socket với hủy tác vụ main; response muộn/document cũ bị bỏ. Navigation chỉ hủy khi đổi document liên quan, không vì iframe không liên quan.

**Ca kiểm tra:** fake timer cho nhiều request timeout, request thành công liên tiếp, đóng/nav trong khi chờ và late response; sau mỗi ca pending về 0 và listener count về mức ban đầu, không đổi baseline/attention. Bổ sung test đường main tích hợp vì test socket callback giả không bao phủ map này.

## R06 — `xpath:error` và `xpath:test-result` thiếu validation tương đương `xpath:state`

**Bằng chứng:** các handler trong [index.ts](../src/main/index.ts) kiểm tra mainFrame, nhưng đọc trực tiếp `errData.type`, `errData.message`, `payload.requestId` và resolve `payload.result`; chưa kiểm tra null/schema/origin như handler `xpath:state`.

**Ảnh hưởng:** Manager không nên tin result chưa validate; payload null có thể làm handler ném lỗi, response sai mode/status/preview có thể đi vào UI. Chưa thực hiện khai thác qua website; đây là thiếu validation tại ranh giới IPC.

**Hướng sửa:** P5-T4 kiểm tra object không null, sender WebContents/main frame/origin, request ID đang chờ, mode/selector tương ứng, status/count/preview hợp lệ trước sử dụng. Duy trì giới hạn preview 500, số nguyên an toàn, không nhận dữ liệu từ document cũ. Lỗi hiển thị an toàn bằng textContent.

**Ca kiểm tra:** null/array/sai mode/count/preview quá dài, origin/frame lạ, ID sai và response muộn đều bị từ chối; result hợp lệ đi đúng form và không sửa config/baseline.

## Thứ tự xử lý khi được yêu cầu triển khai

R01/R02 nằm trong phase 4; R03/R04 ở bước nền tảng Manager; R05/R06 trước khi nối nút thử XPath. Trước sửa phải cập nhật graph và chạy impact cho symbol liên quan theo AGENTS.md; rủi ro HIGH/CRITICAL phải báo, UNKNOWN phải kiểm tra thêm. Sau sửa chạy ca hồi quy, `npm run typecheck`, `npm test`, `npm run build`; trước commit chạy detect_changes đầy đủ. Chỉ đóng mục lỗi khi có bằng chứng kiểm tra thực tế.
