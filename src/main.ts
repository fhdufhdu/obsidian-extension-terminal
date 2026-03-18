import { Plugin } from 'obsidian';

export default class TerminalPlugin extends Plugin {
  async onload() {
    console.log('Terminal plugin loaded');
  }
  onunload() {
    console.log('Terminal plugin unloaded');
  }
}
