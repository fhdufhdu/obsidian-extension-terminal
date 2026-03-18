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
