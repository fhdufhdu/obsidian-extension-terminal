import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import * as os from 'os';
import * as readline from 'readline';

interface BridgeMessage {
  type: 'output' | 'exit';
  data?: string;
  code?: number;
}

export class ShellPty {
  private bridgeProcess: ChildProcess | undefined;
  private disposed = false;

  private dataCallbacks: ((data: string) => void)[] = [];
  private exitCallbacks: (() => void)[] = [];

  constructor(
    private pluginDir: string,
    private shellPath: string,
    private cwd: string,
    private cols: number,
    private rows: number
  ) {}

  private getBridgeBinaryName(): string {
    const platform = os.platform();
    const arch = os.arch();
    
    // Obsidian은 보통 x64나 arm64를 사용하므로 이에 맞춰 이름을 생성
    let archName = arch;
    if (arch === 'x64') archName = 'amd64'; // Go 스타일
    
    let name = `pty-bridge-${platform}-${archName}`;
    if (platform === 'win32') {
      name += '.exe';
    }
    return name;
  }

  start(): void {
    try {
      const bridgeBinary = this.getBridgeBinaryName();
      const bridgePath = path.join(this.pluginDir, 'bin', bridgeBinary);

      // Go 브릿지 실행
      this.bridgeProcess = spawn(bridgePath, [], {
        cwd: this.cwd,
        env: { 
          ...process.env, 
          LANG: process.env.LANG || 'ko_KR.UTF-8',
          LC_ALL: process.env.LC_ALL || 'ko_KR.UTF-8',
          COLORTERM: 'truecolor', 
          TERM_PROGRAM: 'obsidian' 
        }
      });

      // 브릿지로부터의 출력을 처리 (JSON 한 줄 단위)
      if (this.bridgeProcess.stdout) {
        const rl = readline.createInterface({
          input: this.bridgeProcess.stdout,
          terminal: false
        });

        rl.on('line', (line) => {
          if (this.disposed) return;
          try {
            const msg: BridgeMessage = JSON.parse(line);
            if (msg.type === 'output' && msg.data) {
              this.dataCallbacks.forEach(cb => cb(msg.data!));
            } else if (msg.type === 'exit') {
              this.handleExit();
            }
          } catch (e) {
            // JSON 파싱 실패 시 무시
          }
        });
      }

      this.bridgeProcess.on('error', (err) => {
        this.dataCallbacks.forEach(cb => cb(`\r\n[Bridge Error]: ${err.message}\r\n`));
        this.handleExit();
      });

      // 초기 크기 설정
      this.resize(this.cols, this.rows);

    } catch (e) {
      this.dataCallbacks.forEach(cb => cb(`\r\n[Fatal Error]: ${e}\r\n`));
      this.handleExit();
    }
  }

  private handleExit(): void {
    if (this.disposed) return;
    this.exitCallbacks.forEach(cb => cb());
  }

  getPid(): number | undefined {
    return this.bridgeProcess?.pid;
  }

  // 쉘 이름을 가져오는 로직 (Go 브릿지에서 처리하므로 간단히 유지)
  async getForegroundProcessName(): Promise<string> {
    return 'shell'; 
  }

  write(data: string): void {
    if (this.bridgeProcess && this.bridgeProcess.stdin && !this.disposed) {
      const msg = JSON.stringify({ type: 'input', data: data });
      this.bridgeProcess.stdin.write(msg + '\n');
    }
  }

  resize(cols: number, rows: number): void {
    if (this.bridgeProcess && this.bridgeProcess.stdin && !this.disposed) {
      const msg = JSON.stringify({ 
        type: 'resize', 
        cols: cols, 
        rows: rows 
      });
      this.bridgeProcess.stdin.write(msg + '\n');
    }
  }

  onData(callback: (data: string) => void): void {
    this.dataCallbacks.push(callback);
  }

  onExit(callback: () => void): void {
    this.exitCallbacks.push(callback);
  }

  kill(): void {
    this.disposed = true;
    if (this.bridgeProcess) {
      this.bridgeProcess.kill();
    }
    this.bridgeProcess = undefined;
    this.dataCallbacks = [];
    this.exitCallbacks = [];
  }
}
