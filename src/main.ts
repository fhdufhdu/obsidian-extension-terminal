import { Plugin } from 'obsidian';
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
      this.openNewTerminal();
    });

    this.addCommand({
      id: 'open-terminal',
      name: 'Open Terminal',
      callback: () => {
        this.openNewTerminal();
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

  /** 매번 새 터미널 탭을 에디터 영역에 생성 */
  private async openNewTerminal(): Promise<void> {
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({
      type: VIEW_TYPE_TERMINAL,
      active: true,
    });
    this.app.workspace.revealLeaf(leaf);
  }
}
