#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON="${PYTHON:-python3}"
HOUR="${1:-8}"
MINUTE="${2:-0}"
CRON_LINE="${MINUTE} ${HOUR} * * * cd ${ROOT} && ${PYTHON} main.py scrape >> ${ROOT}/output/scrape.log 2>&1"

mkdir -p "${ROOT}/output"
touch "${ROOT}/output/scrape.log"

EXISTING="$(crontab -l 2>/dev/null || true)"
FILTERED="$(printf '%s\n' "${EXISTING}" | grep -v 'main.py scrape' || true)"
printf '%s\n%s\n' "${FILTERED}" "${CRON_LINE}" | crontab -

echo "已安装每日定时任务：每天 ${HOUR}:$(printf '%02d' "${MINUTE}") 自动抓取"
echo "日志文件：${ROOT}/output/scrape.log"
echo "查看任务：crontab -l"
