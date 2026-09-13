import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('User Story 3: Build Pipeline and Sandbox Security Verification', () => {
  const rootDir = path.resolve(__dirname, '..');
  const distDir = path.join(rootDir, 'dist');

  const mainDist = path.join(distDir, 'main/index.js');
  const preloadDist = path.join(distDir, 'preload/webview-preload.js');
  const managerPreloadDist = path.join(distDir, 'preload/manager-preload.js');
  const rendererDist = path.join(distDir, 'renderer/manager/app.js');
  const htmlDist = path.join(distDir, 'renderer/manager/index.html');
  const cssDist = path.join(distDir, 'renderer/manager/styles.css');
  const assetNames = ['default-icon.png', 'unread-icon.png'];

  it('should have all compiled artifacts and static assets in dist/', () => {
    expect(fs.existsSync(mainDist)).toBe(true);
    expect(fs.existsSync(preloadDist)).toBe(true);
    expect(fs.existsSync(managerPreloadDist)).toBe(true);
    expect(fs.existsSync(rendererDist)).toBe(true);
    expect(fs.existsSync(htmlDist)).toBe(true);
    expect(fs.existsSync(cssDist)).toBe(true);
    for (const assetName of assetNames) {
      const sourceAsset = path.join(rootDir, 'assets', assetName);
      const distAsset = path.join(distDir, 'assets', assetName);
      expect(fs.statSync(sourceAsset).size).toBeGreaterThan(0);
      expect(fs.statSync(distAsset).size).toBeGreaterThan(0);
    }
  });

  it('should enforce strict sandbox isolation on renderer bundle', () => {
    const rendererContent = fs.readFileSync(rendererDist, 'utf-8');

    // Renderer must NOT require Node.js built-in modules
    expect(rendererContent).not.toMatch(/require\(['"]child_process['"]\)/);
    expect(rendererContent).not.toMatch(/require\(['"]fs['"]\)/);
    expect(rendererContent).not.toMatch(/require\(['"]electron['"]\)/);
    expect(rendererContent).not.toMatch(/process\.binding/);
  });

  it('should bundle preload cleanly without internal relative require calls', () => {
    const preloadContent = fs.readFileSync(preloadDist, 'utf-8');

    // Preload should only externalize electron
    expect(preloadContent).toMatch(/require\(['"]electron['"]\)/);
    // Preload bundle must not contain relative require imports to unresolved files
    expect(preloadContent).not.toMatch(/require\(['"]\.\.?\//);
  });

  it('should include Content-Security-Policy in manager index.html', () => {
    const htmlContent = fs.readFileSync(htmlDist, 'utf-8');
    expect(htmlContent).toMatch(/http-equiv=["']Content-Security-Policy["']/i);
    expect(htmlContent).toMatch(/default-src 'self'/);
  });

  it('should bundle manager preload with narrow bridge only', () => {
    const content = fs.readFileSync(managerPreloadDist, 'utf-8');

    // Manager preload must expose window.zaloview with per-API channels
    expect(content).toMatch(/zaloview:get-profiles/);
    expect(content).toMatch(/zaloview:save-profile/);
    expect(content).toMatch(/zaloview:delete-profile-session/);
    expect(content).toMatch(/require\(['"]electron['"]\)/);
    // No generic invoke bridge, no ipcRenderer leak, no relative requires
    expect(content).not.toMatch(/exposeInMainWorld\(['"]zaloview['"],\s*ipcRenderer/);
    expect(content).not.toMatch(/require\(['"]\.\.?\//);
  });

  it('should not expose manager bridge on website preload', () => {
    const content = fs.readFileSync(preloadDist, 'utf-8');
    expect(content).not.toMatch(/zaloview:get-profiles/);
    expect(content).not.toMatch(/zaloview:save-profile/);
  });

  it('should wire manager window to manager preload in main bundle', () => {
    const content = fs.readFileSync(mainDist, 'utf-8');
    expect(content).toMatch(/manager-preload\.js/);
  });
});
