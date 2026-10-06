#!/bin/sh
# Headless end-to-end smoke test: config, initial state sync, and live push.
set -eu

DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT="$(dirname "$DIR")"
cd "$ROOT"

zig build -j1

LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT

PULSAR_DEBUG=1 \
QT_QPA_PLATFORM=offscreen \
AUTO_QUIT_MS=4000 \
SELFTEST=1500 \
QT_LOG_FILE="$LOG" \
    ./zig-out/bin/qml-host >/dev/null 2>&1 || true

fail=0
check() {
    if ! grep -q "$1" "$LOG"; then
        echo "smoke: missing: $1"
        fail=1
    fi
}

check "NOTIFY __config"
check "STORE name = QVariant(QString, tick 0)"
check "STORE name = QVariant(QString, tick 1)"
check "SELFTEST resp"

if [ "$fail" -ne 0 ]; then
    echo "smoke: FAILED"
    cat "$LOG"
    exit 1
fi

echo "smoke: OK"
