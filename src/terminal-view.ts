import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import xtermCss from '@xterm/xterm/css/xterm.css';
import { ShellPty } from './shell-pty';
import type TerminalPlugin from './main';

export const VIEW_TYPE_TERMINAL = 'terminal-view';

interface TerminalTab {
  id: number;
  name: string;
  terminal: Terminal;
  fitAddon: FitAddon;
  shellPty: ShellPty | null;
  containerEl: HTMLElement;
  writeBuffer: string;
  writeRafId: number | null;
}

let nextTabId = 1;

export class TerminalView extends ItemView {
  private tabs: TerminalTab[] = [];
  private activeTabId: number | null = null;
  private tabBarEl: HTMLElement | null = null;
  private terminalAreaEl: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private themeColors: { bg: string; fg: string; cursor: string } | null = null;

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

    // 테마 색상 계산
    const computedBg = getComputedStyle(container).backgroundColor;
    const bg = (computedBg && computedBg !== 'rgba(0, 0, 0, 0)')
      ? computedBg
      : getComputedStyle(container.parentElement || document.body).backgroundColor || '#1e1e2e';
    const styles = getComputedStyle(document.body);
    const fg = styles.getPropertyValue('--text-normal').trim() || '#cdd6f4';
    const cursor = styles.getPropertyValue('--text-accent').trim() || '#f5e0dc';
    this.themeColors = { bg, fg, cursor };

    // 탭 바
    this.tabBarEl = container.createDiv({ cls: 'terminal-tab-bar' });
    this.renderTabBar();

    // 터미널 영역
    this.terminalAreaEl = container.createDiv({ cls: 'terminal-area' });

    // 리사이즈 감지 (디바운스)
    let resizeTimeout: ReturnType<typeof setTimeout>;
    this.resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const tab = this.getActiveTab();
        if (tab) {
          tab.fitAddon.fit();
          if (tab.shellPty) {
            tab.shellPty.resize(tab.terminal.cols, tab.terminal.rows);
          }
        }
      }, 100);
    });
    this.resizeObserver.observe(this.terminalAreaEl);

    // 첫 탭 생성
    this.createTab();
  }

  private createTab(): void {
    if (!this.terminalAreaEl || !this.themeColors) return;

    const id = nextTabId++;
    const name = `Terminal ${id}`;

    const containerEl = this.terminalAreaEl.createDiv({ cls: 'terminal-tab-content' });

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: this.themeColors.bg,
        foreground: this.themeColors.fg,
        cursor: this.themeColors.cursor,
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerEl);

    try {
      terminal.loadAddon(new WebglAddon());
    } catch {
      // WebGL 미지원 시 Canvas 폴백
    }

    const tab: TerminalTab = {
      id,
      name,
      terminal,
      fitAddon,
      shellPty: null,
      containerEl,
      writeBuffer: '',
      writeRafId: null,
    };

    this.tabs.push(tab);
    this.switchTab(id);

    // 초기 fit + 쉘 시작
    setTimeout(() => {
      fitAddon.fit();
      this.startShellForTab(tab);
    }, 50);
  }

  private startShellForTab(tab: TerminalTab): void {
    try {
      const settings = this.plugin.settings;
      const vaultPath = (this.app.vault.adapter as any).basePath || '';
      const cwd = settings.cwd || vaultPath;
      const shellPath = settings.shellPath || process.env.SHELL || '/bin/zsh';

      tab.shellPty = new ShellPty(
        shellPath,
        cwd,
        tab.terminal.cols,
        tab.terminal.rows
      );

      // 쉘 출력 → xterm.js (RAF 배칭)
      tab.shellPty.onData((data) => {
        tab.writeBuffer += data;
        if (tab.writeRafId === null) {
          tab.writeRafId = requestAnimationFrame(() => {
            if (tab.writeBuffer) {
              tab.terminal.write(tab.writeBuffer);
              tab.writeBuffer = '';
            }
            tab.writeRafId = null;
          });
        }
      });

      // 쉘 종료 시 메시지
      tab.shellPty.onExit(() => {
        tab.terminal.write('\r\n[Process exited]\r\n');
      });

      // 키 입력 → 쉘
      tab.terminal.onData((data) => {
        tab.shellPty?.write(data);
      });

      tab.shellPty.start();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      tab.terminal.write(`\r\n[Failed to start shell: ${message}]\r\n`);
    }
  }

  private switchTab(id: number): void {
    this.activeTabId = id;
    for (const tab of this.tabs) {
      if (tab.id === id) {
        tab.containerEl.style.display = 'block';
        setTimeout(() => {
          tab.fitAddon.fit();
          tab.terminal.focus();
        }, 10);
      } else {
        tab.containerEl.style.display = 'none';
      }
    }
    this.renderTabBar();
  }

  private closeTab(id: number): void {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;

    const tab = this.tabs[idx];

    // 정리
    if (tab.writeRafId !== null) cancelAnimationFrame(tab.writeRafId);
    tab.shellPty?.kill();
    tab.terminal.dispose();
    tab.containerEl.remove();
    this.tabs.splice(idx, 1);

    // 남은 탭이 없으면 새로 생성
    if (this.tabs.length === 0) {
      this.createTab();
      return;
    }

    // 닫은 탭이 활성 탭이었으면 인접 탭으로 전환
    if (this.activeTabId === id) {
      const newIdx = Math.min(idx, this.tabs.length - 1);
      this.switchTab(this.tabs[newIdx].id);
    } else {
      this.renderTabBar();
    }
  }

  private renderTabBar(): void {
    if (!this.tabBarEl) return;
    this.tabBarEl.empty();

    for (const tab of this.tabs) {
      const tabEl = this.tabBarEl.createDiv({
        cls: `terminal-tab ${tab.id === this.activeTabId ? 'is-active' : ''}`,
      });

      const labelEl = tabEl.createSpan({ cls: 'terminal-tab-label', text: tab.name });
      labelEl.addEventListener('click', () => this.switchTab(tab.id));

      const closeEl = tabEl.createSpan({ cls: 'terminal-tab-close' });
      setIcon(closeEl, 'x');
      closeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeTab(tab.id);
      });
    }

    // + 버튼
    const addEl = this.tabBarEl.createDiv({ cls: 'terminal-tab-add' });
    setIcon(addEl, 'plus');
    addEl.addEventListener('click', () => this.createTab());
  }

  private getActiveTab(): TerminalTab | undefined {
    return this.tabs.find((t) => t.id === this.activeTabId);
  }

  async onClose(): Promise<void> {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    for (const tab of this.tabs) {
      if (tab.writeRafId !== null) cancelAnimationFrame(tab.writeRafId);
      tab.shellPty?.kill();
      tab.terminal.dispose();
    }
    this.tabs = [];
    this.activeTabId = null;
  }
}
