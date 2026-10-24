#!/usr/bin/env bash
# Quick local server launcher for YouTube Shorts Player
PORT=8080
echo "Starting local server on http://localhost:$PORT ..."

# Check if python3 is available
if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server $PORT
elif command -v python >/dev/null 2>&1; then
  python -m SimpleHTTPServer $PORT
elif command -v npx >/dev/null 2>&1; then
  npx serve -p $PORT .
else
  echo "Please install Python or Node.js to run a local web server."
  exit 1
fi
