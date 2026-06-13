#!/bin/bash

# Get absolute path to the .app bundle
# Script is at: .../Saxophone Hero/App.app/Contents/Resources/script
SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)"
APP_CONTENTS="$(dirname "$SCRIPT_PATH")"           # .../App.app/Contents
APP_BUNDLE="$(dirname "$APP_CONTENTS")"            # .../App.app
SAXOPHONE_HERO_DIR="$(dirname "$APP_BUNDLE")"      # .../Saxophone Hero
PROJECT_DIR="$SAXOPHONE_HERO_DIR/project"

# Debug - will write to log
echo "=== Path Debug ==="
echo "SCRIPT_PATH: $SCRIPT_PATH"
echo "APP_CONTENTS: $APP_CONTENTS"
echo "APP_BUNDLE: $APP_BUNDLE"
echo "SAXOPHONE_HERO_DIR: $SAXOPHONE_HERO_DIR"
echo "PROJECT_DIR: $PROJECT_DIR"
echo ""

# Check if project exists
if [ ! -d "$PROJECT_DIR" ]; then
    osascript -e 'display dialog "Project folder not found at '"$PROJECT_DIR"'\n\nExpected structure:\nSaxophone Hero/\n  ├── [App].app\n  └── project/" buttons {"OK"} with icon stop'
    exit 1
fi

cd "$PROJECT_DIR"

# Log file
LOG_FILE="$PROJECT_DIR/launch.log"
exec > "$LOG_FILE" 2>&1

echo "=== Rhythm Game Launch ==="
echo "Date: $(date)"
echo "Project directory: $PROJECT_DIR"
echo "Working directory: $PWD"

# Set PATH
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

# Find Python
PYTHON=$(which python3)
if [ -z "$PYTHON" ]; then
    osascript -e 'display dialog "Python 3 not found. Install from python.org" buttons {"OK"} with icon stop'
    exit 1
fi

echo "Python: $PYTHON ($($PYTHON --version))"

# Generate score
echo "Generating score..."
$PYTHON generate_score.py
if [ $? -ne 0 ]; then
    osascript -e 'display dialog "Error generating score. Check '"$LOG_FILE"'" buttons {"OK"} with icon stop'
    exit 1
fi

# Find Node
NODE=$(which node)
if [ -z "$NODE" ]; then
    osascript -e 'display dialog "Node.js not found. Install from nodejs.org" buttons {"OK"} with icon stop'
    exit 1
fi

echo "Node: $NODE ($($NODE --version))"

# Start server
echo "Starting server..."
$NODE index.mjs &
SERVER_PID=$!

# Wait for server
echo "Waiting for server..."
for i in {1..30}; do
    if curl -s http://localhost:8080 > /dev/null 2>&1; then
        echo "Server ready!"
        break
    fi
    sleep 0.5
done

# Open browser
open "http://localhost:8080"
echo "Launched successfully. PID: $SERVER_PID"

wait $SERVER_PID