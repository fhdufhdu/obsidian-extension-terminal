# CLAUDE.md

## Git 작업 규칙

### 커밋 전 준비
1. `gh auth switch --user fhdufhdu`로 계정 전환
2. 모든 커밋에 `--author="fhdufhdu <fhdufhdu@gmail.com>"` 사용
3. **커밋 메시지는 한글로 작성**

### 커밋 단위
- 기능 단위로 커밋 (하나의 커밋에 여러 기능 혼합 금지)

### Push
- `main` 브랜치에 push

### 작업 완료 후
- `gh auth switch --user chowooseong`으로 계정 복원

## 빌드 및 설치

```bash
# 볼트 경로를 인자로 전달하여 자동 설치 (공백 경로 포함 시 따옴표 사용)
bash install.sh "/Users/경로/MyVault"
```

- Go 환경 필요 (PTY 브릿지 빌드용)
- Node 20 필요 (`nvm use 20`)
- 더 이상 `electron-rebuild`나 `node-pty`를 사용하지 않음 (Go PTY 브릿지 방식)
- 빌드 후 바이너리와 JS 파일이 지정된 vault의 `.obsidian/plugins/obsidian-terminal/`에 배포됨
- 설치 후 Obsidian에서 플러그인 Reload 또는 활성화 필요
