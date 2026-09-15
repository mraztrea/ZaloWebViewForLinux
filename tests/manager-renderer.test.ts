import { describe, expect, it } from 'vitest';
import { buildSync } from 'esbuild';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const chrome = process.env.CHROME_BIN ?? 'google-chrome';
const hasChrome = spawnSync(chrome, ['--version']).status === 0;

// DOM thật, chỉ thay bridge IPC để điều khiển phản hồi của main.
describe.skipIf(!hasChrome)('Manager renderer trên Chromium (CHROME_BIN)', () => {
  it('giữ ID khi retry, cập nhật trạng thái/cảnh báo và xử lý form/icon/theme', () => {
    const root = path.resolve(__dirname, '..');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zaloview-renderer-'));
    try {
      fs.copyFileSync(path.join(root, 'assets/default-icon.png'), path.join(dir, 'icon #?.png'));
      const bundle = buildSync({
        entryPoints: [path.join(root, 'src/renderer/manager/app.ts')],
        bundle: true, write: false, format: 'iife'
      }).outputFiles[0].text;
      const fixture = `
        const $ = (id) => document.getElementById(id);
        const failures = [];
        const check = (ok, message) => { if (!ok) failures.push(message); };
        const tick = () => new Promise(resolve => setTimeout(resolve, 0));
        const profiles = [];
        let failSave = false, shortcutFails = true, statusCalls = 0, cleared = [];
        let iconWarning = 'Biểu tượng đã mất, dùng biểu tượng dự phòng.';
        let hidden = false;
        Object.defineProperty(document, 'hidden', { get: () => hidden });
        let xpathResolve, delayReload = false;
        const pendingXpaths = [];
        const pendingReloads = [], pendingIcons = [];
        window.zaloview = {
          getProfiles: async () => delayReload ? new Promise(resolve => pendingReloads.push(resolve)) : structuredClone(profiles),
          saveProfile: async (input) => {
            if (failSave) throw new Error('disk full');
            const profile = { ...input, id: input.id || 'p-' + profiles.length,
              createdAt: '2026-01-01T00:00:00.000Z', updatedAt: 'rev-new' };
            if (iconWarning) profile.iconPath = '/app/default-icon.png';
            const index = profiles.findIndex(p => p.id === profile.id);
            if (index === -1) profiles.push(profile); else profiles[index] = profile;
            return { profile, shortcut: shortcutFails ? {status:'error',message:'shortcut failed'} : {status:'unchanged'}, restartRequired: true, iconWarning };
          },
          getRunnerStatus: async (id) => {
            statusCalls++;
            return {state:'running',data:{status:'running',profileId:id,pid:123,url:'https://example.org',uptimeSeconds:1,
              windowState:{width:1024,height:768,isMaximized:false},configRevision:'rev-old',
              attention:{active:!cleared.includes(id),count:3,mode:'badge_count'}}};
          },
          clearAttention: async (id) => { cleared.push(id); return {cleared:true}; },
          launchProfile: async (id) => ({requested:true,profileId:id}),
          testXPath: () => new Promise((resolve, reject) => { xpathResolve = resolve; pendingXpaths.push({ resolve, reject }); }),
          chooseIcon: async () => ({path:${JSON.stringify(path.join(dir, 'icon #?.png'))},fallback:false}),
          fetchIcon: () => new Promise(resolve => pendingIcons.push(resolve))
        };
      `;
      const checks = `
        document.addEventListener('DOMContentLoaded', async () => {
          try {
            await tick();
            $('btn-add-profile').click();
            $('field-name').value = '<b>A</b>';
            $('field-url').value = 'https://example.org';
            $('profile-form').requestSubmit();
            await tick();
            check($('field-id').value === 'p-0', 'retry phải giữ ID đã lưu');
            check($('profile-dialog').open, 'shortcut lỗi phải giữ form để retry');
            check($('icon-status').textContent.includes(iconWarning) && $('field-icon').value === '/app/default-icon.png', 'fallback icon phải được báo và giữ trong form retry');
            shortcutFails = false;
            $('profile-form').requestSubmit();
            await tick();
            check(profiles.length === 1, 'retry không được tạo profile trùng');
            check(!$('profile-dialog').open, 'lưu thành công đóng form');
            check($('status-bar').textContent.includes(iconWarning), 'lưu thành công vẫn báo lý do fallback icon');
            iconWarning = undefined;
            check($('profile-list').querySelector('h3').textContent === '<b>A</b>', 'tên HTML phải là text');
            check(!$('profile-list').querySelector('b'), 'không render HTML từ tên');
            const card = $('profile-list').firstElementChild;
            const status = card.querySelector('[data-role="runner-status"]');
            check(/cần mở lại/i.test(status.textContent), 'card phải báo revision runner cũ');
            const clear = card.querySelector('[data-action="clear-attention"]');
            check(!!clear && /3/.test(card.textContent), 'phải hiển thị cảnh báo và nút xóa');
            clear?.click();
            await tick();
            check(cleared.join(',') === 'p-0', 'xóa cảnh báo đúng profile');
            const beforePoll = statusCalls;
            await new Promise(resolve => setTimeout(resolve, 3500));
            check(statusCalls > beforePoll, 'phải poll khi hiển thị');
            hidden = true;
            document.dispatchEvent(new Event('visibilitychange'));
            const beforeHidden = statusCalls;
            await new Promise(resolve => setTimeout(resolve, 3500));
            check(statusCalls === beforeHidden, 'ẩn cửa sổ phải ngừng poll');
            hidden = false;
            document.dispatchEvent(new Event('visibilitychange'));
            await tick();
            $('search-input').value = 'example';
            $('search-input').dispatchEvent(new Event('input'));
            await tick();
            check(/đang chạy/.test($('profile-list').textContent), 'lọc phải giữ/cập nhật status');
            $('profile-list').querySelector('[data-action="edit"]').click();
            failSave = true;
            $('field-name').value = 'Giữ bản nháp';
            $('profile-form').requestSubmit();
            await tick();
            check($('profile-dialog').open && $('field-name').value === 'Giữ bản nháp', 'lỗi registry không mất form');
            failSave = false;
            $('btn-choose-icon').click();
            await tick();
            $('profile-form').requestSubmit();
            await tick();
            const icon = $('profile-list').querySelector('img');
            check(icon.getAttribute('src') === 'file://${dir}/icon%20%23%3F.png', 'icon local phải đổi sang file URL');
            icon.dispatchEvent(new Event('error'));
            check(icon.getAttribute('src') === '../../assets/default-icon.png', 'fallback đúng thư mục dist/assets');
            $('profile-list').querySelector('[data-action="edit"]').click();
            $('field-xpath').value = '//div';
            $('btn-test-xpath').click();
            await tick();
            $('field-xpath').value = '//span';
            $('btn-test-xpath').click();
            await tick();
            pendingXpaths[1].resolve({status:'match',textPreview:'KẾT QUẢ MỚI',count:1});
            await tick();
            pendingXpaths[0].reject(new Error('TIMEOUT: yêu cầu cũ'));
            await tick();
            check($('xpath-result').textContent.includes('KẾT QUẢ MỚI'), 'lỗi XPath cũ không được ghi đè kết quả mới');
            $('btn-test-xpath').click();
            await tick();
            $('btn-cancel').click();
            $('btn-add-profile').click();
            xpathResolve({status:'match',textPreview:'KẾT QUẢ CŨ',count:1});
            await tick();
            check($('xpath-result').hidden, 'không ghi kết quả XPath cũ vào form mới');
            const theme = $('theme-select');
            check(!!theme, 'thiếu lựa chọn theme thủ công');
            if (theme) { theme.value = 'light'; theme.dispatchEvent(new Event('change')); check(document.documentElement.dataset.theme === 'light', 'theme không áp dụng'); }
            $('field-url').value = 'https://a.example.org';
            $('btn-fetch-icon').click();
            $('field-url').value = 'https://b.example.org';
            $('btn-fetch-icon').click();
            pendingIcons[1]({path:'/tmp/b.png',fallback:false});
            await tick();
            pendingIcons[0]({path:'/tmp/a.png',fallback:false});
            await tick();
            check($('field-icon').value === '/tmp/b.png', 'icon cũ không được ghi đè icon mới');
            $('btn-fetch-icon').click();
            $('btn-choose-icon').click();
            await tick();
            const chosenIcon = $('field-icon').value;
            pendingIcons[2]({path:'/tmp/old.png',fallback:false});
            await tick();
            check($('field-icon').value === chosenIcon, 'fetch cũ không ghi đè file vừa chọn');
            delayReload = true;
            document.dispatchEvent(new Event('visibilitychange'));
            document.dispatchEvent(new Event('visibilitychange'));
            pendingReloads[1](structuredClone(profiles));
            await tick();
            pendingReloads[0]([]);
            await tick();
            check($('profile-list').querySelectorAll('.profile-card').length === 1, 'reload cũ không được ghi đè danh sách mới');
            $('field-name').value = 'Lưu mới';
            $('profile-form').requestSubmit();
            await tick();
            $('btn-cancel').click();
            $('btn-add-profile').click();
            $('field-name').value = 'Bản nháp mới';
            delayReload = false;
            pendingReloads[2](structuredClone(profiles));
            await tick();
            check($('profile-dialog').open && $('field-name').value === 'Bản nháp mới', 'save cũ không đóng form vừa mở trong lúc reload');
          } catch (error) { failures.push(error.stack); }
          const output = document.createElement('pre');
          output.id = 'test-result';
          output.textContent = btoa(unescape(encodeURIComponent(JSON.stringify(failures))));
          document.body.append(output);
        });
      `;
      const html = fs.readFileSync(path.join(root, 'src/renderer/manager/index.html'), 'utf8')
        .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
        .replace('<script src="app.js"></script>', `<script>${fixture}</script><script>${bundle}</script><script>${checks}</script>`);
      fs.writeFileSync(path.join(dir, 'index.html'), html);
      const result = spawnSync(chrome, [
        '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
        '--no-proxy-server', '--no-first-run', '--disable-background-networking',
        `--user-data-dir=${path.join(dir, 'browser')}`, '--virtual-time-budget=12000',
        '--dump-dom', `file://${path.join(dir, 'index.html')}`
      ], { encoding: 'utf8', timeout: 20000, maxBuffer: 2 * 1024 * 1024 });
      expect(result.status, result.stderr).toBe(0);
      const encoded = result.stdout.match(/<pre id="test-result">([^<]*)<\/pre>/)?.[1];
      expect(encoded, 'Bài kiểm tra trình duyệt phải chạy đến cuối').toBeDefined();
      expect(JSON.parse(Buffer.from(encoded!, 'base64').toString('utf8'))).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 30000);
});
