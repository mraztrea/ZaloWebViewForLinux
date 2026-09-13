# Hướng dẫn kiểm chứng nhanh: Manager Phase 5

**Ngày**: 2026-09-13 | **Nhánh**: `007-phase5-manager` | **Hợp đồng**: [contracts/manager-api.contract.md](contracts/manager-api.contract.md)

Tài liệu này chỉ dẫn kiểm chứng đầu cuối (không chứa code triển khai). Chi tiết logic xem [plan.md](plan.md); mô hình dữ liệu xem [data-model.md](data-model.md).

## Điều kiện trước

- Checkout sạch, `npm ci`, `npm run typecheck`, `npm run build`, `npm test` đều xanh.
- Môi trường Linux desktop thật (ghi rõ distro/desktop/version, Electron/Chromium, backend, extension tray/dock, notification service, DND).

## Kịch bản 1: CRUD và tìm kiếm (P5-02, P5-03, P5-10)

1. Mở Manager khi chưa có profile → phân biệt loading / rỗng / lỗi.
2. Thêm profile hợp lệ → xuất hiện trong danh sách, form chỉ đóng sau khi lưu xong.
3. Sửa mọi trường (kể cả tắt hết checkbox) → đọc lại khớp, ID và thời điểm tạo không đổi.
4. Tìm theo một phần tên/địa chỉ → chỉ kết quả phù hợp, dữ liệu gốc nguyên vẹn.
5. Đặt tên chứa chuỗi giống mã đánh dấu → hiển thị nguyên văn, không thực thi.
6. Thao tác toàn bộ bằng bàn phím (Tab/Escape/focus) + đổi theme hệ thống/thủ công.

**Kết quả mong đợi**: Mọi bước khớp [spec.md](spec.md) User Story 1; lưu lỗi giữ nguyên form.

## Kịch bản 2: Runner độc lập và cảnh báo (P5-02, P5-05)

1. Mở runner A và B từ Manager → hai phiên độc lập.
2. Tạo cảnh báo riêng → xóa cảnh báo A không ảnh hưởng B.
3. Đóng Manager → runner vẫn chạy; mở lại → trạng thái hiển thị lại.
4. Mở lặp cùng profile → chỉ restore cửa sổ hiện có.
5. Ngắt liên lạc runner → trạng thái `unknown` (không báo `stopped`).

## Kịch bản 3: Icon, shortcut, XPath (P5-04, P5-06, P5-09)

1. Chọn icon file + tải icon từ website (kể cả URL tương đối) → dùng được, lỗi có fallback + lý do.
2. Bật shortcut rồi lưu → hai kết quả lưu/sync báo riêng; sync lỗi → thử lại không tạo trùng.
3. Sửa config khi runner đang dùng bản cũ → hiện "cần mở lại".
4. Thử XPath khi runner chưa mở → có hướng dẫn; thử đủ 6 loại kết quả → phân biệt rõ; xác nhận config/baseline/cảnh báo không đổi.

## Kịch bản 4: Xóa an toàn (P5-07, P5-08)

1. Xóa khi runner còn chạy/`unknown` → bị chặn, dữ liệu nguyên vẹn.
2. Dừng thật → xóa → shortcut bị gỡ, session còn lại.
3. Tạo mới cùng tên → không nhận phiên cũ.
4. Xóa phiên riêng: hủy → không đổi; xác nhận → chỉ đúng phiên mục tiêu bị xóa.

## Kịch bản 5: Chuỗi đầu cuối + fault (P5-11)

Chạy đủ chuỗi: thêm A/B → mở/đăng nhập riêng → thử XPath → nhận cảnh báo → focus clear → shortcut → mở lặp → sửa → xóa giữ session. Sau đó thử: tệp JSON hỏng, lỗi ghi/mạng, runner crash, socket cũ, tháo màn hình.

**Kết quả mong đợi**: Dữ liệu người dùng an toàn mọi fault; A focus không xóa badge B.

## Kịch bản 6: Phân phối và báo cáo (P5-12)

1. Lặp lại Kịch bản 1–5 trên bản phân phối (đường cài đặt, preload/assets/runtime, sandbox thật).
2. Điền ma trận desktop trong spec cho từng môi trường truy cập được; môi trường không truy cập được giữ "Chưa kiểm thử".
3. Ghi `docs/verification.md`: mã P4/P5, commit, phiên bản, lệnh/thao tác, kết quả, bằng chứng.

## Lệnh kiểm chứng tự động (từng nhóm việc)

- P5-T1: `npm test -- tests/manager.test.ts tests/runner-control.test.ts tests/build.test.ts`
- P5-T2: `npm test -- tests/manager.test.ts tests/profile-manager.test.ts tests/runner-control.test.ts tests/desktop-service.test.ts`
- P5-T3: `npm test -- tests/icon-fetcher.test.ts tests/manager.test.ts`
- P5-T4: `npm test -- tests/manager.test.ts tests/runner-control-xpath.test.ts tests/xpath-evaluator.test.ts`
- Luôn kèm: `npm run typecheck` và `npm run build`
