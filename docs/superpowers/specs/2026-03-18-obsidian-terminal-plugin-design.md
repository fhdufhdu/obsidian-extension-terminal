# Obsidian Terminal Plugin Design

## Overview

Obsidian 오른쪽 사이드바에 완전한 터미널 에뮬레이터를 제공하는 플러그인. node-pty + xterm.js를 사용하여 실제 쉘 프로세스를 실행하며, AI CLI 도구(claude, gemini 등)를 노트와 나란히 사용할 수 있다.

## Goals

- 오른쪽 사이드 패널에 터미널 뷰 하나를 띄운다
- node-pty로 실제 쉘 프로세스를 생성하고 xterm.js로 렌더링한다
- 커맨드 팔레트와 리본 아이콘으로 터미널을 열 수 있다
- 수동 설치 방식 (vault/.obsidian/plugins/에 복사)

## Non-Goals

- 커스텀 명령어 목록/프리셋 관리
- 여러 터미널 탭/세션 관리
- 커뮤니티 플러그인 등록
- 테마 커스터마이징
- Windows/Linux 지원 (macOS 전용)

## Architecture

```
Plugin (main.ts)
  ├── registerView("terminal-view", TerminalView)
  ├── addRibbonIcon("terminal", callback)
  ├── addCommand("open-terminal", callback)
  └── addSettingTab(TerminalSettingTab)

TerminalView (terminal-view.ts, extends ItemView)
  ├── xterm.js Terminal 인스턴스 생성/렌더링
  ├── xterm FitAddon으로 사이드바 크기에 맞춤
  └── node-pty 쉘 프로세스 연결

ShellPty (shell-pty.ts)
  └── node-pty로 쉘 프로세스 생성/관리
```

### node-pty 네이티브 모듈 로딩 전략

node-pty는 C++ 네이티브 애드온이므로 특별한 처리가 필요하다:

1. **esbuild에서 external 처리**: `node-pty`를 esbuild external로 설정하여 번들에 포함하지 않음
2. **네이티브 바이너리 번들링**: electron-rebuild로 Obsidian의 Electron 버전에 맞춰 빌드한 `.node` 파일을 플러그인 디렉토리에 함께 배포
3. **런타임 로딩**: `require('node-pty')`가 번들된 네이티브 바이너리를 찾을 수 있도록 모듈 경로를 설정. VS Code 확장의 패턴을 참조하여 `process.dlopen` 또는 커스텀 require 경로로 해결

## Components

### 1. main.ts — Plugin Entry Point

- `onload()`: 뷰 등록, 리본 아이콘 추가, 커맨드 팔레트 명령어 등록
- `onunload()`: 뷰 해제
- `activateView()`: 오른쪽 사이드바에 터미널 뷰 활성화. 이미 열려있으면 포커스만 이동

### 2. terminal-view.ts — Terminal View

- `ItemView`를 확장
- `getViewType()`: `"terminal-view"` 반환
- `getDisplayText()`: `"Terminal"` 반환
- `getIcon()`: `"terminal"` (Lucide 내장 아이콘)
- `onOpen()`:
  - xterm.js Terminal 인스턴스 생성
  - FitAddon 로드하여 컨테이너 크기에 맞춤
  - node-pty 쉘 프로세스 생성
  - pty.onData → terminal.write (쉘 출력 → 화면)
  - terminal.onData → pty.write (키 입력 → 쉘)
  - ResizeObserver로 사이드바 크기 변경 시 터미널 리사이즈
- `onClose()`:
  - 쉘 프로세스 종료 (pty.kill)
  - xterm.js 인스턴스 dispose

### 3. shell-pty.ts — Shell Process Manager

- `createPty(cwd: string, cols: number, rows: number)`: node-pty 프로세스 생성
  - 쉘: 환경변수 `SHELL` 또는 macOS 기본 `/bin/zsh`
  - cwd: vault 경로 (기본값)
- `resize(cols, rows)`: 터미널 크기 변경
- `write(data)`: 쉘에 데이터 전송
- `kill()`: 프로세스 종료
- `onData(callback)`: 쉘 출력 이벤트 리스너

## User Flow

1. 사용자가 리본 아이콘 클릭 또는 커맨드 팔레트에서 "Open Terminal" 실행
2. 오른쪽 사이드바에 TerminalView 활성화
3. xterm.js 터미널이 렌더링되고 쉘 프로세스가 시작됨
4. 사용자가 터미널에서 명령어 입력 (`claude`, `gemini`, `ls`, 등)
5. 사이드바 크기 조절 시 터미널이 자동으로 리사이즈
6. 뷰를 닫으면 쉘 프로세스가 종료됨

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| shellPath | string | `process.env.SHELL` or `/bin/zsh` | 사용할 쉘 경로 |
| cwd | string | vault path | 터미널 시작 디렉토리 |

### Settings UI

`PluginSettingTab`을 확장한 `TerminalSettingTab`에서 위 설정을 관리한다.
- `loadData()`/`saveData()`로 설정 영속화
- 설정 인터페이스: `{ shellPath: string; cwd: string }`
- 각 설정은 텍스트 입력 필드로 제공

### Lifecycle

- 터미널 뷰를 닫으면 쉘 프로세스가 종료되고 상태는 유지되지 않음
- 다시 열면 새로운 쉘 프로세스가 시작됨 (상태 복원 없음)

### Styling

- xterm.js 컨테이너가 뷰 영역 전체를 채움 (`width: 100%; height: 100%`)
- 별도의 커스텀 스타일은 최소한으로 유지 (xterm.js 기본 스타일 활용)

## Dependencies

| Package | Purpose |
|---------|---------|
| `node-pty` | 쉘 pseudo-terminal 생성 |
| `xterm` | 터미널 에뮬레이터 UI |
| `@xterm/addon-fit` | 컨테이너 크기에 맞춤 |
| `obsidian` | Obsidian Plugin API |

## Build

- TypeScript + esbuild
- node-pty는 네이티브 모듈이므로 Obsidian의 Electron 버전에 맞춰 electron-rebuild 필요
- 출력: `main.js`, `manifest.json`, `styles.css`를 vault/.obsidian/plugins/obsidian-terminal/에 복사

## Risks

- **node-pty + Electron 호환성**: Obsidian의 Electron 버전에 맞춰 네이티브 모듈을 빌드해야 함. VS Code 확장에서 이미 해결한 electron-rebuild 패턴을 재사용.
- **사이드바 크기 제약**: 좁은 사이드바에서 터미널 가독성이 떨어질 수 있음. FitAddon이 자동으로 cols/rows를 조정하므로 기본적으로 대응됨.
