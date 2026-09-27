import { describe, it, expect, vi } from 'vitest';

const { writeText } = vi.hoisted(() => ({ writeText: vi.fn() }));
vi.mock('electron', () => ({
  clipboard: { writeText },
  Menu: {},
  BrowserWindow: class {},
  screen: {},
  shell: {}
}));

import { buildContextMenuTemplate, ContextMenuInput } from '../src/main/window-service';
import { validateDesktopConfig } from '../src/main/profile-validator';

const base: ContextMenuInput = {
  isEditable: false,
  editFlags: { canCut: false, canCopy: false, canPaste: false, canSelectAll: false } as ContextMenuInput['editFlags'],
  selectionText: '',
  linkURL: '',
  mediaType: 'none',
  hasImageContents: false,
  x: 5,
  y: 7
};

describe('Menu chuột phải', () => {
  it('mặc định tắt, profile cũ thiếu trường vẫn hợp lệ', () => {
    expect(validateDesktopConfig({}).enableContextMenu).toBe(false);
    expect(validateDesktopConfig(undefined).enableContextMenu).toBe(false);
    expect(validateDesktopConfig({ enableContextMenu: true }).enableContextMenu).toBe(true);
    expect(() => validateDesktopConfig({ enableContextMenu: 'yes' })).toThrow();
  });

  it('vùng trống không có mục nào', () => {
    expect(buildContextMenuTemplate(base, { copyImageAt: vi.fn() })).toEqual([]);
  });

  it('ô nhập liệu có cắt/sao chép/dán theo editFlags', () => {
    const items = buildContextMenuTemplate(
      { ...base, isEditable: true, editFlags: { ...base.editFlags, canPaste: true } },
      { copyImageAt: vi.fn() }
    );
    expect(items.map((i) => [i.role, i.enabled])).toEqual([
      ['cut', false], ['copy', false], ['paste', true], ['selectAll', false]
    ]);
  });

  it('liên kết và ảnh được sao chép đúng', () => {
    const copyImageAt = vi.fn();
    const items = buildContextMenuTemplate(
      { ...base, selectionText: 'abc', linkURL: 'https://zalo.me', mediaType: 'image', hasImageContents: true },
      { copyImageAt }
    );
    expect(items.map((i) => i.label)).toEqual(['Sao chép', 'Sao chép liên kết', 'Sao chép ảnh']);
    (items[1].click as () => void)();
    (items[2].click as () => void)();
    expect(writeText).toHaveBeenCalledWith('https://zalo.me');
    expect(copyImageAt).toHaveBeenCalledWith(5, 7);
  });
});
