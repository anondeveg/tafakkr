#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Define terminal colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0;0m' # No Color

echo -e "${GREEN}=================================================="
echo -e "   Taffakr (تفكّر) Build & Compilation Utility    "
echo -e "==================================================${NC}"

# 1. Environment Verification
echo -e "\n[1] Verifying build prerequisites..."
if ! command -v go &> /dev/null; then
    echo -e "${RED}Error: Go (Golang) is not installed.${NC}"
    exit 1
fi
echo -e "✓ Go is installed: $(go version)"

if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed.${NC}"
    exit 1
fi
echo -e "✓ Node.js is installed: $(node -v)"

if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed.${NC}"
    exit 1
fi
echo -e "✓ npm is installed: v$(npm -v)"

# 2. Check Wails CLI path
WAILS_PATH="$HOME/go/bin/wails"
if [ ! -f "$WAILS_PATH" ]; then
    if command -v wails &> /dev/null; then
        WAILS_PATH="wails"
    else
        echo -e "${RED}Error: Wails CLI not found in ~/go/bin or PATH.${NC}"
        echo "Attempting to download and install Wails..."
        go install github.com/wailsapp/wails/v2/cmd/wails@latest
        WAILS_PATH="$HOME/go/bin/wails"
    fi
fi
echo -e "✓ Wails CLI found at: $WAILS_PATH"

# 3. Compiling the Application
echo -e "\n[2] Triggering Wails compilation..."
echo "Running: $WAILS_PATH build -tags webkit2_41"

$WAILS_PATH build -tags webkit2_41

# 4. Completion Output
echo -e "\n${GREEN}=================================================="
echo -e "        Build Completed Successfully! 🎉          "
echo -e "==================================================${NC}"
echo -e "You can launch the desktop application by running:"
echo -e "${GREEN}./build/bin/tafakkr${NC}\n"
