import { App, PluginSettingTab, Setting } from 'obsidian';
import type TerminalPlugin from './main';

export interface HistoryEntry {
  text: string;
  timestamp: number;
}

export interface TerminalSettings {
  shellPath: string;
  cwd: string;
  terminalHistory: HistoryEntry[];
  terminalCurrentInput: string;
}

export const DEFAULT_SETTINGS: TerminalSettings = {
  shellPath: process.env.SHELL || '/bin/zsh',
  cwd: '',
  terminalHistory: [],
  terminalCurrentInput: '',
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
