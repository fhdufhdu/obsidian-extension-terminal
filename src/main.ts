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
