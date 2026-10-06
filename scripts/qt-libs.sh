#!/bin/sh
# Prints Qt 6 link flags.
# Prefers pkg-config; falls back to the standard Qt 6 library names.
set -eu

MODULES="Qt6Core Qt6Gui Qt6Qml Qt6Quick Qt6Network Qt6OpenGL Qt6QmlIntegration"

if command -v pkg-config >/dev/null 2>&1 && pkg-config --exists Qt6Core 2>/dev/null; then
    exec pkg-config --libs $MODULES
fi

printf -- '-lQt6Quick -lQt6OpenGL -lQt6Qml -lQt6Network -lQt6Gui -lQt6Core\n'
