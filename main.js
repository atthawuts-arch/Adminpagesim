// Electron main process — แอดมินซิม
//
// Wraps the src/ web app in a Chromium BrowserWindow.
//
// Why a custom protocol?  The renderer uses ES modules and fetch('data/*.json').
// Under the default file:// scheme, Chromium blocks fetch() with CORS errors
// and module imports break. Registering app:// as a "standard" + "secure"
// scheme makes the renderer behave just like it would over http://localhost.

const { app, BrowserWindow, protocol, shell, net } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const isDev = !app.isPackaged;
const SRC_ROOT = path.join(__dirname, 'src');

// Must register before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

function resolveAppUrl(reqUrl) {
  // app://./js/main.js  →  src/js/main.js
  // app://./           →  src/index.html
  let pathname = reqUrl.pathname || '/';
  pathname = decodeURIComponent(pathname);
  // Strip leading slash so path.join doesn't reset
  if (pathname.startsWith('/')) pathname = pathname.slice(1);
  if (pathname === '' || pathname.endsWith('/')) pathname += 'index.html';

  const resolved = path.normalize(path.join(SRC_ROOT, pathname));
  // Prevent path traversal — must stay inside SRC_ROOT
  if (!resolved.startsWith(SRC_ROOT)) return null;
  return resolved;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 480,
    height: 880,
    minWidth: 420,
    minHeight: 720,
    backgroundColor: '#fff4e6',
    title: 'แอดมินซิม — Admin Simulator',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // No need to disable webSecurity — custom protocol handles fetch+modules
    },
  });

  // Hide native menu bar entirely in production
  if (!isDev) win.setMenuBarVisibility(false);

  // External links open in user's browser, not in-app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    // Forward renderer console to main stdout so we can debug from terminal
    win.webContents.on('console-message', (_e, level, message, line, source) => {
      const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
      const tag = levels[level] || 'LOG';
      console.log(`[renderer:${tag}] ${message}  (${source}:${line})`);
    });

  }

  win.loadURL('app://./index.html');
}

app.whenReady().then(() => {
  // Handle app:// requests by streaming the file from disk
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    const resolved = resolveAppUrl(url);
    if (!resolved) {
      return new Response('Not found', { status: 404 });
    }
    try {
      return await net.fetch(pathToFileURL(resolved).toString());
    } catch (err) {
      return new Response(`Failed: ${err.message}`, { status: 500 });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
