#!/usr/bin/env bash
set -euo pipefail

# Always run from the project root, even when invoked from another directory.
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  printf 'Cần cài Node.js và npm trước khi chạy ứng dụng.\n' >&2
  exit 1
fi

node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 12)) {
    console.error("Cần Node.js 22.12 trở lên.");
    process.exit(1);
  }
'

if [[ ! -d node_modules || ! -f node_modules/.package-lock.json || package-lock.json -nt node_modules/.package-lock.json || package.json -nt node_modules/.package-lock.json ]]; then
  printf 'Đang cài dependencies…\n'
  npm ci --include=dev
fi

# Rebuild before starting so the running app always includes the latest edits.
printf 'Đang build Event Video Player…\n'
npm run build

export PORT="${PORT:-3000}"
node --input-type=module - <<'JS'
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT phải là số nguyên từ 1 đến 65535.');
  process.exit(1);
}
function listeners() {
  try {
    const output = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return [...new Set(output.trim().split(/\s+/).map(Number))].filter(pid => Number.isInteger(pid) && pid > 1 && pid !== process.pid);
  } catch (error) {
    if (error.status === 1 && !String(error.stdout || '').trim() && !String(error.stderr || '').trim()) return [];
    throw new Error(`Không đọc được tiến trình giữ cổng ${port}. Cần lệnh lsof: ${error.message}`);
  }
}
const oldPids = listeners();
if (oldPids.length) {
  console.log(`Đang dừng tiến trình cũ trên cổng ${port}: ${oldPids.join(', ')}…`);
  for (const pid of oldPids) {
    try { process.kill(pid, 'SIGTERM'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && listeners().some(pid => oldPids.includes(pid))) await setTimeout(200);
  for (const pid of listeners().filter(pid => oldPids.includes(pid))) {
    console.log(`Tiến trình ${pid} chưa dừng, buộc đóng để giải phóng cổng ${port}.`);
    try { process.kill(pid, 'SIGKILL'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  const releaseDeadline = Date.now() + 2000;
  while (Date.now() < releaseDeadline && listeners().some(pid => oldPids.includes(pid))) await setTimeout(100);
}
const probe = net.createServer();
probe.once('error', () => {
  console.error(`Không giải phóng được cổng ${port}. Kiểm tra quyền hoặc tiến trình tự khởi động lại.`);
  process.exit(1);
});
probe.listen(port, '127.0.0.1', () => probe.close());
JS

printf 'Đang khởi động ứng dụng. Nhấn Ctrl+C để dừng.\n'
node dist/server.js &
player_server_pid=$!

cleanup() {
  kill "$player_server_pid" 2>/dev/null || true
  wait "$player_server_pid" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Open Chrome only after the HTTP server is ready.
if ! node --input-type=module - <<'JS'
import { setTimeout } from 'node:timers/promises';
const deadline = Date.now() + 15000;
while (Date.now() < deadline) {
  try {
    const response = await fetch(`http://127.0.0.1:${process.env.PORT}/api/health`, {
      signal: AbortSignal.timeout(1000)
    });
    if (response.ok && (await response.json()).ok === true) process.exit(0);
  } catch {}
  await setTimeout(200);
}
console.error('Server chưa sẵn sàng sau 15 giây. Kiểm tra lỗi phía trên.');
process.exit(1);
JS
then
  exit 1
fi
if ! kill -0 "$player_server_pid" 2>/dev/null; then
  printf 'Server đã dừng trước khi mở Chrome.\n' >&2
  exit 1
fi

controller_url="http://localhost:${PORT}/controller"
open_chrome_controller() {
  case "$(uname -s)" in
    Darwin)
      open -na 'Google Chrome' --args --new-window "$controller_url" || return 1
      ;;
    Linux)
      local chrome_command
      for chrome_command in google-chrome google-chrome-stable chromium chromium-browser; do
        if command -v "$chrome_command" >/dev/null 2>&1; then
          "$chrome_command" --new-window "$controller_url" >/dev/null 2>&1 &
          return 0
        fi
      done
      return 1
      ;;
    MINGW*|MSYS*|CYGWIN*)
      powershell.exe -NoProfile -Command 'Start-Process chrome -ArgumentList "--new-window", "http://localhost:$env:PORT/controller"' || return 1
      ;;
    *) return 1 ;;
  esac
}

if open_chrome_controller; then
  printf 'Đã mở Controller. Bấm Open Player khi cần và bật fullscreen thủ công.\n'
else
  printf 'Không mở được Chrome tự động. Mở Controller thủ công:\n%s\n' "$controller_url" >&2
fi

wait "$player_server_pid"
