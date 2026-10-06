#!/bin/sh
# Prints the path to the Qt 6 moc binary.
set -eu

MOC=""
if command -v qmake6 >/dev/null 2>&1; then
    MOC="$(qmake6 -query QT_HOST_LIBEXECS 2>/dev/null)/moc"
fi
if [ ! -x "$MOC" ] && [ -x /usr/lib/qt6/moc ]; then
    MOC=/usr/lib/qt6/moc
fi
if [ ! -x "$MOC" ]; then
    MOC="$(command -v moc || true)"
fi
printf '%s\n' "$MOC"
