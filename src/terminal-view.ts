import * as path from 'path';
import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { WebLinksAddon } from '@xterm/addon-web-links';
import xtermCss from '@xterm/xterm/css/xterm.css';
import { ShellPty } from './shell-pty';
import type TerminalPlugin from './main';
import type { HistoryEntry } from './settings';

export const VIEW_TYPE_TERMINAL = 'terminal-view';

export class TerminalView extends ItemView {
  private terminal: Terminal | null = null;
  private fitAddon: FitAddon | null = null;
  private webglAddon: WebglAddon | null = null;
  private shellPty: ShellPty | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private processPollId: ReturnType<typeof setInterval> | null = null;
  private tabName = 'terminal';

  constructor(leaf: WorkspaceLeaf, private plugin: TerminalPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_TERMINAL;
  }

  getDisplayText(): string {
    return this.tabName;
  }

  getIcon(): string {
    return 'terminal';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('terminal-view-container');

    // xterm.js CSS 주입 + 프롬프트 바 스타일
    const styleEl = document.createElement('style');
    styleEl.textContent = xtermCss + `
      .terminal-view-container {
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .terminal-xterm-wrapper {
        flex: 1;
        min-height: 0;
        overflow: hidden;
      }
      .terminal-prompt-bar {
        display: flex;
        gap: 4px;
        padding: 4px;
        margin-bottom: 33px;
        border-top: 1px solid var(--background-modifier-border);
        background: var(--background-primary);
      }
      .terminal-prompt-bar textarea {
        flex: 1;
        padding: 4px 8px;
        border: 1px solid var(--background-modifier-border);
        border-radius: 4px;
        background: var(--background-secondary);
        color: var(--text-normal);
        font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
        font-size: 13px;
        resize: none;
        outline: none;
      }
      .terminal-prompt-bar textarea:focus {
        border-color: var(--interactive-accent);
      }
      .terminal-prompt-bar button {
        align-self: stretch;
        height: auto;
        padding: 4px 12px;
        background: var(--interactive-accent);
        color: var(--text-on-accent);
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
      }
      .terminal-prompt-bar button:hover {
        opacity: 0.85;
      }
      .terminal-xterm-wrapper .xterm-viewport {
        overflow-y: scroll !important;
        scrollbar-width: thin !important;
      }
      .terminal-xterm-wrapper .xterm-viewport::-webkit-scrollbar {
        width: 10px !important;
        display: block !important;
      }
      .terminal-xterm-wrapper .xterm-viewport::-webkit-scrollbar-track {
        background: transparent !important;
      }
      .terminal-xterm-wrapper .xterm-viewport::-webkit-scrollbar-thumb {
        background: rgba(128, 128, 128, 0.4) !important;
        border-radius: 5px !important;
      }
      .terminal-xterm-wrapper .xterm-viewport::-webkit-scrollbar-thumb:hover {
        background: rgba(128, 128, 128, 0.6) !important;
      }
    `;
    container.appendChild(styleEl);

    // xterm wrapper
    const xtermWrapper = container.createDiv({ cls: 'terminal-xterm-wrapper' });

    // 테마 색상 계산
    const computedBg = getComputedStyle(container).backgroundColor;
    const bg = (computedBg && computedBg !== 'rgba(0, 0, 0, 0)')
      ? computedBg
      : getComputedStyle(container.parentElement || document.body).backgroundColor || '#1e1e2e';
    const styles = getComputedStyle(document.body);
    const fg = styles.getPropertyValue('--text-normal').trim() || '#cdd6f4';
    const cursor = styles.getPropertyValue('--text-accent').trim() || '#f5e0dc';

    // xterm.js 초기화
    this.terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      scrollback: 10000,
      theme: { background: bg, foreground: fg, cursor },
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.open(xtermWrapper);

    try {
      this.webglAddon = new WebglAddon();
      this.terminal.loadAddon(this.webglAddon);
    } catch {
      this.webglAddon = null;
    }

    this.terminal.loadAddon(new WebLinksAddon((_, uri) => {
      window.open(uri, '_blank');
    }));

    // 파일 경로 링크 감지
    const filePathRegex = /(?:^|\s)((?:\/[\w.\-@]+)+(?::(\d+)(?::(\d+))?)?)(?=\s|$|[;,)}\]>'"」』】])/;
    this.terminal.registerLinkProvider({
      provideLinks: (lineNumber, callback) => {
        const line = this.terminal?.buffer.active.getLine(lineNumber - 1)?.translateToString() || '';
        const links: { startIndex: number; length: number; text: string }[] = [];
        let match: RegExpExecArray | null;
        const globalRegex = new RegExp(filePathRegex.source, 'g');
        while ((match = globalRegex.exec(line)) !== null) {
          const fullMatch = match[1];
          const startIndex = match.index + match[0].indexOf(fullMatch);
          links.push({
            startIndex,
            length: fullMatch.length,
            text: fullMatch,
            activate: (_e: MouseEvent, text: string) => {
              const parts = text.match(/^(.+?)(?::(\d+))?(?::(\d+))?$/);
              if (!parts) return;
              const filePath = parts[1];
              const vaultPath = (this.app.vault.adapter as any).basePath || '';
              if (filePath.startsWith(vaultPath)) {
                const relativePath = filePath.slice(vaultPath.length + 1);
                this.app.workspace.openLinkText(relativePath, '', false);
              } else {
                // vault 외부 파일은 시스템 기본 앱으로
                // @ts-ignore
                require('electron').shell.openPath(filePath);
              }
            },
          } as any);
        }
        callback(links.length > 0 ? links : undefined);
      },
    });

    // 초기 fit + 쉘 시작
    setTimeout(() => {
      this.fitAddon?.fit();
      this.startShell();
    }, 50);

    // 프롬프트 바
    const promptBar = container.createDiv({ cls: 'terminal-prompt-bar' });
    const promptInput = promptBar.createEl('textarea', {
      attr: { placeholder: '프롬프트 입력 (Enter 전송, Shift+Enter 개행)', rows: '3' },
    });
    const sendBtn = promptBar.createEl('button', { text: '▶' });

    // line-height 기반으로 4줄 높이 고정
    const lineHeight = parseFloat(getComputedStyle(promptInput).lineHeight) || 17;
    const fixedHeight = Math.ceil(lineHeight * 4 + 8) + 'px'; // +8 for padding
    promptInput.style.height = fixedHeight;
    promptInput.style.minHeight = fixedHeight;

    // 히스토리 영속화: 설정에서 복원
    let promptHistory: HistoryEntry[] = this.plugin.settings.terminalHistory || [];
    let historyIndex = -1;
    let currentInput = this.plugin.settings.terminalCurrentInput || '';
    let saveTimer: ReturnType<typeof setTimeout> | null = null;

    // 복원된 currentInput이 있으면 textarea에 반영
    if (currentInput) {
      promptInput.value = currentInput;
    }

    const syncHistory = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const trimmed = promptHistory.slice(-100);
        this.plugin.settings.terminalHistory = trimmed;
        this.plugin.settings.terminalCurrentInput = currentInput;
        this.plugin.saveSettings();
      }, 500);
    };

    const sendPrompt = () => {
      const text = promptInput.value.trim();
      if (!text) return;
      this.shellPty?.write(text);
      setTimeout(() => this.shellPty?.write('\r'), 50);

      if (historyIndex === -1) {
        promptHistory.push({ text, timestamp: Date.now() });
      } else {
        promptHistory[historyIndex].timestamp = Date.now();
      }

      historyIndex = -1;
      currentInput = '';
      promptInput.value = '';
      syncHistory();
    };

    const isAtFirstLine = () => {
      return promptInput.selectionStart <= (promptInput.value.indexOf('\n') === -1
        ? promptInput.value.length
        : promptInput.value.indexOf('\n'));
    };

    const isAtLastLine = () => {
      const lastNewline = promptInput.value.lastIndexOf('\n');
      return promptInput.selectionEnd > lastNewline;
    };

    promptInput.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendPrompt();
        return;
      }
      if (e.key === 'ArrowUp' && isAtFirstLine()) {
        if (promptHistory.length === 0) return;
        e.preventDefault();
        if (historyIndex === -1) {
          historyIndex = promptHistory.length - 1;
        } else if (historyIndex > 0) {
          historyIndex--;
        }
        promptInput.value = promptHistory[historyIndex].text;
      }
      if (e.key === 'ArrowDown' && isAtLastLine()) {
        if (historyIndex === -1) return;
        e.preventDefault();
        if (historyIndex < promptHistory.length - 1) {
          historyIndex++;
          promptInput.value = promptHistory[historyIndex].text;
        } else {
          historyIndex = -1;
          promptInput.value = currentInput;
        }
      }
    });

    // input 이벤트로 실시간 편집 추적 (in-place mutation)
    promptInput.addEventListener('input', () => {
      if (historyIndex === -1) {
        currentInput = promptInput.value;
      } else {
        promptHistory[historyIndex].text = promptInput.value;
      }
      syncHistory();
    });

    sendBtn.addEventListener('click', sendPrompt);

    // 리사이즈 감지 (디바운스)
    let resizeTimeout: ReturnType<typeof setTimeout>;
    this.resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        this.fitAddon?.fit();
        if (this.terminal && this.shellPty) {
          this.shellPty.resize(this.terminal.cols, this.terminal.rows);
        }
      }, 100);
    });
    this.resizeObserver.observe(xtermWrapper);

    // 테마 변경 실시간 반영
    this.registerEvent(
      this.app.workspace.on('css-change', () => {
        const s = getComputedStyle(document.body);
        const c = this.containerEl.children[1] as HTMLElement;
        const cBg = getComputedStyle(c).backgroundColor;
        const newBg = (cBg && cBg !== 'rgba(0, 0, 0, 0)')
          ? cBg
          : getComputedStyle(c.parentElement || document.body).backgroundColor || '#1e1e2e';
        const newFg = s.getPropertyValue('--text-normal').trim() || '#cdd6f4';
        const newCursor = s.getPropertyValue('--text-accent').trim() || '#f5e0dc';
        if (this.terminal) {
          this.terminal.options.theme = { background: newBg, foreground: newFg, cursor: newCursor };
        }
      })
    );
  }

  private startShell(): void {
    if (!this.terminal) return;

    try {
      const settings = this.plugin.settings;
      const vaultPath = (this.app.vault.adapter as any).basePath || '';
      const cwd = settings.cwd || vaultPath;
      const shellPath = settings.shellPath || process.env.SHELL || '/bin/zsh';
      
      // 플러그인 설치 경로 계산 (bin/ 바이너리 위치를 찾기 위함)
      const pluginDir = path.join(vaultPath, '.obsidian', 'plugins', this.plugin.manifest.id);

      this.shellPty = new ShellPty(pluginDir, shellPath, cwd, this.terminal.cols, this.terminal.rows);

      // 쉘 출력 → xterm.js
      this.shellPty.onData((data) => {
        this.terminal?.write(data);
      });

      // 쉘 종료 시 메시지
      this.shellPty.onExit(() => {
        this.terminal?.write('\r\n[Process exited]\r\n');
        if (this.processPollId) {
          clearInterval(this.processPollId);
          this.processPollId = null;
        }
      });

      // 키 입력 → 쉘
      this.terminal.onData((data) => {
        this.shellPty?.write(data);
      });

      this.shellPty.start();

      // 포그라운드 프로세스 이름 폴링 → Obsidian 탭 이름 업데이트
      this.processPollId = setInterval(async () => {
        if (this.shellPty) {
          const procName = await this.shellPty.getForegroundProcessName();
          if (procName && procName !== this.tabName && procName !== 'shell') {
            this.tabName = procName;
            // Obsidian 탭 타이틀 갱신
            (this.leaf as any).updateHeader?.();
          }
        }
      }, 2000);

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.terminal?.write(`\r\n[Failed to start shell: ${message}]\r\n`);
    }
  }

  async onClose(): Promise<void> {
    if (this.processPollId) clearInterval(this.processPollId);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.shellPty?.kill();
    this.shellPty = null;
    try { this.webglAddon?.dispose(); } catch { /* already disposed */ }
    this.webglAddon = null;
    this.terminal?.dispose();
    this.terminal = null;
    this.fitAddon = null;
  }
}
