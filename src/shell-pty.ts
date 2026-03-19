import * as path from 'path';
import { execFile } from 'child_process';

const HIGH_WATER_MARK = 10 * 1024; // 10KB — 이 이상 쌓이면 pty 일시정지
const LOW_WATER_MARK = 1024;       // 1KB — 이 이하로 내려가면 pty 재개

// node-pty는 런타임에 플러그인 디렉토리 경로를 받아서 로드
let pty: typeof import('node-pty');

export function loadNodePty(pluginDir: string): void {
  const ptyPath = path.join(pluginDir, 'node_modules', 'node-pty');
  pty = require(ptyPath);
}

export class ShellPty {
  private ptyProcess: any;
  private disposed = false;
  private lastCols = 0;
  private lastRows = 0;

  // 백프레셔 관련
  private writeQueue: string[] = [];
  private queueSize = 0;
  private draining = false;
  private paused = false;

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

    this.lastCols = this.cols;
    this.lastRows = this.rows;
    this.ptyProcess = pty.spawn(this.shellPath, ['--login'], {
      name: 'xterm-256color',
      cols: this.cols,
      rows: this.rows,
      cwd: this.cwd,
      env,
    });

    this.ptyProcess.onData((data: string) => {
      if (this.disposed) return;
      this.enqueueWrite(data);
    });

    this.ptyProcess.onExit(() => {
      if (!this.disposed) {
        this.exitCallbacks.forEach((cb) => cb());
      }
    });
  }

  /** 백프레셔: 큐에 데이터 추가, HIGH_WATER 초과 시 PTY 일시정지 */
  private enqueueWrite(data: string): void {
    this.writeQueue.push(data);
    this.queueSize += data.length;

    if (!this.paused && this.queueSize > HIGH_WATER_MARK) {
      this.paused = true;
      this.ptyProcess?.pause();
    }

    this.drainQueue();
  }

  /** 큐에서 청크 단위로 꺼내서 콜백 호출, LOW_WATER 이하로 내려가면 PTY 재개 */
  private drainQueue(): void {
    if (this.draining) return;
    this.draining = true;

    const step = () => {
      if (this.disposed || this.writeQueue.length === 0) {
        this.draining = false;
        return;
      }

      const chunk = this.writeQueue.shift()!;
      this.queueSize -= chunk.length;
      this.dataCallbacks.forEach((cb) => cb(chunk));

      if (this.paused && this.queueSize <= LOW_WATER_MARK) {
        this.paused = false;
        this.ptyProcess?.resume();
      }

      if (this.writeQueue.length > 0) {
        setTimeout(step, 0);
      } else {
        this.draining = false;
      }
    };

    step();
  }

  /** PTY의 PID를 반환 */
  getPid(): number | undefined {
    return this.ptyProcess?.pid;
  }

  /**
   * TTY의 포그라운드 프로세스 이름을 ps로 조회 (macOS)
   */
  getForegroundProcessName(): Promise<string> {
    return new Promise((resolve) => {
      const pid = this.ptyProcess?.pid;
      if (!pid) {
        resolve('');
        return;
      }

      execFile('ps', ['-o', 'tty=', '-p', String(pid)], (err, stdout) => {
        const tty = stdout?.trim();
        if (err || !tty || tty === '?') {
          resolve(this.ptyProcess?.process?.split('/').pop() || '');
          return;
        }

        execFile('ps', ['-t', tty, '-o', 'stat=,comm='], (err2, stdout2) => {
          if (err2 || !stdout2) {
            resolve(this.ptyProcess?.process?.split('/').pop() || '');
            return;
          }

          const lines = stdout2.split('\n').map(l => l.trim()).filter(Boolean);
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

  /** 리사이즈 중복 방지 — 동일 크기면 무시 */
  resize(cols: number, rows: number): void {
    if (this.disposed) return;
    if (cols === this.lastCols && rows === this.lastRows) return;
    this.lastCols = cols;
    this.lastRows = rows;
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
    this.writeQueue = [];
    this.queueSize = 0;
  }
}
