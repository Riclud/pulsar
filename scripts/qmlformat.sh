#!/bin/sh
# Prints the path to the Qt 6 qmlformat binary (PATH may point to Qt 5).
set -eu

QMLFORMAT=""
if command -v qmake6 >/dev/null 2>&1; then
    QMLFORMAT="$(qmake6 -query QT_INSTALL_BINS 2>/dev/null)/qmlformat"
fi
if [ ! -x "$QMLFORMAT" ] && [ -x /usr/lib/qt6/bin/qmlformat ]; then
    QMLFORMAT=/usr/lib/qt6/bin/qmlformat
fi
if [ ! -x "$QMLFORMAT" ]; then
    QMLFORMAT="$(command -v qmlformat || true)"
fi
printf '%s\n' "$QMLFORMAT"
