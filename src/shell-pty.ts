import * as path from 'path';
import { execFile } from 'child_process';

// node-pty는 런타임에 플러그인 디렉토리 경로를 받아서 로드
let pty: typeof import('node-pty');

export function loadNodePty(pluginDir: string): void {
  const ptyPath = path.join(pluginDir, 'node_modules', 'node-pty');
  pty = require(ptyPath);
}

export class ShellPty {
  private ptyProcess: any;
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

    this.ptyProcess.onData((data: string) => {
      if (this.disposed) return;
      this.dataCallbacks.forEach((cb) => cb(data));
    });

    this.ptyProcess.onExit(() => {
      if (!this.disposed) {
        this.exitCallbacks.forEach((cb) => cb());
      }
    });
  }

  /** PTY의 PID를 반환 */
  getPid(): number | undefined {
    return this.ptyProcess?.pid;
  }

  /**
   * TTY의 포그라운드 프로세스 이름을 ps로 조회 (macOS)
   * pty.process는 초기 쉘만 반환하므로 ps로 실제 포그라운드 프로세스를 찾음
   */
  getForegroundProcessName(): Promise<string> {
    return new Promise((resolve) => {
      const pid = this.ptyProcess?.pid;
      if (!pid) {
        resolve('');
        return;
      }

      // 1단계: pid에서 tty 이름 추출
      execFile('ps', ['-o', 'tty=', '-p', String(pid)], (err, stdout) => {
        const tty = stdout?.trim();
        if (err || !tty || tty === '?') {
          resolve(this.ptyProcess?.process?.split('/').pop() || '');
          return;
        }

        // 2단계: 해당 tty의 포그라운드 프로세스 찾기 (stat에 +가 있는 프로세스)
        execFile('ps', ['-t', tty, '-o', 'stat=,comm='], (err2, stdout2) => {
          if (err2 || !stdout2) {
            resolve(this.ptyProcess?.process?.split('/').pop() || '');
            return;
          }

          const lines = stdout2.split('\n').map(l => l.trim()).filter(Boolean);
          // 포그라운드(+) 프로세스 중 마지막 것 (가장 최근 실행)
          let fgName = '';
          for (const line of lines) {
            const match = line.match(/^(\S+)\s+(.+)$/);
            if (match && match[1].includes('+')) {
              fgName = match[2].split('/').pop() || match[2];
            }
          }
          resolve(fgName || this.ptyProcess?.process?.split('/').pop() || '');
        });
      });
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
