#!/bin/bash
echo "=== Photo Lab API Startup Script ==="
echo "PORT: $PORT"
echo "NODE_ENV: $NODE_ENV"
echo "DB_HOST: $DB_HOST"
echo "Working directory: $(pwd)"
echo "Files: $(ls -la)"

echo "Starting Node.js application..."
node server.js
