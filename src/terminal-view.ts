import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import xtermCss from '@xterm/xterm/css/xterm.css';
import { ShellPty } from './shell-pty';
import type TerminalPlugin from './main';

export const VIEW_TYPE_TERMINAL = 'terminal-view';

export class TerminalView extends ItemView {
  private terminal: Terminal | null = null;
  private fitAddon: FitAddon | null = null;
  private shellPty: ShellPty | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private writeBuffer = '';
  private writeRafId: number | null = null;
  private processPollId: ReturnType<typeof setInterval> | null = null;
  private tabName = 'zsh';

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

    // xterm.js CSS 주입
    const styleEl = document.createElement('style');
    styleEl.textContent = xtermCss;
    container.appendChild(styleEl);

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
      theme: { background: bg, foreground: fg, cursor },
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.open(container);

    try {
      this.terminal.loadAddon(new WebglAddon());
    } catch {
      // WebGL 미지원 시 Canvas 폴백
    }

    // 초기 fit + 쉘 시작
    setTimeout(() => {
      this.fitAddon?.fit();
      this.startShell();
    }, 50);

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
    this.resizeObserver.observe(container);

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

      this.shellPty = new ShellPty(shellPath, cwd, this.terminal.cols, this.terminal.rows);

      // 쉘 출력 → xterm.js (RAF 배칭)
      this.shellPty.onData((data) => {
        this.writeBuffer += data;
        if (this.writeRafId === null) {
          this.writeRafId = requestAnimationFrame(() => {
            if (this.terminal && this.writeBuffer) {
              this.terminal.write(this.writeBuffer);
              this.writeBuffer = '';
            }
            this.writeRafId = null;
          });
        }
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
          if (procName && procName !== this.tabName) {
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
    if (this.writeRafId !== null) cancelAnimationFrame(this.writeRafId);
    if (this.processPollId) clearInterval(this.processPollId);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.shellPty?.kill();
    this.shellPty = null;
    this.terminal?.dispose();
    this.terminal = null;
    this.fitAddon = null;
  }
}
