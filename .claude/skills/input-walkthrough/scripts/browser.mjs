#!/usr/bin/env node
// Persistent headless browser for the input-walkthrough skill.
//
// Each Bash call is a separate process, so `start` launches a small background
// server that keeps one Playwright browser open, and every other command talks
// to it over localhost. Use a different --id per agent to run several at once.
//
//   node browser.mjs start <url> --id <id> [--device desktop|mobile] [--zoom 2]
//        [--viewport 1280x800] [--dpr 2] [--touch]   (custom screen; --touch adds a touchscreen)
//        [--gamepad]                       (a virtual standard gamepad, connected at start)
//        [--webgl]                         (software WebGL for 3D/WebGL games only: it slows 2D canvas)
//        [--locale de-DE] [--timezone Pacific/Auckland] [--network slow|offline]
//        [--storage-state <file>]          (start with saved cookies/localStorage)
//   node browser.mjs snapshot            --id <id>
//   node browser.mjs click <ref|text>    --id <id>
//   node browser.mjs fill <ref> <text>   --id <id>
//   node browser.mjs select <ref> <val>  --id <id>
//   node browser.mjs press <key>         --id <id>   (Tab, Enter, Escape, Shift+Tab, ...)
//   node browser.mjs scroll [down|up]    --id <id>
//   node browser.mjs goto <url>          --id <id>
//   node browser.mjs back                --id <id>
//   node browser.mjs reload              --id <id>
//   node browser.mjs screenshot <path> [--full] --id <id>   (viewport only unless --full)
//   node browser.mjs network <normal|slow|offline> --id <id>
//   node browser.mjs tab new [url]       --id <id>   (opens a second tab, same session)
//   node browser.mjs tab <n>             --id <id>   (switch to tab n, from 1)
//   node browser.mjs tabs                --id <id>   (list open tabs)
//   node browser.mjs clear-cookies       --id <id>   (simulates an expired session)
//   node browser.mjs save-state <file>   --id <id>   (save cookies/localStorage)
//   node browser.mjs pad press <button> [ms]          --id <id>   (default 120ms)
//   node browser.mjs pad hold <button> <ms>           --id <id>
//   node browser.mjs pad stick <left|right> <x> <y> <ms> --id <id>   (x, y from -1 to 1)
//   node browser.mjs pad connect | pad disconnect     --id <id>
//   node browser.mjs key down|up <key>   --id <id>   (hold a key across commands)
//   node browser.mjs key hold <key> <ms> --id <id>
//   node browser.mjs mouse <x> <y> [move|click|right] --id <id>   (CSS pixels; default click)
//   node browser.mjs tap <x> <y>         --id <id>   (touch tap, CSS pixels; needs --touch or mobile)
//   node browser.mjs wait <ms>           --id <id>   (let the page run, then snapshot)
//   node browser.mjs eval <expression>   --id <id>   (prints the result as JSON)
//   node browser.mjs stop                --id <id>
//
// Every action prints a fresh snapshot: URL, title, the focused element, visible
// text, a numbered list of interactive elements ([ref] role "name"), console
// errors since the last command, and a note when an action changed nothing.
// Canvas games show little in a snapshot: take screenshots and look at them.
// The page keeps running between commands (games included), so pause a game
// before stopping to think, or it carries on without you.
// Gamepad buttons: a b x y lb rb lt rt select start ls rs up down left right home
// (standard mapping). "slow" network is roughly 3G: 400ms latency, ~400 kbit/s.
// Set PW_MODULE to a Playwright package folder to use a project's own copy.

import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STATE_DIR = path.join(os.tmpdir(), 'input-walkthrough-browser');
const MAX_TEXT = 4000;

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) flags[key] = true;
      else { flags[key] = next; i++; }
    } else positional.push(a);
  }
  return { positional, flags };
}

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  if (process.env.PW_MODULE) {
    try { return require(path.resolve(process.env.PW_MODULE)); }
    catch { console.error(`PW_MODULE is set, but no Playwright was found at ${process.env.PW_MODULE}`); process.exit(2); }
  }
  try { return require('playwright'); } catch {}
  try { return createRequire(path.join(process.cwd(), 'package.json'))('playwright'); } catch {}
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return require(path.join(globalRoot, 'playwright'));
  } catch {}
  console.error(
    'Playwright not found. Install it once with:\n' +
    '  npm i -g playwright && npx playwright install chromium'
  );
  process.exit(2);
}

const stateFile = (id) => path.join(STATE_DIR, `${id}.json`);

// ---------------------------------------------------------------- server side

async function snapshot(page) {
  return page.evaluate((maxText) => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const nameOf = (el) => {
      const labelled = el.getAttribute('aria-labelledby');
      if (labelled) {
        const t = labelled.split(/\s+/).map((id) => document.getElementById(id)?.innerText || '').join(' ').trim();
        if (t) return t;
      }
      if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
      if (el.id) {
        const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lbl?.innerText.trim()) return lbl.innerText.trim();
      }
      const wrap = el.closest('label');
      if (wrap?.innerText.trim()) return wrap.innerText.trim();
      const text = (el.innerText || '').trim();
      if (text) return text;
      const img = el.querySelector('img[alt]');
      if (img?.alt) return img.alt;
      return el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('alt') || el.value || '';
    };
    const roleOf = (el) => {
      if (el.getAttribute('role')) return el.getAttribute('role');
      const tag = el.tagName.toLowerCase();
      if (tag === 'a') return 'link';
      if (tag === 'input') return `input:${el.type || 'text'}`;
      return tag;
    };

    document.querySelectorAll('[data-pref]').forEach((el) => el.removeAttribute('data-pref'));
    const selector = 'a[href], button, input:not([type=hidden]), select, textarea, summary, ' +
      '[role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], [role=switch], ' +
      '[role=option], [role=combobox], [contenteditable=true], [onclick], [tabindex]:not([tabindex="-1"])';
    const items = [];
    let n = 0;
    for (const el of document.querySelectorAll(selector)) {
      if (!visible(el)) continue;
      n++;
      el.setAttribute('data-pref', String(n));
      const name = nameOf(el).replace(/\s+/g, ' ').slice(0, 80);
      const extra = [];
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') extra.push('disabled');
      if (el.checked) extra.push('checked');
      if ('value' in el && el.value && el.tagName !== 'BUTTON') extra.push(`value="${String(el.value).slice(0, 40)}"`);
      const r = el.getBoundingClientRect();
      if (r.width < 32 || r.height < 32) extra.push(`small ${Math.round(r.width)}x${Math.round(r.height)}`);
      if (r.top > innerHeight || r.bottom < 0) extra.push('offscreen');
      items.push(`[${n}] ${roleOf(el)} "${name || '(no accessible name)'}"${extra.length ? ' (' + extra.join(', ') + ')' : ''}`);
    }

    const f = document.activeElement;
    const focused = f && f !== document.body
      ? `${roleOf(f)} "${nameOf(f).replace(/\s+/g, ' ').slice(0, 80)}"${f.dataset.pref ? ` [${f.dataset.pref}]` : ''}`
      : '(nothing / body)';
    const dialogs = [...document.querySelectorAll('dialog[open], [role=dialog], [aria-modal=true]')].filter(visible).length;
    let text = (document.body?.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
    if (text.length > maxText) text = text.slice(0, maxText) + '\n…(truncated)';

    return [
      `URL: ${location.href}`,
      `Title: ${document.title}`,
      `Focused: ${focused}`,
      dialogs ? `Open dialogs: ${dialogs}` : null,
      `Scroll: ${Math.round(scrollY)} / ${Math.max(0, document.documentElement.scrollHeight - innerHeight)}`,
      '',
      '--- Visible text ---',
      text,
      '',
      '--- Interactive elements ---',
      items.join('\n') || '(none)',
    ].filter((l) => l !== null).join('\n');
  }, MAX_TEXT);
}

async function locate(page, target) {
  if (/^\d+$/.test(target)) return page.locator(`[data-pref="${target}"]`).first();
  const byRole = page.getByRole('button', { name: target }).or(page.getByRole('link', { name: target }));
  if (await byRole.count()) return byRole.first();
  return page.getByText(target, { exact: false }).first();
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(300);
}

async function runServer(id, url, flags) {
  const { chromium, devices } = loadPlaywright();
  const launchOpts = process.env.PW_EXECUTABLE_PATH ? { executablePath: process.env.PW_EXECUTABLE_PATH } : {};
  launchOpts.args = ['--autoplay-policy=no-user-gesture-required'];
  if (flags.webgl) launchOpts.args.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist');
  const browser = await chromium.launch(launchOpts);

  const zoom = Number(flags.zoom) || 1;
  let ctxOpts;
  if (flags.device === 'mobile') {
    ctxOpts = { ...devices['iPhone 13'] };
  } else if (flags.viewport) {
    const [width, height] = String(flags.viewport).split('x').map(Number);
    if (!width || !height) throw new Error('--viewport must look like 1280x800');
    ctxOpts = { viewport: { width, height }, deviceScaleFactor: Number(flags.dpr) || 1 };
  } else {
    // Zoom is simulated by shrinking the CSS viewport and scaling pixels up,
    // which is how browser zoom affects layout (e.g. 200% on 1280px = 640px).
    ctxOpts = {
      viewport: { width: Math.round(1280 / zoom), height: Math.round(800 / zoom) },
      deviceScaleFactor: zoom,
    };
  }
  if (flags.dpr && flags.device !== 'mobile') ctxOpts.deviceScaleFactor = Number(flags.dpr);
  if (flags.touch) ctxOpts.hasTouch = true;
  if (flags.locale) ctxOpts.locale = String(flags.locale);
  if (flags.timezone) ctxOpts.timezoneId = String(flags.timezone);
  if (flags['storage-state']) ctxOpts.storageState = String(flags['storage-state']);
  const context = await browser.newContext(ctxOpts);

  // A virtual standard-mapping gamepad. It replaces navigator.getGamepads in
  // every page, so headless games see a controller; `pad` commands change its
  // state. It starts connected with --gamepad, otherwise disconnected.
  let gamepadUsed = !!flags.gamepad;
  await context.addInitScript((connected) => {
    const state = { connected, buttons: new Array(17).fill(0), axes: [0, 0, 0, 0], t0: performance.now() };
    const snapshotPad = () => ({
      id: 'Virtual gamepad (STANDARD GAMEPAD Vendor: 045e Product: 028e)',
      index: 0, connected: true, mapping: 'standard', timestamp: performance.now() - state.t0,
      axes: [...state.axes],
      buttons: state.buttons.map((v) => ({ pressed: v > 0.5, touched: v > 0, value: v })),
      vibrationActuator: { playEffect: async () => 'complete', reset: async () => 'complete' },
    });
    Object.defineProperty(Navigator.prototype, 'getGamepads', {
      configurable: true,
      value: () => [state.connected ? snapshotPad() : null, null, null, null],
    });
    const fire = (type) => window.dispatchEvent(Object.assign(new Event(type), { gamepad: snapshotPad() }));
    window.__virtualPad = {
      state,
      set(buttons, axes) {
        if (buttons) for (const [i, v] of Object.entries(buttons)) state.buttons[i] = v;
        if (axes) for (const [i, v] of Object.entries(axes)) state.axes[i] = v;
      },
      connect() { if (!state.connected) { state.connected = true; fire('gamepadconnected'); } },
      disconnect() { if (state.connected) { state.connected = false; fire('gamepaddisconnected'); } },
    };
    if (connected) addEventListener('load', () => setTimeout(() => fire('gamepadconnected'), 50));
  }, !!flags.gamepad);
  const PAD_BUTTONS = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, select: 8, back: 8, view: 8,
    start: 9, menu: 9, ls: 10, rs: 11, up: 12, down: 13, left: 14, right: 15, home: 16 };
  const padButton = (name) => {
    const i = PAD_BUTTONS[String(name).toLowerCase()];
    if (i === undefined) throw new Error(`Unknown gamepad button "${name}". Use: ${Object.keys(PAD_BUTTONS).join(' ')}`);
    return i;
  };
  const padSet = (buttons, axes) => page.evaluate(([b, a]) => window.__virtualPad.set(b, a), [buttons, axes]);

  const consoleErrors = [];
  const pages = [];
  let network = 'normal';
  const SLOW = { offline: false, latency: 400, downloadThroughput: 50 * 1024, uploadThroughput: 20 * 1024 };
  const FAST = { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
  const throttle = async (p) => {
    const cdp = await context.newCDPSession(p);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', network === 'slow' ? SLOW : FAST);
  };
  const setNetwork = async (mode) => {
    if (!['normal', 'slow', 'offline'].includes(mode)) throw new Error('network must be normal, slow or offline');
    network = mode;
    await context.setOffline(mode === 'offline');
    for (const p of pages) await throttle(p);
  };
  const addPage = async () => {
    const p = await context.newPage();
    p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
    p.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 200)));
    p.on('dialog', (d) => d.dismiss().catch(() => {}));
    pages.push(p);
    if (network === 'slow') await throttle(p);
    return p;
  };

  let page = await addPage();
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await settle(page);
  const firstLoadMs = Date.now() - t0;
  // Apply network conditions after the first load, so a failed first load
  // can't stop the browser from starting. `start` then reloads under them.
  if (flags.network && flags.network !== 'normal') {
    await setNetwork(String(flags.network));
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await settle(page);
  }
  const header = async () => {
    const lines = [];
    if (pages.length > 1) lines.push(`Tab: ${pages.indexOf(page) + 1} of ${pages.length}`);
    if (network !== 'normal') lines.push(`Network: ${network}`);
    if (gamepadUsed) {
      const on = await page.evaluate(() => window.__virtualPad?.state.connected).catch(() => false);
      lines.push(`Gamepad: ${on ? 'connected' : 'disconnected'}`);
    }
    const canvas = await page.evaluate(() => {
      const c = [...document.querySelectorAll('canvas')].map((el) => el.getBoundingClientRect())
        .filter((r) => r.width * r.height > innerWidth * innerHeight * 0.25)[0];
      return c && `Canvas: ${Math.round(c.width)}x${Math.round(c.height)} at ${Math.round(c.left)},${Math.round(c.top)} (CSS px) - use screenshots to see it`;
    }).catch(() => null);
    if (canvas) lines.push(canvas);
    return lines.length ? lines.join('\n') + '\n' : '';
  };
  const snap = async () => (await header()) + await snapshot(page);
  let lastSnap = await snap();

  const handlers = {
    snapshot: async () => {},
    click: async ([t]) => {
      const loc = await locate(page, t);
      await loc.click({ timeout: 5000 });
    },
    fill: async ([t, ...rest]) => {
      const loc = await locate(page, t);
      await loc.fill(rest.join(' '), { timeout: 5000 });
    },
    select: async ([t, ...rest]) => {
      const loc = await locate(page, t);
      await loc.selectOption({ label: rest.join(' ') }, { timeout: 5000 })
        .catch(() => loc.selectOption(rest.join(' '), { timeout: 5000 }));
    },
    press: async ([key]) => page.keyboard.press(key),
    scroll: async ([dir]) => page.mouse.wheel(0, dir === 'up' ? -600 : 600),
    goto: async ([u]) => page.goto(u, { waitUntil: 'domcontentloaded' }),
    back: async () => page.goBack(),
    reload: async () => page.reload(),
    screenshot: async ([p], f) => {
      fs.mkdirSync(path.dirname(path.resolve(p)), { recursive: true });
      await page.screenshot({ path: p, fullPage: !!f.full });
      const vp = page.viewportSize();
      const dpr = ctxOpts.deviceScaleFactor || 1;
      return `Saved screenshot: ${path.resolve(p)} (viewport ${vp.width}x${vp.height} CSS px` +
        (dpr !== 1 ? `, image is ${dpr}x larger: divide image pixels by ${dpr} for mouse/tap coordinates)` : ')');
    },
    pad: async ([action, a1, a2, a3, a4]) => {
      gamepadUsed = true;
      const ms = (v, d) => (v === undefined ? d : Number(v));
      if (action === 'connect') return page.evaluate(() => window.__virtualPad.connect());
      if (action === 'disconnect') return page.evaluate(() => window.__virtualPad.disconnect());
      if (action === 'press' || action === 'hold') {
        const i = padButton(a1);
        await padSet({ [i]: 1 });
        await page.waitForTimeout(ms(a2, action === 'press' ? 120 : 500));
        return padSet({ [i]: 0 });
      }
      if (action === 'stick') {
        const base = a1 === 'right' ? 2 : a1 === 'left' ? 0 : -1;
        if (base < 0) throw new Error('pad stick needs left or right');
        await padSet(null, { [base]: Number(a2) || 0, [base + 1]: Number(a3) || 0 });
        await page.waitForTimeout(ms(a4, 300));
        return padSet(null, { [base]: 0, [base + 1]: 0 });
      }
      throw new Error('pad needs press, hold, stick, connect or disconnect');
    },
    key: async ([action, k, t]) => {
      if (action === 'down') return page.keyboard.down(k);
      if (action === 'up') return page.keyboard.up(k);
      if (action === 'hold') { await page.keyboard.down(k); await page.waitForTimeout(Number(t) || 500); return page.keyboard.up(k); }
      throw new Error('key needs down, up or hold');
    },
    mouse: async ([x, y, how = 'click']) => {
      if (how === 'move') return page.mouse.move(Number(x), Number(y));
      return page.mouse.click(Number(x), Number(y), { button: how === 'right' ? 'right' : 'left' });
    },
    tap: async ([x, y]) => page.touchscreen.tap(Number(x), Number(y)),
    wait: async ([t]) => page.waitForTimeout(Number(t) || 1000),
    eval: async (parts) => {
      // Playwright evaluates a string as an expression, outside the page's CSP.
      const v = await page.evaluate(parts.join(' '));
      return v === undefined ? 'undefined' : JSON.stringify(v, null, 2);
    },
    network: async ([mode]) => setNetwork(mode),
    tab: async ([which, u]) => {
      if (which === 'new') {
        page = await addPage();
        if (u) await page.goto(u, { waitUntil: 'domcontentloaded' });
        return;
      }
      const n = Number(which);
      if (!pages[n - 1]) throw new Error(`No tab ${which}. Open tabs: ${pages.length}`);
      page = pages[n - 1];
      await page.bringToFront();
    },
    tabs: async () => pages.map((p, i) => `${p === page ? '*' : ' '} [${i + 1}] ${p.url()}`).join('\n'),
    'clear-cookies': async () => context.clearCookies(),
    'save-state': async ([p]) => {
      fs.mkdirSync(path.dirname(path.resolve(p)), { recursive: true });
      await context.storageState({ path: p });
      return `Saved storage state: ${path.resolve(p)}`;
    },
  };
  // Commands that return their own text instead of a fresh snapshot.
  const noSnapshot = new Set(['screenshot', 'tabs', 'save-state', 'eval']);

  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const { cmd, args = [], flags: f = {} } = JSON.parse(body || '{}');
    let out = '';
    try {
      if (cmd === 'stop') {
        res.end('Stopped.');
        await browser.close();
        fs.rmSync(stateFile(id), { force: true });
        process.exit(0);
      }
      const h = handlers[cmd];
      if (!h) throw new Error(`Unknown command: ${cmd}`);
      const started = Date.now();
      const result = await h(args, f);
      const note = typeof result === 'string' ? result : '';
      if (cmd !== 'snapshot' && !noSnapshot.has(cmd)) await settle(page);
      const took = Date.now() - started;
      if (noSnapshot.has(cmd)) out = note;
      else {
        const current = await snap();
        // Ignore focus: clicking a no-op button still moves focus onto it.
        const sansFocus = (t) => t.replace(/^Focused: .*$/m, '');
        // On a canvas page the text can't show change, so only screenshots can tell.
        const unchanged = !['snapshot', 'network', 'clear-cookies', 'wait'].includes(cmd) &&
          !/^Canvas: /m.test(current) && sansFocus(current) === sansFocus(lastSnap);
        lastSnap = current;
        out = `(${cmd} took ${took}ms)` + (unchanged ? ' NOTE: nothing on the page changed.' : '') + '\n' + current;
      }
    } catch (e) {
      out = `ERROR: ${e.message.split('\n')[0]}\n\n` + await snap().catch(() => '');
    }
    if (!noSnapshot.has(cmd)) {
      out += consoleErrors.length
        ? `\n\n--- Console errors since last command ---\n${consoleErrors.splice(0).join('\n')}`
        : '\n\nConsole errors: none';
    }
    res.end(out);
  });

  server.listen(0, '127.0.0.1', async () => {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(stateFile(id), JSON.stringify({ port: server.address().port, pid: process.pid }));
    process.send?.({ ready: true, firstLoadMs, snap: lastSnap });
  });
}

// ---------------------------------------------------------------- client side

function send(id, payload) {
  let state;
  try { state = JSON.parse(fs.readFileSync(stateFile(id), 'utf8')); }
  catch { console.error(`No browser running for --id ${id}. Run "start" first.`); process.exit(1); }
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: state.port, method: 'POST' }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.end(JSON.stringify(payload));
  });
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  const id = String(flags.id || 'default');

  if (cmd === '__serve') return runServer(id, positional[0], flags);

  if (!cmd || cmd === 'help' || cmd === '--help') {
    const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
    const lines = src.split('\n').slice(1);
    const end = lines.findIndex((l) => !l.startsWith('//'));
    console.log(lines.slice(0, end).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    return;
  }

  if (cmd === 'start') {
    if (!positional[0]) { console.error('Usage: start <url> --id <id>'); process.exit(1); }
    if (fs.existsSync(stateFile(id))) await send(id, { cmd: 'stop' }).catch(() => fs.rmSync(stateFile(id), { force: true }));
    // The background server writes errors to a log file rather than this
    // process's stderr, so callers that wait for output pipes to close don't hang.
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const logFile = path.join(STATE_DIR, `${id}.log`);
    const log = fs.openSync(logFile, 'w');
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '__serve', ...process.argv.slice(3)], {
      detached: true,
      stdio: ['ignore', 'ignore', log, 'ipc'],
    });
    fs.closeSync(log);
    const timer = setTimeout(() => { console.error('Browser did not start within 60s.'); process.exit(1); }, 60000);
    child.on('message', (m) => {
      clearTimeout(timer);
      console.log(`Browser "${id}" started (first load ${m.firstLoadMs}ms).\n\n${m.snap}`);
      child.disconnect();
      child.unref();
      process.exit(0);
    });
    child.on('exit', (code) => {
      const details = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').trim() : '';
      console.error(`Browser process exited (code ${code}).${details ? '\n' + details : ''}`);
      process.exit(code === 2 ? 2 : 1);
    });
    return;
  }

  console.log(await send(id, { cmd, args: positional, flags }));
}

main().catch((e) => { console.error(e); process.exit(1); });
