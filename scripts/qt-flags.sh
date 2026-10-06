#!/bin/sh
# Prints Qt 6 compile flags (include dirs + defines).
# Prefers pkg-config; falls back to qmake6-provided header locations.
set -eu

MODULES="Qt6Core Qt6Gui Qt6Qml Qt6Quick Qt6Network Qt6OpenGL Qt6QmlIntegration"

if command -v pkg-config >/dev/null 2>&1 && pkg-config --exists Qt6Core 2>/dev/null; then
    exec pkg-config --cflags $MODULES
fi

HDR="$( (qmake6 -query QT_INSTALL_HEADERS 2>/dev/null || qmake -query QT_INSTALL_HEADERS 2>/dev/null) || echo /usr/include/qt6)"
for m in QtCore QtGui QtQml QtQuick QtNetwork QtOpenGL QtQmlIntegration; do
    printf -- '-I%s/%s ' "$HDR" "$m"
done
printf -- '-I%s ' "$HDR"
printf -- '-DQT_CORE_LIB -DQT_GUI_LIB -DQT_QML_LIB -DQT_QUICK_LIB -DQT_NETWORK_LIB -DQT_OPENGL_LIB\n'
