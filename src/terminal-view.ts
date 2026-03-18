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

    // xterm.js CSS 주입
    const styleEl = document.createElement('style');
    styleEl.textContent = xtermCss;
    container.appendChild(styleEl);

    // xterm.js 초기화 (Obsidian 컨테이너의 실제 배경색을 가져와서 사용)
    const computedBg = getComputedStyle(container).backgroundColor;
    // computedBg가 transparent이면 부모 요소에서 가져옴
    const bg = (computedBg && computedBg !== 'rgba(0, 0, 0, 0)')
      ? computedBg
      : getComputedStyle(container.parentElement || document.body).backgroundColor || '#1e1e2e';
    const styles = getComputedStyle(document.body);
    const fg = styles.getPropertyValue('--text-normal').trim() || '#cdd6f4';
    const cursor = styles.getPropertyValue('--text-accent').trim() || '#f5e0dc';

    this.terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: bg,
        foreground: fg,
        cursor: cursor,
      },
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.open(container);

    // WebGL 렌더러 로드 (Canvas보다 깜빡임/렌더링 갭 없음)
    try {
      this.terminal.loadAddon(new WebglAddon());
    } catch {
      // WebGL 미지원 시 Canvas 폴백
    }

    // 초기 fit
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
  }

  private startShell(): void {
    if (!this.terminal) return;

    try {
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

      // 쉘 출력 → xterm.js (RAF로 배칭하여 깜빡임 방지)
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

      // 쉘 종료 시 메시지 표시
      this.shellPty.onExit(() => {
        this.terminal?.write('\r\n[Process exited]\r\n');
      });

      // xterm.js 키 입력 → 쉘
      this.terminal.onData((data) => {
        this.shellPty?.write(data);
      });

      this.shellPty.start();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.terminal?.write(`\r\n[Failed to start shell: ${message}]\r\n`);
    }
  }

  async onClose(): Promise<void> {
    if (this.writeRafId !== null) {
      cancelAnimationFrame(this.writeRafId);
      this.writeRafId = null;
    }
    this.writeBuffer = '';
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.shellPty?.kill();
    this.shellPty = null;
    this.terminal?.dispose();
    this.terminal = null;
    this.fitAddon = null;
  }
}
