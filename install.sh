#!/bin/bash
set -e

# 1. 대상 경로 설정 (기본값: ./dist)
VAULT_PATH=$1
if [ -z "$VAULT_PATH" ]; then
    TARGET_DIR="./dist"
    echo "--- No vault path provided. Using default: $TARGET_DIR ---"
else
    # manifest.json의 id("obsidian-terminal") 사용
    TARGET_DIR="$VAULT_PATH/.obsidian/plugins/obsidian-terminal"
    echo "--- Vault path provided. Target: $TARGET_DIR ---"
fi

# 2. 의존성 설치 및 빌드
echo "--- Installing JS Dependencies ---"
npm install

echo "--- Building Go PTY Bridge ---"
mkdir -p bin
cd pty-bridge

# 현재 플랫폼 빌드
GOOS=$(go env GOOS)
GOARCH=$(go env GOARCH)
# Go 아키텍처 이름을 xterm-pty의 기대값과 맞춤 (amd64, arm64 등)
ARCH_NAME=$GOARCH

BINARY_NAME="../bin/pty-bridge-$GOOS-$ARCH_NAME"
if [ "$GOOS" = "windows" ]; then BINARY_NAME="$BINARY_NAME.exe"; fi

echo "Building for $GOOS/$ARCH_NAME..."
go build -o "$BINARY_NAME" .
cd ..

echo "--- Building Extension (esbuild) ---"
npm run build

# 3. 파일 복사
echo "--- Copying files to $TARGET_DIR ---"
mkdir -p "$TARGET_DIR"
cp main.js manifest.json styles.css "$TARGET_DIR/"
cp -r bin "$TARGET_DIR/"

echo "--- Success! ---"
if [ -z "$VAULT_PATH" ]; then
    echo "Files are ready in $TARGET_DIR"
else
    echo "Plugin installed to your vault. Please reload Obsidian or enable the plugin in settings."
fi
