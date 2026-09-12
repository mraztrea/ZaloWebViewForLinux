# Feature Specification: XPath Observer và Quản lý Trạng thái Quan sát (XPath Observer & State Engine)

**Feature Branch**: `003-xpath-observer-state`

**Created**: 2026-09-12

**Status**: Draft

**Input**: User description: "Đọc tài liệu trong docs và thực hiện phase 2 trong tài liệu docs/phased_implementation_plan.md"

---

## Overview

Tính năng này hiện thực hóa **Phase 2: XPath observer và so sánh trạng thái** (chi tiết tại Task 4 của kế hoạch kỹ thuật) trong hệ thống ZaloWebView trên Linux. Trọng tâm của tính năng là xây dựng một công cụ quan sát DOM chính xác, an toàn và tiết kiệm tài nguyên bên trong môi trường trang web đang chạy, trích xuất dữ liệu thông báo theo 3 chế độ chuyên biệt, theo dõi và so sánh sự thay đổi theo chuỗi thời gian (baseline tracking) mà không tạo cảnh báo giả, đồng thời cung cấp khả năng thử nghiệm bộ chọn XPath trực tiếp trên phiên đăng nhập thực tế của profile.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Quan sát DOM tự động theo ba chế độ thông báo (Priority: P1)

Là người dùng quản lý tài khoản web (như Zalo hoặc dịch vụ tin nhắn), tôi muốn ứng dụng tự động theo dõi các thay đổi trên giao diện web bằng bộ chọn XPath theo các chế độ chuyên biệt (sự tồn tại, số lượng huy hiệu, hoặc nội dung văn bản), để phát hiện kịp thời khi có tin nhắn mới hoặc sự kiện cần xử lý.

**Why this priority**: Đây là nền tảng cốt lõi của hệ thống phát hiện thông báo. Nếu không trích xuất và phân tích DOM chính xác theo từng chế độ, hệ thống sẽ không thể phát hiện tin nhắn hoặc sẽ liên tục đưa ra thông báo sai lệch.

**Independent Test**: Cung cấp một trang web thử nghiệm với các phần tử DOM thay đổi; cấu hình lần lượt từng chế độ (`existence`, `badge_count`, `text_content`) và xác minh hệ thống phát hiện đúng thời điểm trạng thái mới phát sinh mà không phụ thuộc vào hệ thống hiển thị thông báo desktop.

**Acceptance Scenarios**:

1. **Given** profile được cấu hình chế độ `existence` với một bộ chọn XPath hợp lệ, **When** một phần tử tương ứng xuất hiện trong DOM (từ trạng thái không có thành có), **Then** hệ thống ghi nhận sự kiện phát sinh thông báo mới; các thay đổi nội dung chữ bên trong phần tử đó sau khi đã xuất hiện không tạo thêm cảnh báo lặp lại.
2. **Given** profile được cấu hình chế độ `badge_count`, **When** phần tử chứa chữ số hiển thị số lượng tăng lên (ví dụ từ `3` lên `5`, hoặc từ không có thành `1`, hoặc `99+` tương đương giá trị 99), **Then** hệ thống ghi nhận sự kiện tăng số lượng tin nhắn mới.
3. **Given** profile được cấu hình chế độ `badge_count`, **When** phần tử chứa chuỗi không phải số nguyên không âm hợp lệ (ví dụ `abc`, `-1`, `1.5`), **Then** hệ thống phân loại là lỗi dữ liệu thay vì suy đoán hoặc mặc định gán thành số 1.
4. **Given** profile được cấu hình chế độ `text_content`, **When** nội dung văn bản của phần tử sau khi cắt bỏ khoảng trắng hai đầu (`trim`) có sự thay đổi khác với mẫu trước đó và không rỗng, **Then** hệ thống ghi nhận thông tin nội dung mới.
5. **Given** cấu hình của profile có chuỗi bộ chọn XPath rỗng, **When** trang web tải xong hoặc thay đổi cấu hình, **Then** hệ thống tự động tắt toàn bộ cơ chế quan sát DOM và hẹn giờ định kỳ.

---

### User Story 2 - So sánh mẫu trạng thái và cập nhật baseline không gây cảnh báo giả (Priority: P1)

Là người dùng nhận thông báo định kỳ, tôi muốn ứng dụng ghi nhớ chính xác trạng thái gần nhất (baseline) và cập nhật mẫu cả khi số lượng giảm hoặc phần tử biến mất, để tránh nhận cảnh báo rác khi bản thân đang đọc tin nhắn hoặc khi trang web cập nhật lại số liệu.

**Why this priority**: Việc quản lý baseline sai lầm sẽ dẫn đến tình trạng cảnh báo rác (spam alerts) hoặc bỏ sót tin nhắn mới khi số lượng tin giảm rồi tăng lại.

**Independent Test**: Kích thích chuỗi thay đổi giá trị số lượng `5 → 3 → 4` trên DOM; kiểm tra hệ thống chỉ ghi nhận tín hiệu cảnh báo tại bước chuyển từ `3 → 4`, trong khi bước `5 → 3` chỉ cập nhật lại mức cơ sở mà không phát cảnh báo.

**Acceptance Scenarios**:

1. **Given** trạng thái cơ sở đang có số lượng là `5`, **When** người dùng đọc bớt tin nhắn trên website khiến số lượng giảm xuống `3`, **Then** hệ thống cập nhật baseline thành `3` mà không kích hoạt bất kỳ cảnh báo mới nào.
2. **Given** baseline đã được hạ xuống `3`, **When** có tin nhắn mới nâng số lượng lên `4`, **Then** hệ thống phát hiện chính xác mức tăng từ 3 lên 4 và ghi nhận tín hiệu có thông báo mới.
3. **Given** một phần tử thông báo biến mất khỏi DOM, **When** hệ thống quan sát thấy sự biến mất, **Then** baseline được cập nhật về trạng thái rỗng/không tìm thấy mà không phát sinh cảnh báo giả.
4. **Given** cửa sổ runner đang nhận tiêu điểm thao tác (focus) từ người dùng, **When** có sự thay đổi DOM xảy ra, **Then** baseline vẫn được cập nhật liên tục với trạng thái thực tế nhưng không tạo tín hiệu cảnh báo quấy rầy người dùng.
5. **Given** hai chuỗi nội dung văn bản có độ dài vượt quá 500 ký tự và chỉ khác nhau ở các ký tự phía sau vị trí 500, **When** hệ thống so sánh trạng thái trong chế độ `text_content`, **Then** hệ thống vẫn nhận diện được sự thay đổi nội dung đầy đủ dù bản xem trước truyền tải bị giới hạn độ dài.

---

### User Story 3 - Quan sát phản ứng nhanh kết hợp quét định kỳ và phục hồi an toàn (Priority: P2)

Là người dùng duyệt web, tôi muốn việc theo dõi DOM diễn ra nhẹ nhàng, phản ứng ngay lập tức khi giao diện thay đổi nhưng không gây nghẽn hiệu năng (lag) trình duyệt, đồng thời có cơ chế quét bù định kỳ để không bỏ lọt trạng thái khi máy tính vừa phục hồi sau khi ngủ (resume/wake up).

**Why this priority**: Đảm bảo cân bằng tối ưu giữa tính tức thời của thông báo và mức tiêu thụ CPU/bộ nhớ của máy tính người dùng.

**Independent Test**: Thay đổi class và thuộc tính của các phần tử DOM liên tục trong thời gian ngắn; kiểm tra cơ chế gom nhóm (debounce 300 ms) chỉ phát ra một lần đánh giá, kiểm tra việc tự động kích hoạt quét lại khi cửa sổ từ trạng thái ẩn chuyển sang hiển thị.

**Acceptance Scenarios**:

1. **Given** giao diện web liên tục thay đổi cấu trúc hoặc thuộc tính phần tử với tần suất cao, **When** các thay đổi diễn ra dồn dập, **Then** hệ thống gom nhóm xử lý với khoảng trễ 300 ms (debounce) trước khi thực hiện một lần trích xuất XPath duy nhất.
2. **Given** trang web không có sự kiện thay đổi DOM nào trong thời gian dài, **When** đến chu kỳ quét định kỳ (mặc định 3000 ms, cấu hình 1000..60000 ms), **Then** hệ thống thực hiện quét kiểm tra lại để đối soát trạng thái.
3. **Given** máy tính vừa chuyển từ trạng thái tạm ngưng (sleep/suspend) hoạt động trở lại hoặc cửa sổ vừa được hiển thị lại, **When** sự kiện phục hồi diễn ra, **Then** hệ thống ngay lập tức kích hoạt một chu kỳ quét kiểm tra trạng thái DOM.
4. **Given** trang web bắt đầu chuyển hướng (navigation) sang trang mới hoặc tải lại (reload), **When** tài liệu cũ bị gỡ bỏ, **Then** toàn bộ tiến trình theo dõi, bộ hẹn giờ định kỳ và các tác vụ chờ xử lý của tài liệu cũ được giải phóng hoàn toàn, không tạo rò rỉ bộ nhớ hay chạy trùng lặp với tài liệu mới.

---

### User Story 4 - Thử nghiệm bộ chọn XPath trực tiếp trên phiên đăng nhập thực tế (Priority: P2)

Là người quản trị hoặc người dùng đang cấu hình ứng dụng, tôi muốn có tính năng kiểm tra tính đúng đắn của chuỗi XPath trực tiếp trên cửa sổ và tài liệu đang mở của profile đó, để biết chính xác bộ chọn có tìm thấy phần tử hay không và dữ liệu trích xuất hiển thị ra sao mà không làm ảnh hưởng đến cấu hình đang lưu hay kích hoạt cảnh báo thông báo nhầm.

**Why this priority**: Giúp người dùng dễ dàng tinh chỉnh bộ chọn cho từng website (đặc biệt là các website phức tạp như Zalo Web) mà không cần đoán mò hoặc mở công cụ lập trình ngoài.

**Independent Test**: Gửi yêu cầu thử nghiệm XPath tới một runner đang mở; xác minh kết quả trả về đúng dữ liệu trích xuất (hoặc báo lỗi cú pháp / không tìm thấy), kiểm tra rằng trạng thái baseline của bộ giám sát chính không bị thay đổi và không có thông báo nào được phát ra.

**Acceptance Scenarios**:

1. **Given** một profile đang mở cửa sổ đăng nhập, **When** người dùng yêu cầu thử nghiệm một chuỗi XPath và chế độ tương ứng, **Then** hệ thống thực thi việc đánh giá ngay trên tài liệu hiện tại của runner đó và trả về kết quả (khớp với số lượng/đoạn trích dẫn, không khớp, hoặc lỗi cú pháp).
2. **Given** một yêu cầu thử nghiệm XPath đang được xử lý, **When** kết quả đánh giá thành công, **Then** trạng thái cơ sở (baseline) đang theo dõi tự động của runner không bị ghi đè hay xáo trộn, và không có cảnh báo nào được phát ra tới màn hình.
3. **Given** yêu cầu thử nghiệm XPath gửi bộ chọn không hợp lệ hoặc biểu thức trả về giá trị vô hướng (scalar như số hoặc boolean), **Then** hệ thống trả về thông báo lỗi bộ chọn rõ ràng, phân biệt rạch ròi với trường hợp bộ chọn hợp lệ nhưng không tìm thấy phần tử nào.
4. **Given** một yêu cầu thử nghiệm đang chờ kết quả, **When** trang web trong cửa sổ bắt đầu điều hướng sang trang khác hoặc cửa sổ bị đóng trước khi có kết quả, **Then** yêu cầu thử nghiệm bị hủy an toàn và phản hồi lỗi hủy/hết thời gian chờ (timeout tối đa 5 giây).
5. **Given** phần tử khớp với XPath trong chế độ thử nghiệm có thể hiển thị trực quan, **When** thử nghiệm hoàn tất, **Then** hệ thống có thể hiển thị một lớp viền/nền nhận diện tạm thời (highlight overlay) rồi tự động biến mất mà không kích hoạt cảnh báo giả cho bộ giám sát chính.

---

### Edge Cases

- **Bộ chọn XPath trả về kiểu dữ liệu vô hướng (Scalar/Non-Node)**: Ví dụ biểu thức `count(//div)` hoặc `string(//span)`. Hệ thống phải nhận diện đây là lỗi cú pháp/cấu hình (`invalid_selector`), từ chối xử lý và không ngộ nhận là kết quả trích xuất thành công.
- **Phần tử tồn tại trong DOM nhưng bị ẩn bằng CSS (`display: none`, `visibility: hidden`)**: Chế độ `existence` chỉ xác định sự hiện diện trong DOM cây tài liệu. Nếu người dùng muốn bỏ qua các node ẩn, bộ chọn XPath cần chứa điều kiện lọc thuộc tính/class tương ứng.
- **Huy hiệu thông báo chứa ký tự số vượt quá giới hạn an toàn**: Ví dụ một chuỗi số quá lớn vượt quá ngưỡng số nguyên an toàn của hệ thống. Hệ thống phải đánh dấu là lỗi dữ liệu không hợp lệ (`invalid_data`), không gây tràn số.
- **Bộ chọn rỗng**: Khi người dùng xóa trắng chuỗi XPath trong cấu hình, hệ thống lập tức ngắt toàn bộ observer, xóa timer và không gửi thêm bất kỳ thông điệp trạng thái nào.
- **Đụng độ giữa chu kỳ quét định kỳ và thay đổi DOM liên tục**: Khi MutationObserver kích hoạt và đang chờ hết thời gian trễ (debounce 300 ms), nếu bộ hẹn giờ định kỳ đến hạn, hệ thống không thực thi hai lần đánh giá trùng lặp mà tái sử dụng hoặc hoãn chu kỳ quét.
- **Tin nhắn đến rồi biến mất trong chớp mắt**: Nếu một tin nhắn xuất hiện rồi bị xóa đi trước khi chu kỳ render hoặc quét diễn ra, hệ thống chỉ ghi nhận trạng thái tại thời điểm đánh giá thực tế.
- **Trang web chứa iframe khác nguồn (cross-origin iframe)**: Biểu thức XPath tiêu chuẩn không thể truy vấn xuyên qua cây tài liệu của iframe khác nguồn; hệ thống ghi nhận không tìm thấy phần tử trên tài liệu chính một cách minh bạch.
- **Bộ nhớ đệm thông điệp IPC**: Giới hạn tối đa độ dài văn bản trích xuất gửi qua kênh nội bộ là 500 ký tự để bảo vệ hiệu năng bộ nhớ, nhưng việc so sánh nội dung văn bản để phát hiện thay đổi phải thực hiện trước khi cắt ngắn.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống BẮT BUỘC hỗ trợ đánh giá bộ chọn XPath trên phần tử đầu tiên khớp trong tài liệu web chính, phân biệt rõ ràng giữa ba trạng thái: tìm thấy phần tử (`match`), không tìm thấy phần tử (`no_match`), và bộ chọn sai cú pháp/trả về kiểu dữ liệu không hợp lệ (`invalid_selector`).
- **FR-002**: Hệ thống BẮT BUỘC hiện thực hóa đầy đủ 3 chế độ theo dõi thông báo theo đúng đặc tả:
  - `existence`: Trả về trạng thái có hay không có phần tử; chỉ phát tín hiệu cảnh báo khi chuyển đổi từ không có sang có (`false → true`).
  - `badge_count`: Trích xuất số nguyên không âm (cho phép định dạng `99+` chuyển thành 99); phát tín hiệu cảnh báo khi giá trị số lượng tăng so với mẫu trước đó; coi trường hợp không tìm thấy là 0; báo lỗi dữ liệu khi nội dung chữ không thể chuyển đổi thành số nguyên hợp lệ.
  - `text_content`: Trích xuất nội dung văn bản đã chuẩn hóa khoảng trắng (`trim`); phát tín hiệu cảnh báo khi nội dung khác mẫu trước đó và không rỗng.
- **FR-003**: Hệ thống BẮT BUỘC tự động vô hiệu hóa toàn bộ cơ chế giám sát DOM, hủy bộ hẹn giờ định kỳ và hủy các tác vụ trễ đang chờ khi chuỗi bộ chọn XPath là chuỗi rỗng.
- **FR-004**: Hệ thống BẮT BUỘC kết hợp cơ chế giám sát sự kiện DOM thời gian thực (theo dõi thay đổi cấu trúc con, thuộc tính phần tử, và dữ liệu ký tự) với khoảng trễ gom nhóm 300 ms, kèm theo cơ chế quét định kỳ dự phòng với chu kỳ từ 1000 ms đến 60000 ms (mặc định 3000 ms).
- **FR-005**: Hệ thống BẮT BUỘC lưu trữ và cập nhật trạng thái cơ sở (baseline) cho mỗi lần quan sát hợp lệ, bao gồm cả khi số lượng giảm hoặc khi phần tử biến mất khỏi DOM.
- **FR-006**: Hệ thống BẮT BUỘC đảm bảo rằng việc cửa sổ ứng dụng nhận tiêu điểm (focus) hay mất tiêu điểm (blur) tuyệt đối không được xóa hay đặt lại (reset) trạng thái cơ sở DOM.
- **FR-007**: Hệ thống BẮT BUỘC thực hiện so sánh toàn bộ nội dung văn bản trước khi cắt ngắn bản xem trước (preview tối đa 500 ký tự) khi truyền tải dữ liệu giữa các thành phần nội bộ.
- **FR-008**: Hệ thống BẮT BUỘC tự động kích hoạt một lượt quét kiểm tra lại trạng thái DOM ngay khi tài liệu web được hiển thị lại hoặc khi hệ điều hành phục hồi từ trạng thái tạm ngưng (sleep/resume).
- **FR-009**: Hệ thống BẮT BUỘC cung cấp cơ chế lọc trùng lặp lỗi (deduplication) đối với các lỗi bộ chọn hoặc lỗi dữ liệu để tránh ghi log lặp lại liên tục gây quá tải.
- **FR-010**: Hệ thống BẮT BUỘC hỗ trợ tính năng thử nghiệm XPath theo yêu cầu (manual test) trên phiên đăng nhập và tài liệu hiện tại của runner đang chạy thông qua kênh socket nội bộ, với giới hạn thời gian chờ tối đa 5000 ms.
- **FR-011**: Quá trình thử nghiệm XPath thủ công BẮT BUỘC không làm thay đổi cấu hình giám sát đang chạy, không làm thay đổi trạng thái baseline hiện tại, và không kích hoạt bất kỳ cảnh báo chú ý nào cho người dùng.
- **FR-012**: Yêu cầu thử nghiệm XPath BẮT BUỘC bị hủy tự động và an toàn khi trang web bắt đầu điều hướng tải trang mới hoặc khi cửa sổ đóng.
- **FR-013**: Lớp phủ nhận diện tạm thời (highlight overlay) trong quá trình thử nghiệm XPath BẮT BUỘC tự động gỡ bỏ sau thời gian hiển thị ngắn và không được kích hoạt các cảnh báo giả trong cơ chế giám sát tự động.
- **FR-014**: Hệ thống BẮT BUỘC xác thực nguồn gốc và tính hợp lệ của mọi gói tin trao đổi trạng thái và chỉ chấp nhận dữ liệu đến từ khung tài liệu chính (main frame) của đúng profile tương ứng.

---

### Key Entities

- **XPathObservationConfig**: Chứa thông tin cấu hình giám sát gồm chuỗi biểu thức XPath (`selector`), chế độ theo dõi (`mode`: `existence`, `badge_count`, `text_content`), và chu kỳ quét định kỳ dự phòng tính theo mili-giây (`pollIntervalMs`).
- **XPathObservationState**: Đại diện cho ảnh chụp trạng thái DOM tại một thời điểm, bao gồm: chế độ quan sát, cờ phần tử có tồn tại hay không (`hasElement`), giá trị số lượng (`count`), đoạn văn bản trích xuất đã rút gọn (`text`), và cờ đánh dấu trạng thái có đủ điều kiện phát sinh cảnh báo mới hay không (`changedForAlert`).
- **XPathEvaluationResult**: Kết quả trả về từ thao tác đánh giá hoặc thử nghiệm XPath, bao gồm: trạng thái kết quả (`match`, `no_match`, `invalid_selector`, `invalid_data`, `error`), giá trị trích xuất (`count`, `textPreview`), thời gian phản hồi, và thông điệp lỗi chi tiết (nếu có).
- **XPathBaselineRecord**: Bản ghi lưu trữ trạng thái hợp lệ gần nhất trong bộ nhớ của tiến trình để làm mốc so sánh cho các lần quan sát tiếp theo.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% các trường hợp trích xuất số lượng huy hiệu (`badge_count`) theo các mẫu hợp lệ (`3`, `99+`, `0`) và không hợp lệ (`abc`, `-1`, `1.5`) được phân loại chính xác theo đúng quy tắc định sẵn, không có trường hợp nào đoán bừa giá trị thành 1.
- **SC-002**: Chuỗi biến động số lượng giảm rồi tăng `5 → 3 → 4` phát hiện chính xác lần tăng cuối cùng từ 3 lên 4 trong 100% các lần kiểm thử tự động, không phát sinh cảnh báo giả ở bước giảm từ 5 xuống 3.
- **SC-003**: Thời gian phản hồi kể từ khi DOM thay đổi cho đến khi trạng thái được phân tích và sẵn sàng truyền tải không vượt quá 350 ms (bao gồm 300 ms debounce).
- **SC-004**: Khi cấu hình XPath bị xóa rỗng, tần suất tiêu thụ CPU của tác vụ giám sát DOM đưa về 0% (ngắt hoàn toàn observer và timer).
- **SC-005**: Thao tác thử nghiệm XPath thủ công trên runner đang mở phản hồi kết quả trong vòng dưới 200 ms đối với các trang web có cấu trúc thông thường, và tự động hết hạn chính xác sau 5000 ms nếu trang bị treo.
- **SC-006**: Toàn bộ các kiểm thử đơn vị và tích hợp cho bộ trích xuất XPath, bộ quan sát DOM và kênh điều khiển thử nghiệm đạt tỷ lệ thành công 100% trên môi trường Linux.

---

## Assumptions

- **Môi trường DOM**: Website chạy trong cửa sổ Electron với Chromium hỗ trợ đầy đủ các API tiêu chuẩn `document.evaluate`, `MutationObserver`, và `document.visibilityState`.
- **Phạm vi bảo mật**: Trang web tải từ mạng bên ngoài không có quyền gọi trực tiếp các hàm quản trị hệ thống hoặc can thiệp vào tiến trình chính ngoài các kênh được bảo vệ bởi preload script có `contextIsolation` và `sandbox`.
- **Phạm vi chức năng Phase 2**: Trách nhiệm của Phase 2 tập trung vào việc quan sát DOM, trích xuất dữ liệu, so sánh baseline và kiểm tra selector thủ công. Các hành vi xử lý giao diện người dùng desktop như rung nhấp nháy thanh tác vụ (taskbar flash), thay đổi biểu tượng khay hệ thống (tray icon), hiển thị badge đếm số trên thanh taskbar, và cửa sổ thông báo native (desktop notification) thuộc về **Phase 3** (Task 5).
- **Biểu thức XPath phía người dùng**: Biểu thức XPath do người dùng cung cấp được kỳ vọng trỏ tới một phần tử cụ thể trên DOM. Nếu website thay đổi cấu trúc mã nguồn, người dùng sẽ cần cập nhật lại chuỗi XPath tương ứng bằng công cụ thử nghiệm được cung cấp.
