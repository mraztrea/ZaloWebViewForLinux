/**
 * Manager Dashboard Renderer Application (US1: quản lý profile tập trung)
 * Chạy trong sandbox cô lập (sandbox: true, nodeIntegration: false).
 * Mọi dữ liệu profile render bằng textContent — không dùng innerHTML.
 */
import type { Profile } from '../../shared/types';

type Bridge = Window['zaloview'];

interface ManagerState {
  profiles: Profile[];
  filter: string;
  loading: boolean;
  error: string | null;
}

const state: ManagerState = { profiles: [], filter: '', loading: true, error: null };
let lastFocused: HTMLElement | null = null;
let formVersion = 0;
let reloadVersion = 0;
let iconRequestVersion = 0;
let xpathRequestVersion = 0;
let statusTimer: ReturnType<typeof setTimeout> | undefined;
let refreshingStatus = false;
let disposed = false;
const DEFAULT_ICON = '../../assets/default-icon.png';

function bridge(): Bridge | null {
  return typeof window !== 'undefined' && window.zaloview ? window.zaloview : null;
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Không tìm thấy phần tử #${id}.`);
  return node as T;
}

function setStatus(message: string, kind: 'loading' | 'error' | 'info'): void {
  const bar = el('status-bar');
  bar.textContent = message;
  bar.dataset.kind = kind;
}

function filteredProfiles(): Profile[] {
  const query = state.filter.trim().toLowerCase();
  if (!query) return state.profiles;
  return state.profiles.filter(
    (p) => p.name.toLowerCase().includes(query) || p.url.toLowerCase().includes(query)
  );
}

function makeCard(profile: Profile): HTMLElement {
  const card = document.createElement('article');
  card.className = 'profile-card';
  card.dataset.profileId = profile.id;
  card.dataset.runnerState = 'unknown';

  const cardHeader = document.createElement('div');
  cardHeader.className = 'card-header';

  const icon = document.createElement('img');
  icon.className = 'profile-icon';
  icon.alt = '';
  icon.src = profile.iconPath?.startsWith('/')
    ? `file://${profile.iconPath.split('/').map(encodeURIComponent).join('/')}`
    : profile.iconPath?.startsWith('file://') ? profile.iconPath : DEFAULT_ICON;
  icon.onerror = () => {
    icon.onerror = null;
    icon.src = DEFAULT_ICON;
  };

  const titleGroup = document.createElement('div');
  titleGroup.className = 'card-title-group';

  const title = document.createElement('h3');
  title.className = 'profile-name';
  title.textContent = profile.name;

  const url = document.createElement('p');
  url.className = 'profile-url';
  url.textContent = profile.url;

  titleGroup.append(title, url);
  cardHeader.append(icon, titleGroup);

  const status = document.createElement('p');
  status.className = 'profile-status';
  status.dataset.role = 'runner-status';
  status.textContent = 'Trạng thái runner: chưa kiểm tra';

  const actions = document.createElement('div');
  actions.className = 'profile-actions';

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'btn btn-small btn-open';
  openBtn.dataset.action = 'open';
  openBtn.textContent = 'Mở';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn btn-small';
  editBtn.dataset.action = 'edit';
  editBtn.textContent = 'Sửa';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn btn-small btn-attention';
  clearBtn.dataset.action = 'clear-attention';
  clearBtn.textContent = 'Xóa cảnh báo';
  clearBtn.disabled = true;
  clearBtn.addEventListener('click', async () => {
    clearBtn.disabled = true;
    try {
      await bridge()?.clearAttention(profile.id);
      await refreshRunnerStates();
    } catch (err: unknown) {
      status.textContent = `Xóa cảnh báo thất bại: ${(err as Error).message}`;
      clearBtn.disabled = false;
    }
  });

  const sessionBtn = document.createElement('button');
  sessionBtn.type = 'button';
  sessionBtn.className = 'btn btn-small btn-session';
  sessionBtn.dataset.action = 'delete-session';
  sessionBtn.textContent = 'Xóa phiên';
  sessionBtn.title = 'Xóa dữ liệu phiên đăng nhập (hành động riêng, cần xác nhận)';

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn-small btn-danger';
  deleteBtn.dataset.action = 'delete';
  deleteBtn.textContent = 'Xóa';

  openBtn.addEventListener('click', () => void onOpenProfile(profile.id, status));
  editBtn.addEventListener('click', () => openForm(profile));
  deleteBtn.addEventListener('click', () => void onDeleteProfile(profile));
  sessionBtn.addEventListener('click', () => void onDeleteSession(profile));

  actions.append(openBtn, editBtn, clearBtn, sessionBtn, deleteBtn);
  card.append(cardHeader, status, actions);
  return card;
}

function renderList(): void {
  const list = el('profile-list');
  list.textContent = '';
  if (state.loading) {
    setStatus('Đang tải danh sách profile…', 'loading');
    return;
  }
  if (state.error) {
    setStatus(`Lỗi đọc dữ liệu: ${state.error}`, 'error');
    return;
  }
  const items = filteredProfiles();
  if (state.profiles.length === 0) {
    setStatus('Chưa có profile nào. Nhấn “Thêm Profile” để bắt đầu.', 'info');
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const emptyTitle = document.createElement('h3');
    emptyTitle.className = 'empty-state-title';
    emptyTitle.textContent = 'Chưa có Profile nào';
    const emptyText = document.createElement('p');
    emptyText.className = 'empty-state-text';
    emptyText.textContent = 'Nhấn nút “+ Thêm Profile” ở trên để tạo phiên Webview độc lập đầu tiên.';
    empty.append(emptyTitle, emptyText);
    list.append(empty);
    return;
  }
  if (items.length === 0) {
    setStatus('Không tìm thấy profile phù hợp.', 'info');
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const emptyTitle = document.createElement('h3');
    emptyTitle.className = 'empty-state-title';
    emptyTitle.textContent = 'Không tìm thấy kết quả';
    const emptyText = document.createElement('p');
    emptyText.className = 'empty-state-text';
    emptyText.textContent = `Không có profile nào khớp với từ khóa “${state.filter}”.`;
    empty.append(emptyTitle, emptyText);
    list.append(empty);
    return;
  }
  setStatus(`Hiển thị ${items.length}/${state.profiles.length} profile.`, 'info');
  for (const profile of items) {
    list.append(makeCard(profile));
  }
}

async function reloadProfiles(): Promise<void> {
  const version = ++reloadVersion;
  const api = bridge();
  state.loading = true;
  state.error = null;
  renderList();
  if (!api) {
    state.loading = false;
    state.error = 'Cầu nối Manager chưa sẵn sàng.';
    renderList();
    return;
  }
  try {
    const profiles = await api.getProfiles();
    if (version === reloadVersion) state.profiles = profiles;
  } catch (err: unknown) {
    if (version === reloadVersion) state.error = (err as Error).message;
  } finally {
    if (version === reloadVersion) {
      state.loading = false;
      renderList();
    }
  }
  // Chỉ làm mới trạng thái runner khi trang đang hiển thị; không poll nền.
  if (version === reloadVersion && !document.hidden) {
    void refreshRunnerStates();
  }
}

function describeRunnerState(stateValue: string): string {
  if (stateValue === 'running') return 'Trạng thái runner: đang chạy';
  if (stateValue === 'stopped') return 'Trạng thái runner: đã dừng';
  return 'Trạng thái runner: chưa xác định';
}

async function refreshRunnerStates(): Promise<void> {
  clearTimeout(statusTimer);
  const api = bridge();
  if (!api || document.hidden || disposed || refreshingStatus) return;
  refreshingStatus = true;
  const cards = Array.from(document.querySelectorAll<HTMLElement>('.profile-card'));
  try {
  await Promise.all(
    cards.map(async (card) => {
      const id = card.dataset.profileId;
      const node = card.querySelector('[data-role="runner-status"]');
      if (!id || !node) return;
      try {
        const status = await api.getRunnerStatus(id);
        const data = status.data;
        const profile = state.profiles.find((p) => p.id === id);
        const messages = [describeRunnerState(status.state)];
        let runnerState: string = status.state;
        if (data?.status === 'starting') {
          messages[0] = 'Trạng thái runner: đang khởi động';
          runnerState = 'starting';
        }
        if (data?.status === 'error') {
          messages.push(`Lỗi: ${data.error ?? 'không tải được trang'}`);
          runnerState = 'error';
        }
        if (status.state === 'running') {
          if (!data?.configRevision) {
            messages.push('Chưa xác định có cần mở lại');
            card.dataset.configOutdated = 'false';
          } else if (data.configRevision !== profile?.updatedAt) {
            messages.push('Cấu hình cũ — cần mở lại runner');
            card.dataset.configOutdated = 'true';
          } else {
            card.dataset.configOutdated = 'false';
          }
          messages.push(data?.attention?.active ? `Có cảnh báo (${data.attention.count})` : 'Không có cảnh báo');
        } else {
          card.dataset.configOutdated = 'false';
        }
        card.dataset.runnerState = runnerState;
        card.dataset.hasAttention = data?.attention?.active ? 'true' : 'false';
        node.textContent = messages.join('. ');
        const clearBtn = card.querySelector<HTMLButtonElement>('[data-action="clear-attention"]');
        if (clearBtn) clearBtn.disabled = status.state !== 'running' || !data?.attention?.active;
      } catch {
        card.dataset.runnerState = 'unknown';
        card.dataset.hasAttention = 'false';
        card.dataset.configOutdated = 'false';
        node.textContent = describeRunnerState('unknown');
      }
    })
  );
  } finally {
    refreshingStatus = false;
    if (!document.hidden && !disposed) statusTimer = setTimeout(() => void refreshRunnerStates(), 3000);
  }
}

interface FormValues {
  id: string;
  name: string;
  url: string;
  iconPath?: string;
  userAgent?: string;
  xpathConfig: Profile['xpathConfig'];
  desktopConfig: Profile['desktopConfig'];
}

function readForm(): FormValues {
  const intervalRaw = Number(el<HTMLInputElement>('field-interval').value);
  return {
    id: el<HTMLInputElement>('field-id').value,
    name: el<HTMLInputElement>('field-name').value.trim(),
    url: el<HTMLInputElement>('field-url').value.trim(),
    iconPath: el<HTMLInputElement>('field-icon').value.trim() || undefined,
    userAgent: el<HTMLInputElement>('field-useragent').value.trim() || undefined,
    xpathConfig: {
      selector: el<HTMLInputElement>('field-xpath').value.trim(),
      mode: el<HTMLSelectElement>('field-mode').value as Profile['xpathConfig']['mode'],
      pollIntervalMs: Number.isFinite(intervalRaw) ? Math.floor(intervalRaw) : 3000
    },
    desktopConfig: {
      flashTaskbar: el<HTMLInputElement>('check-flash').checked,
      showTaskbarBadge: el<HTMLInputElement>('check-badge').checked,
      minimizeToTray: el<HTMLInputElement>('check-tray').checked,
      showDesktopNotification: el<HTMLInputElement>('check-notify').checked,
      createDesktopShortcut: el<HTMLInputElement>('check-shortcut').checked
    }
  };
}

function fillForm(profile: Profile | null): void {
  el<HTMLInputElement>('field-id').value = profile?.id ?? '';
  el<HTMLInputElement>('field-name').value = profile?.name ?? '';
  el<HTMLInputElement>('field-url').value = profile?.url ?? '';
  el<HTMLInputElement>('field-icon').value = profile?.iconPath ?? '';
  const uaField = el<HTMLInputElement>('field-useragent');
  uaField.value = profile?.userAgent ?? '';
  uaField.disabled = profile !== null;
  el<HTMLInputElement>('field-xpath').value = profile?.xpathConfig.selector ?? '';
  el<HTMLSelectElement>('field-mode').value = profile?.xpathConfig.mode ?? 'badge_count';
  el<HTMLInputElement>('field-interval').value = String(profile?.xpathConfig.pollIntervalMs ?? 3000);
  const desktop = profile?.desktopConfig;
  el<HTMLInputElement>('check-flash').checked = desktop?.flashTaskbar ?? true;
  el<HTMLInputElement>('check-badge').checked = desktop?.showTaskbarBadge ?? true;
  el<HTMLInputElement>('check-tray').checked = desktop?.minimizeToTray ?? false;
  el<HTMLInputElement>('check-notify').checked = desktop?.showDesktopNotification ?? true;
  el<HTMLInputElement>('check-shortcut').checked = desktop?.createDesktopShortcut ?? true;
  el('dialog-title').textContent = profile ? `Sửa Profile: ${profile.name}` : 'Thêm Profile';
  hideFormError();
  hideXPathResult();
  hideIconStatus();
}

function showFormError(message: string): void {
  const box = el('form-error');
  box.textContent = message;
  box.hidden = false;
}

function hideFormError(): void {
  const box = el('form-error');
  box.textContent = '';
  box.hidden = true;
}

function showXPathResult(message: string): void {
  const box = el('xpath-result');
  box.textContent = message;
  box.hidden = false;
}

function hideXPathResult(): void {
  const box = el('xpath-result');
  box.textContent = '';
  box.hidden = true;
}

function showIconStatus(message: string): void {
  const box = el('icon-status');
  box.textContent = message;
  box.hidden = false;
}

function hideIconStatus(): void {
  const box = el('icon-status');
  box.textContent = '';
  box.hidden = true;
}

async function onChooseIcon(): Promise<void> {
  const version = formVersion;
  const request = ++iconRequestVersion;
  const api = bridge();
  if (!api) {
    showIconStatus('Cầu nối Manager chưa sẵn sàng.');
    return;
  }
  showIconStatus('Đang mở hộp chọn file…');
  try {
    const result = await api.chooseIcon();
    if (version !== formVersion || request !== iconRequestVersion) return;
    if (!result) {
      hideIconStatus();
      return;
    }
    el<HTMLInputElement>('field-icon').value = result.path;
    showIconStatus(result.fallback ? `Dùng biểu tượng dự phòng: ${result.reason ?? ''}` : 'Đã chọn biểu tượng.');
  } catch (err: unknown) {
    if (version !== formVersion || request !== iconRequestVersion) return;
    showIconStatus(`Chọn biểu tượng thất bại: ${(err as Error).message}`);
  }
}

async function onFetchIcon(profileUrl: string): Promise<void> {
  const version = formVersion;
  const request = ++iconRequestVersion;
  const isCurrent = () => version === formVersion && request === iconRequestVersion
    && profileUrl === el<HTMLInputElement>('field-url').value.trim();
  const api = bridge();
  if (!api) {
    showIconStatus('Cầu nối Manager chưa sẵn sàng.');
    return;
  }
  try {
    new URL(profileUrl);
  } catch {
    showIconStatus('Địa chỉ website chưa hợp lệ nên không thể tải icon.');
    return;
  }
  showIconStatus('Đang tải biểu tượng từ website…');
  try {
    const result = await api.fetchIcon(profileUrl);
    if (!isCurrent()) return;
    el<HTMLInputElement>('field-icon').value = result.path;
    showIconStatus(result.fallback ? `Dùng biểu tượng dự phòng: ${result.reason ?? ''}` : 'Đã tải biểu tượng.');
  } catch (err: unknown) {
    if (!isCurrent()) return;
    showIconStatus(`Tải biểu tượng thất bại: ${(err as Error).message}`);
  }
}

function openForm(profile: Profile | null): void {
  formVersion++;
  lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  fillForm(profile);
  const dialog = el<HTMLDialogElement>('profile-dialog');
  if (!dialog.open) dialog.showModal();
  el<HTMLInputElement>('field-name').focus();
}

function closeForm(): void {
  formVersion++;
  const dialog = el<HTMLDialogElement>('profile-dialog');
  if (dialog.open) dialog.close();
  const id = el<HTMLInputElement>('field-id').value;
  const target = lastFocused?.isConnected ? lastFocused
    : document.querySelector<HTMLElement>(`[data-profile-id="${id}"] [data-action="edit"]`) ?? el('btn-add-profile');
  target.focus();
}

async function onSaveForm(): Promise<void> {
  const version = formVersion;
  const api = bridge();
  if (!api) {
    showFormError('Cầu nối Manager chưa sẵn sàng.');
    return;
  }
  const values = readForm();
  const saveBtn = el<HTMLButtonElement>('btn-save');
  saveBtn.disabled = true;
  try {
    const input = values.id
      ? { id: values.id, name: values.name, url: values.url, iconPath: values.iconPath, xpathConfig: values.xpathConfig, desktopConfig: values.desktopConfig }
      : { name: values.name, url: values.url, iconPath: values.iconPath, userAgent: values.userAgent, xpathConfig: values.xpathConfig, desktopConfig: values.desktopConfig };
    const result = await api.saveProfile(input);
    if (version !== formVersion) {
      await reloadProfiles();
      return;
    }
    // Registry đã lưu kể cả khi shortcut lỗi: lần thử lại phải sửa cùng ID.
    el<HTMLInputElement>('field-id').value = result.profile.id;
    el<HTMLInputElement>('field-icon').value = result.profile.iconPath ?? '';
    el<HTMLInputElement>('field-useragent').disabled = true;
    if (result.iconWarning) showIconStatus(result.iconWarning);
    if (result.shortcut.status === 'error') {
      showFormError(`Đã lưu profile nhưng đồng bộ shortcut thất bại: ${result.shortcut.message}. Hãy thử lại.`);
      await reloadProfiles();
      return;
    }
    await reloadProfiles();
    if (version !== formVersion) return;
    closeForm();
    const messages = ['Đã lưu.'];
    if (result.restartRequired === true) messages.push('Runner đang dùng cấu hình cũ — cần mở lại runner.');
    if (result.restartRequired === null) messages.push('Chưa xác định được runner có cần mở lại không.');
    if (result.iconWarning) messages.push(result.iconWarning);
    setStatus(messages.join(' '), 'info');
  } catch (err: unknown) {
    if (version !== formVersion) return;
    showFormError((err as Error).message);
  } finally {
    saveBtn.disabled = false;
  }
}

async function onTestXPath(): Promise<void> {
  const version = formVersion;
  const request = ++xpathRequestVersion;
  const api = bridge();
  if (!api) {
    showXPathResult('Cầu nối Manager chưa sẵn sàng.');
    return;
  }
  const id = el<HTMLInputElement>('field-id').value;
  if (!id) {
    showXPathResult('Hãy lưu profile trước khi thử XPath.');
    return;
  }
  const selector = el<HTMLInputElement>('field-xpath').value.trim();
  const mode = el<HTMLSelectElement>('field-mode').value as Profile['xpathConfig']['mode'];
  const isCurrent = () => version === formVersion && request === xpathRequestVersion
    && selector === el<HTMLInputElement>('field-xpath').value.trim()
    && mode === el<HTMLSelectElement>('field-mode').value;
  if (!selector) {
    showXPathResult('Hãy nhập selector trước khi thử.');
    return;
  }
  showXPathResult('Đang thử XPath…');
  try {
    const result = await api.testXPath(id, selector, mode);
    if (!isCurrent()) return;
    const labels = { match: 'Khớp', no_match: 'Không khớp', invalid_selector: 'Sai cú pháp XPath', invalid_data: 'Dữ liệu không hợp lệ', error: 'Lỗi thực thi' };
    showXPathResult(`Kết quả: ${labels[result.status]} — ${result.error || result.textPreview || `đếm ${result.count}`}`);
  } catch (err: unknown) {
    if (!isCurrent()) return;
    showXPathResult(`Thử XPath thất bại: ${(err as Error).message}`);
  }
}

async function onOpenProfile(profileId: string, statusNode: HTMLElement): Promise<void> {
  const api = bridge();
  if (!api) {
    statusNode.textContent = 'Cầu nối Manager chưa sẵn sàng.';
    return;
  }
  statusNode.textContent = 'Đang gửi yêu cầu mở…';
  try {
    await api.launchProfile(profileId);
    statusNode.textContent = 'Đã gửi yêu cầu mở. Runner sẵn sàng sẽ được xác nhận sau.';
  } catch (err: unknown) {
    statusNode.textContent = `Mở runner thất bại: ${(err as Error).message}`;
  }
}

async function onDeleteProfile(profile: Profile): Promise<void> {
  const api = bridge();
  if (!api) return;
  const confirmed = window.confirm(`Xóa profile "${profile.name}"? Runner phải đã dừng. Dữ liệu phiên được giữ lại.`);
  if (!confirmed) return;
  try {
    await api.deleteProfile(profile.id);
    await reloadProfiles();
  } catch (err: unknown) {
    setStatus(`Xóa profile thất bại: ${(err as Error).message}`, 'error');
  }
}

async function onDeleteSession(profile: Profile): Promise<void> {
  const api = bridge();
  if (!api) return;
  const confirmed = window.confirm(
    `Xóa TOÀN BỘ dữ liệu phiên của profile "${profile.name}" (ID: ${profile.id})? ` +
    `Gồm phiên đăng nhập và trạng thái website. Hồ sơ profile không bị ảnh hưởng. Runner phải đã dừng.`
  );
  if (!confirmed) return;
  try {
    const result = await api.deleteProfileSession(profile.id);
    if (result.cancelled || !result.deleted) {
      setStatus('Đã hủy xóa phiên, dữ liệu không thay đổi.', 'info');
      return;
    }
    setStatus(`Đã xóa dữ liệu phiên của "${profile.name}".`, 'info');
  } catch (err: unknown) {
    setStatus(`Xóa phiên thất bại: ${(err as Error).message}`, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  el('btn-add-profile').addEventListener('click', () => openForm(null));
  el('search-input').addEventListener('input', (event) => {
    state.filter = (event.target as HTMLInputElement).value;
    renderList();
    void refreshRunnerStates();
  });
  el('profile-form').addEventListener('submit', (event) => {
    event.preventDefault();
    void onSaveForm();
  });
  el('btn-cancel').addEventListener('click', () => closeForm());
  el('btn-test-xpath').addEventListener('click', () => void onTestXPath());
  el('btn-choose-icon').addEventListener('click', () => void onChooseIcon());
  el('btn-fetch-icon').addEventListener('click', () => {
    void onFetchIcon(el<HTMLInputElement>('field-url').value.trim());
  });
  el<HTMLDialogElement>('profile-dialog').addEventListener('cancel', (event) => {
    event.preventDefault();
    closeForm();
  });
  const theme = el<HTMLSelectElement>('theme-select');
  try { theme.value = localStorage.getItem('manager-theme') ?? 'system'; } catch { /* Thao tác vẫn dùng được khi storage bị chặn. */ }
  const applyTheme = () => {
    document.documentElement.dataset.theme = theme.value;
    try { localStorage.setItem('manager-theme', theme.value); } catch { /* Chỉ lưu tùy chọn khi có storage. */ }
  };
  theme.addEventListener('change', applyTheme);
  applyTheme();
  document.addEventListener('visibilitychange', () => {
    clearTimeout(statusTimer);
    if (!document.hidden) void reloadProfiles();
  });
  window.addEventListener('pagehide', () => { disposed = true; clearTimeout(statusTimer); });
  void reloadProfiles();
});
