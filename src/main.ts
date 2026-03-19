import * as path from 'path';
import { Plugin } from 'obsidian';
import { TerminalView, VIEW_TYPE_TERMINAL } from './terminal-view';
import {
  TerminalSettings,
  DEFAULT_SETTINGS,
  TerminalSettingTab,
} from './settings';
import { loadNodePty } from './shell-pty';

export default class TerminalPlugin extends Plugin {
  settings: TerminalSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    // 플러그인 디렉토리에서 node-pty 네이티브 모듈 로드
    const vaultPath = (this.app.vault.adapter as any).basePath;
    const pluginDir = path.join(vaultPath, '.obsidian', 'plugins', this.manifest.id);
    loadNodePty(pluginDir);

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

    this.addCommand({
      id: 'close-terminal-tab',
      name: 'Close Terminal Tab',
      checkCallback: (checking: boolean) => {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);
        if (leaves.length === 0) return false;

        const view = leaves[0].view as TerminalView;
        if (view.getTabCount() <= 1) return false;

        if (!checking) {
          view.tryCloseActiveTab();
        }
        return true;
      },
      hotkeys: [{ modifiers: ['Mod'], key: 'w' }],
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
