#!/bin/bash
set -e

# Obsidian 앱 경로 (macOS)
OBSIDIAN_APP="/Applications/Obsidian.app"

if [ ! -d "$OBSIDIAN_APP" ]; then
  echo "Error: Obsidian.app을 찾을 수 없습니다. ($OBSIDIAN_APP)" && exit 1
fi

# Obsidian의 Electron 버전 감지 (Electron Framework 바이너리에서 추출)
ELECTRON_FRAMEWORK="$OBSIDIAN_APP/Contents/Frameworks/Electron Framework.framework/Electron Framework"
ELECTRON_VERSION=$(strings "$ELECTRON_FRAMEWORK" 2>/dev/null | grep -oE 'Electron/[0-9]+\.[0-9]+\.[0-9]+' | head -1 | sed 's/Electron\///')

if [ -z "$ELECTRON_VERSION" ]; then
  echo "Error: Electron 버전을 감지할 수 없습니다." && exit 1
fi

echo "Obsidian Electron version: $ELECTRON_VERSION"

npm install
npx electron-rebuild --version "$ELECTRON_VERSION" --module-dir . --which-module node-pty
npm run build

echo ""
echo "빌드 완료! 다음 파일을 vault/.obsidian/plugins/obsidian-terminal/에 복사하세요:"
echo "  - main.js"
echo "  - manifest.json"
echo "  - styles.css"
echo "  - node_modules/node-pty/ → node_modules/node-pty/ (디렉토리 구조 유지)"
