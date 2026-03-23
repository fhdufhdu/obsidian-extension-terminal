# Obsidian Terminal Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Obsidian 오른쪽 사이드바에 node-pty + xterm.js 기반 터미널을 제공하는 플러그인을 만든다.

**Architecture:** Obsidian의 `ItemView`를 확장한 TerminalView가 xterm.js를 렌더링하고, ShellPty 클래스가 node-pty로 쉘 프로세스를 관리한다. 플러그인 진입점(main.ts)이 뷰 등록, 리본 아이콘, 커맨드 팔레트, 설정 탭을 연결한다.

**Tech Stack:** TypeScript, Obsidian Plugin API, node-pty, xterm.js (@xterm/xterm), @xterm/addon-fit, esbuild

**Spec:** `docs/superpowers/specs/2026-03-18-obsidian-terminal-plugin-design.md`

**Reference project:** `/Users/estsoft/project/other/vscode-extension-terminal` (VS Code 터미널 확장)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `package.json` | 프로젝트 메타데이터, 의존성, 빌드 스크립트 |
| `manifest.json` | Obsidian 플러그인 매니페스트 |
| `tsconfig.json` | TypeScript 설정 |
| `esbuild.js` | esbuild 번들러 설정 (node-pty external) |
| `install.sh` | Obsidian Electron에 맞춘 electron-rebuild + 설치 스크립트 |
| `src/main.ts` | 플러그인 진입점: 뷰 등록, 리본, 커맨드, 설정 탭 |
| `src/terminal-view.ts` | ItemView 확장: xterm.js 렌더링, PTY 연결, 리사이즈 |
| `src/shell-pty.ts` | node-pty 래퍼: 쉘 프로세스 생성/관리 |
| `src/settings.ts` | 설정 인터페이스 및 PluginSettingTab |
| `styles.css` | xterm.js 컨테이너 스타일 |

---

### Task 1: 프로젝트 스캐폴딩

**Files:**
- Create: `package.json`
- Create: `manifest.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

- [ ] **Step 1: package.json 생성**

```json
{
  "name": "obsidian-terminal",
  "version": "0.0.1",
  "description": "Obsidian 사이드바 터미널 플러그인",
  "main": "main.js",
  "scripts": {
    "build": "node esbuild.js --production",
    "dev": "node esbuild.js --watch",
    "install-ext": "bash install.sh"
  },
  "dependencies": {
    "node-pty": "^1.0.0",
    "@xterm/xterm": "^5.5.0",
    "@xterm/addon-fit": "^0.10.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "obsidian": "^1.7.2",
    "esbuild": "^0.20.0",
    "typescript": "^5.3.0"
  }
}
```

- [ ] **Step 2: manifest.json 생성**

```json
{
  "id": "obsidian-terminal",
  "name": "Terminal",
  "version": "0.0.1",
  "minAppVersion": "1.5.0",
  "description": "사이드바에서 터미널을 사용합니다",
  "author": "estsoft",
  "isDesktopOnly": true
}
```

- [ ] **Step 3: tsconfig.json 생성**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "outDir": ".",
    "rootDir": "src",
    "lib": ["ES2022", "DOM"],
    "sourceMap": false,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: .gitignore 생성**

```
node_modules/
main.js
styles.css
.superpowers/
```

- [ ] **Step 5: npm install**

Run: `cd /Users/estsoft/project/other/obsidian-extension-terminal && npm install`
Expected: 의존성 설치 완료, node_modules 생성

- [ ] **Step 6: git init & commit**

```bash
cd /Users/estsoft/project/other/obsidian-extension-terminal
git init
git add package.json manifest.json tsconfig.json .gitignore
git commit -m "chore: init obsidian terminal plugin project"
```

---

### Task 2: esbuild 설정 및 빌드 파이프라인

**Files:**
- Create: `esbuild.js`

- [ ] **Step 1: esbuild.js 생성**

```js
const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/main.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: production ? false : 'inline',
    platform: 'node',
    outfile: 'main.js',
    external: ['obsidian', 'node-pty', 'electron'],
    logLevel: 'info',
    loader: {
      '.css': 'text',
    },
  });
  if (watch) {
    await ctx.watch();
    console.log('watching...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

참고: `node-pty`는 네이티브 모듈이므로 반드시 external. `obsidian`과 `electron`도 런타임 제공이므로 external. xterm.js는 순수 JS이므로 번들에 포함.

- [ ] **Step 2: 빌드 확인용 빈 main.ts 생성**

Create `src/main.ts`:
```ts
import { Plugin } from 'obsidian';

export default class TerminalPlugin extends Plugin {
  async onload() {
    console.log('Terminal plugin loaded');
  }
  onunload() {
    console.log('Terminal plugin unloaded');
  }
}
```

- [ ] **Step 3: 빌드 테스트**

Run: `npm run build`
Expected: `main.js` 파일 생성, 에러 없음

- [ ] **Step 4: Commit**

```bash
git add esbuild.js src/main.ts
git commit -m "chore: add esbuild config and minimal plugin entry"
```

---

### Task 3: install.sh — Electron 네이티브 모듈 빌드 스크립트

**Files:**
- Create: `install.sh`

- [ ] **Step 1: install.sh 생성**

Obsidian의 Electron 버전을 감지하고 node-pty를 그에 맞게 리빌드하는 스크립트.

```bash
#!/bin/bash
set -e

# Obsidian 앱 경로 (macOS)
OBSIDIAN_APP="/Applications/Obsidian.app"
OBSIDIAN_ASAR="$OBSIDIAN_APP/Contents/Resources/app.asar"

if [ ! -d "$OBSIDIAN_APP" ]; then
  echo "Error: Obsidian.app을 찾을 수 없습니다. ($OBSIDIAN_APP)" && exit 1
fi

# Obsidian의 Electron 버전 감지
ELECTRON_VERSION=$(ELECTRON_RUN_AS_NODE=1 "$OBSIDIAN_APP/Contents/MacOS/Obsidian" -e "console.log(process.versions.electron)" 2>/dev/null)

if [ -z "$ELECTRON_VERSION" ]; then
  echo "Error: Electron 버전을 감지할 수 없습니다." && exit 1
fi

echo "Obsidian Electron version: $ELECTRON_VERSION"

npm install
npx electron-rebuild --version "$ELECTRON_VERSION" --module-dir . --which-module node-pty
npm run build

echo ""
echo "빌드 완료! 다음 파일을 vault/.obsidian/plugins/obsidian-terminal/에 복사하세요:"
echo "  - main.js"
echo "  - manifest.json"
echo "  - styles.css"
echo "  - node_modules/node-pty/ (네이티브 바이너리 포함)"
```

- [ ] **Step 2: 실행 권한 설정**

Run: `chmod +x install.sh`

- [ ] **Step 3: Commit**

```bash
git add install.sh
git commit -m "chore: add install script for electron-rebuild"
```

---

### Task 4: ShellPty — 쉘 프로세스 관리

**Files:**
- Create: `src/shell-pty.ts`

- [ ] **Step 1: shell-pty.ts 구현**

VS Code 확장의 `shell-pty.ts`를 참조하되, VS Code 의존성을 제거하고 순수 EventEmitter 기반으로 작성.

```ts
import * as pty from 'node-pty';

export class ShellPty {
  private ptyProcess: pty.IPty | undefined;
  private disposed = false;

  private dataCallbacks: ((data: string) => void)[] = [];
  private exitCallbacks: (() => void)[] = [];

  constructor(
    private shellPath: string,
    private cwd: string,
    private cols: number,
    private rows: number
  ) {}

  start(): void {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) env[key] = value;
    }
    env.COLORTERM = 'truecolor';
    env.TERM_PROGRAM = 'obsidian';

    this.ptyProcess = pty.spawn(this.shellPath, ['--login'], {
      name: 'xterm-256color',
      cols: this.cols,
      rows: this.rows,
      cwd: this.cwd,
      env,
    });

    this.ptyProcess.onData((data) => {
      if (this.disposed) return;
      this.dataCallbacks.forEach((cb) => cb(data));
    });

    this.ptyProcess.onExit(() => {
      if (!this.disposed) {
        this.exitCallbacks.forEach((cb) => cb());
      }
    });
  }

  write(data: string): void {
    this.ptyProcess?.write(data);
  }

  resize(cols: number, rows: number): void {
    if (this.disposed) return;
    this.ptyProcess?.resize(cols, rows);
  }

  onData(callback: (data: string) => void): void {
    this.dataCallbacks.push(callback);
  }

  onExit(callback: () => void): void {
    this.exitCallbacks.push(callback);
  }

  kill(): void {
    this.disposed = true;
    try {
      this.ptyProcess?.kill();
    } catch {
      // 이미 종료된 프로세스 무시
    }
    this.ptyProcess = undefined;
    this.dataCallbacks = [];
    this.exitCallbacks = [];
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shell-pty.ts
git commit -m "feat: add ShellPty class for node-pty process management"
```

---

### Task 5: Settings — 설정 인터페이스 및 설정 탭

**Files:**
- Create: `src/settings.ts`

- [ ] **Step 1: settings.ts 구현**

```ts
import { App, PluginSettingTab, Setting } from 'obsidian';
import type TerminalPlugin from './main';

export interface TerminalSettings {
  shellPath: string;
  cwd: string;
}

export const DEFAULT_SETTINGS: TerminalSettings = {
  shellPath: process.env.SHELL || '/bin/zsh',
  cwd: '',
};

export class TerminalSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: TerminalPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Shell path')
      .setDesc('사용할 쉘의 경로 (기본: 시스템 쉘)')
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.shellPath)
          .setValue(this.plugin.settings.shellPath)
          .onChange(async (value) => {
            this.plugin.settings.shellPath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Working directory')
      .setDesc('터미널 시작 디렉토리 (비워두면 vault 경로)')
      .addText((text) =>
        text
          .setPlaceholder('vault path')
          .setValue(this.plugin.settings.cwd)
          .onChange(async (value) => {
            this.plugin.settings.cwd = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/settings.ts
git commit -m "feat: add settings interface and settings tab"
```

---

### Task 6: TerminalView — xterm.js 사이드바 뷰

**Files:**
- Create: `src/terminal-view.ts`
- Create: `styles.css`

- [ ] **Step 1: styles.css 생성**

```css
.terminal-view-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.terminal-view-container .xterm {
  height: 100%;
}
```

- [ ] **Step 2: terminal-view.ts 구현**

```ts
import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { ShellPty } from './shell-pty';
import type TerminalPlugin from './main';

export const VIEW_TYPE_TERMINAL = 'terminal-view';

export class TerminalView extends ItemView {
  private terminal: Terminal | null = null;
  private fitAddon: FitAddon | null = null;
  private shellPty: ShellPty | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: TerminalPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_TERMINAL;
  }

  getDisplayText(): string {
    return 'Terminal';
  }

  getIcon(): string {
    return 'terminal';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('terminal-view-container');

    // xterm.js 초기화
    this.terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        cursor: '#f5e0dc',
      },
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.open(container);

    // 초기 fit
    setTimeout(() => {
      this.fitAddon?.fit();
      this.startShell();
    }, 50);

    // 리사이즈 감지
    this.resizeObserver = new ResizeObserver(() => {
      this.fitAddon?.fit();
      if (this.terminal && this.shellPty) {
        this.shellPty.resize(this.terminal.cols, this.terminal.rows);
      }
    });
    this.resizeObserver.observe(container);
  }

  private startShell(): void {
    if (!this.terminal) return;

    const settings = this.plugin.settings;
    const vaultPath = (this.app.vault.adapter as any).basePath || '';
    const cwd = settings.cwd || vaultPath;
    const shellPath = settings.shellPath || process.env.SHELL || '/bin/zsh';

    this.shellPty = new ShellPty(
      shellPath,
      cwd,
      this.terminal.cols,
      this.terminal.rows
    );

    // 쉘 출력 → xterm.js
    this.shellPty.onData((data) => {
      this.terminal?.write(data);
    });

    // 쉘 종료 시 메시지 표시
    this.shellPty.onExit(() => {
      this.terminal?.write('\r\n[Process exited]\r\n');
    });

    // xterm.js 키 입력 → 쉘
    this.terminal.onData((data) => {
      this.shellPty?.write(data);
    });

    this.shellPty.start();
  }

  async onClose(): Promise<void> {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.shellPty?.kill();
    this.shellPty = null;
    this.terminal?.dispose();
    this.terminal = null;
    this.fitAddon = null;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/terminal-view.ts styles.css
git commit -m "feat: add TerminalView with xterm.js and PTY integration"
```

---

### Task 7: Plugin Entry Point — main.ts 완성

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: main.ts를 완전한 플러그인으로 업데이트**

```ts
import { Plugin, WorkspaceLeaf } from 'obsidian';
import { TerminalView, VIEW_TYPE_TERMINAL } from './terminal-view';
import {
  TerminalSettings,
  DEFAULT_SETTINGS,
  TerminalSettingTab,
} from './settings';

export default class TerminalPlugin extends Plugin {
  settings: TerminalSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE_TERMINAL, (leaf) => new TerminalView(leaf, this));

    this.addRibbonIcon('terminal', 'Open Terminal', () => {
      this.activateView();
    });

    this.addCommand({
      id: 'open-terminal',
      name: 'Open Terminal',
      callback: () => {
        this.activateView();
      },
    });

    this.addSettingTab(new TerminalSettingTab(this.app, this));
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_TERMINAL);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({
        type: VIEW_TYPE_TERMINAL,
        active: true,
      });
      this.app.workspace.revealLeaf(leaf);
    }
  }
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: `main.js` 생성, 에러 없음

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: complete plugin entry point with view, ribbon, command, and settings"
```

---

### Task 8: xterm.js CSS 번들링

**Files:**
- Modify: `src/terminal-view.ts` (xterm.css import 추가)
- Modify: `esbuild.js` (CSS 처리 확인)

- [ ] **Step 1: xterm.css를 styles.css에 포함시키는 방법 확인**

Obsidian은 플러그인 디렉토리의 `styles.css`를 자동 로드한다. xterm.js의 CSS를 포함시켜야 한다.

`esbuild.js`에서 CSS loader가 `text`로 설정되어 있으므로, terminal-view.ts에서 xterm.css를 import해서 동적으로 주입한다.

- [ ] **Step 2: terminal-view.ts에 CSS 주입 로직 추가**

`onOpen()` 상단에 추가:

```ts
// xterm.css import (esbuild text loader)
import xtermCss from '@xterm/xterm/css/xterm.css';

// onOpen() 내부 시작 부분:
const styleEl = document.createElement('style');
styleEl.textContent = xtermCss;
container.appendChild(styleEl);
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: xterm.css가 번들에 포함되어 빌드 성공

- [ ] **Step 4: Commit**

```bash
git add src/terminal-view.ts esbuild.js
git commit -m "feat: bundle xterm.css into plugin"
```

---

### Task 9: 빌드 및 수동 설치 테스트

**Files:**
- No new files

- [ ] **Step 1: install.sh 실행**

Run: `bash install.sh`
Expected: Obsidian의 Electron 버전 감지, node-pty 리빌드 성공, main.js 생성

- [ ] **Step 2: 테스트 vault에 플러그인 복사**

```bash
VAULT_PLUGINS="<test-vault-path>/.obsidian/plugins/obsidian-terminal"
mkdir -p "$VAULT_PLUGINS"
cp main.js manifest.json styles.css "$VAULT_PLUGINS/"
cp -r node_modules/node-pty "$VAULT_PLUGINS/node-pty"
```

참고: node-pty 네이티브 바이너리를 플러그인 디렉토리에 함께 복사해야 한다. main.js에서 `require('node-pty')`가 이 경로를 찾을 수 있도록 해야 하며, 안 되면 shell-pty.ts에서 절대 경로로 require하도록 수정한다.

- [ ] **Step 3: Obsidian에서 플러그인 활성화 및 테스트**

1. Obsidian 재시작 (또는 Reload without saving)
2. Settings → Community plugins → obsidian-terminal 활성화
3. 리본 아이콘 클릭 → 오른쪽 사이드바에 터미널 표시 확인
4. `ls`, `echo hello` 등 기본 명령어 테스트
5. `claude` 또는 다른 AI CLI 도구 실행 테스트
6. 사이드바 크기 조절 시 터미널 리사이즈 확인

- [ ] **Step 4: node-pty 로딩 문제 해결 (필요 시)**

node-pty가 로드되지 않으면, shell-pty.ts에서 플러그인 디렉토리 기준으로 require 경로를 지정:

```ts
// shell-pty.ts 상단
const pty = require(require('path').join(
  (app as any).vault.adapter.basePath,
  '.obsidian/plugins/obsidian-terminal/node-pty'
));
```

- [ ] **Step 5: 문제 해결 후 최종 Commit**

```bash
git add -A
git commit -m "fix: resolve node-pty native module loading in obsidian"
```
