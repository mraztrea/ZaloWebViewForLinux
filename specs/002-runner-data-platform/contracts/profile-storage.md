# Interface Contract: Quản lý và Lưu trữ Profile (Profile Storage)

**Tệp**: `specs/002-runner-data-platform/contracts/profile-storage.md`
**Phạm vi**: Main Process — `src/main/profile-manager.ts`

---

## 1. Mô tả Tổng quan
Module `ProfileManager` chịu trách nhiệm toàn bộ việc đọc, xác thực, ghi nguyên tử, tạo mới, chỉnh sửa và xóa các cấu hình Profile trong hệ thống. Module cũng cung cấp API đọc/ghi trạng thái cửa sổ `window-state.json` cho từng runner.

---

## 2. Đường dẫn Dữ liệu (XDG Base Directories)

```typescript
function resolveConfigDir(): string;
// Trả về: $XDG_CONFIG_HOME/zaloview nếu XDG_CONFIG_HOME là đường dẫn tuyệt đối;
// ngược lại fallback về path.join(os.homedir(), '.config', 'zaloview')

function resolveDataDir(): string;
// Trả về: $XDG_DATA_HOME/zaloview nếu XDG_DATA_HOME là đường dẫn tuyệt đối;
// ngược lại fallback về path.join(os.homedir(), '.local', 'share', 'zaloview')

function resolveRegistryPath(): string;
// Trả về: path.join(resolveConfigDir(), 'profiles.json')

function resolveProfileDataDir(profileId: string): string;
// Trả về: path.join(resolveDataDir(), 'profiles', profileId)

function resolveWindowStatePath(profileId: string): string;
// Trả về: path.join(resolveProfileDataDir(profileId), 'window-state.json')
```

---

## 3. Giao diện Lập trình (API Specification)

```typescript
export interface IProfileManager {
  /**
   * Đọc và xác thực toàn bộ danh sách profile từ profiles.json.
   * Nếu tệp chưa tồn tại: trả về mảng rỗng [] (không tự ý ghi tệp).
   * Nếu tệp hỏng JSON hoặc sai schemaVersion: ném ngoại lệ ProfileRegistryCorruptError.
   */
  loadRegistry(): ProfileRegistry;

  /**
   * Lấy cấu hình của một profile theo ID.
   * Trả về undefined nếu không tìm thấy.
   */
  getProfile(id: string): Profile | undefined;

  /**
   * Tạo mới một profile.
   * Tự động sinh ID an toàn nếu chưa có hoặc từ tên (hỗ trợ tiếng Việt không dấu slug).
   * Gán createdAt và updatedAt theo thời gian UTC hiện tại.
   * Thực hiện ghi nguyên tử (atomic write) vào profiles.json.
   */
  createProfile(params: CreateProfileParams): Profile;

  /**
   * Cập nhật thông tin một profile hiện có.
   * Giữ nguyên createdAt, cập nhật updatedAt.
   * Thực hiện ghi nguyên tử vào profiles.json.
   */
  updateProfile(id: string, updates: UpdateProfileParams): Profile;

  /**
   * Xóa một profile khỏi danh sách.
   * Chỉ thực hiện khi runner của profile đó đã dừng.
   * Mặc định giữ lại dữ liệu đăng nhập và session trong thư mục userData.
   */
  deleteProfile(id: string): void;

  /**
   * Đọc trạng thái hiển thị cửa sổ của profile.
   * Trả về kích thước mặc định (1024x768) nếu tệp chưa tồn tại.
   */
  loadWindowState(profileId: string): WindowState;

  /**
   * Lưu trạng thái hiển thị cửa sổ của profile vào window-state.json (atomic write).
   * Không chạm vào profiles.json.
   */
  saveWindowState(profileId: string, state: WindowState): void;
}
```

---

## 4. Cơ chế Ghi Nguyên tử (Atomic Write Protocol)

1. Kiểm tra và đảm bảo thư mục đích tồn tại với quyền `0700`.
2. Tạo tệp tạm thời trong cùng thư mục với tên dạng:
   `${targetPath}.tmp.${process.pid}.${Date.now()}`
3. Mở tệp với cờ ghi độc quyền và quyền hạn `0600` (`fs.openSync(tmpPath, 'w', 0o600)`).
4. Ghi nội dung JSON đã định dạng (`JSON.stringify(data, null, 2)`).
5. Đồng bộ dữ liệu từ bộ đệm hệ điều hành xuống đĩa vật lý (`fs.fsyncSync(fd)`).
6. Đóng tệp descriptor (`fs.closeSync(fd)`).
7. Sử dụng thao tác đổi tên nguyên tử POSIX (`fs.renameSync(tmpPath, targetPath)`).
8. Nếu có bất kỳ lỗi nào xảy ra trong các bước trên: xóa tệp tạm thời nếu còn tồn tại, ném ngoại lệ rõ ràng và bảo toàn tệp gốc.

---

## 5. Danh mục Mã lỗi & Ngoại lệ

- `ProfileRegistryCorruptError`: Ném ra khi tệp `profiles.json` tồn tại nhưng không thể parse cú pháp JSON hoặc có `schemaVersion !== 1`.
- `ProfileValidationError`: Ném ra khi dữ liệu đầu vào vi phạm các ràng buộc kiểu (URL không hợp lệ, ID chứa ký tự lạ, interval nằm ngoài dải 1000..60000 ms).
- `ProfileNotFoundError`: Ném ra khi yêu cầu thao tác trên một profile không tồn tại.
- `ProfileDuplicateIdError`: Ném ra khi cố gắng tạo profile với ID đã tồn tại trong hệ thống.
