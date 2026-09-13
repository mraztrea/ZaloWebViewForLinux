import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

async function buildAll() {
  const startTime = Date.now();
  console.log('[build] Starting multi-target build...');

  try {
    // Ensure clean dist directory
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }

    // 1. Build Main Process
    console.log('[build] Compiling Main Process...');
    await esbuild.build({
      entryPoints: [path.join(rootDir, 'src/main/index.ts')],
      outfile: path.join(distDir, 'main/index.js'),
      platform: 'node',
      format: 'cjs',
      target: 'node22',
      bundle: true,
      external: ['electron'],
      sourcemap: true,
      logLevel: 'info'
    });

    // 2. Build Preload Script (Sandbox Safe)
    console.log('[build] Compiling Preload Script...');
    await esbuild.build({
      entryPoints: [path.join(rootDir, 'src/preload/webview-preload.ts')],
      outfile: path.join(distDir, 'preload/webview-preload.js'),
      platform: 'node',
      format: 'cjs',
      target: 'node22',
      bundle: true,
      external: ['electron'],
      sourcemap: true,
      logLevel: 'info'
    });

    // 2b. Build Manager Preload Script (Sandbox Safe, narrow bridge)
    console.log('[build] Compiling Manager Preload Script...');
    await esbuild.build({
      entryPoints: [path.join(rootDir, 'src/preload/manager-preload.ts')],
      outfile: path.join(distDir, 'preload/manager-preload.js'),
      platform: 'node',
      format: 'cjs',
      target: 'node22',
      bundle: true,
      external: ['electron'],
      sourcemap: true,
      logLevel: 'info'
    });

    // 3. Build Renderer Application (Browser Isolated)
    console.log('[build] Compiling Renderer Application...');
    await esbuild.build({
      entryPoints: [path.join(rootDir, 'src/renderer/manager/app.ts')],
      outfile: path.join(distDir, 'renderer/manager/app.js'),
      platform: 'browser',
      format: 'iife',
      target: 'chrome130',
      bundle: true,
      external: [],
      sourcemap: true,
      logLevel: 'info'
    });

    // 4. Copy Static Assets
    console.log('[build] Copying static assets...');
    const staticFiles = [
      {
        src: path.join(rootDir, 'src/renderer/manager/index.html'),
        dest: path.join(distDir, 'renderer/manager/index.html')
      },
      {
        src: path.join(rootDir, 'src/renderer/manager/styles.css'),
        dest: path.join(distDir, 'renderer/manager/styles.css')
      }
    ];

    for (const item of staticFiles) {
      if (fs.existsSync(item.src)) {
        fs.mkdirSync(path.dirname(item.dest), { recursive: true });
        fs.copyFileSync(item.src, item.dest);
      } else {
        throw new Error(`Required static file not found: ${item.src}`);
      }
    }

    // Copy assets directory if it exists
    const assetsSrcDir = path.join(rootDir, 'assets');
    const assetsDestDir = path.join(distDir, 'assets');
    if (fs.existsSync(assetsSrcDir)) {
      fs.cpSync(assetsSrcDir, assetsDestDir, { recursive: true });
    }

    const elapsed = Date.now() - startTime;
    console.log(`[build] Build completed successfully in ${elapsed}ms`);
  } catch (err) {
    console.error('[build] Build failed with error:', err);
    process.exit(1);
  }
}

buildAll();
