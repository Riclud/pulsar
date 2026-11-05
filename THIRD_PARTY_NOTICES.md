# Third-party notices

Pulsar is licensed under the MIT License (see `LICENSE`). It links and
distributes the following third-party software.

## Qt 6 — host GUI (LGPL-3.0-only)

The Pulsar host (`qml-host`) is written in C++ and links against Qt 6 **as shared
libraries** (dynamic linking). The process supervisor (`bridge`) links against `Qt6Core`
the same way.

- Qt is loaded dynamically, and the binaries are not statically linked against it, so users
  may replace the Qt libraries an app uses.
- This source repository does not contain Qt. `pulsar install`, release assets, and apps built
  with `pulsar build` **do bundle** Qt shared libraries, which are distributed under the LGPL.
- Whoever distributes an app with Qt in it passes on these obligations: keep the license texts,
  and keep users able to replace Qt.
- Qt licensing overview: https://doc.qt.io/qt-6/lgpl.html
- Full LGPL-3.0 text: https://www.gnu.org/licenses/lgpl-3.0.txt
- Qt source: https://code.qt.io/cgit/qt/qtbase.git/

### Modified Qt code

Android builds replace `QtInputDelegate` in `Qt6Android.jar` with a patched version. Its source
and the exact change are in `scripts/android-qt-patch-src`, under the same license as Qt.

## Bun — application runtime (MIT)

Pulsar uses Bun as its application runtime.
Bun: https://bun.sh
License (MIT): https://github.com/oven-sh/bun/blob/main/LICENSE.md

## QuickJS — JavaScript engine (MIT)

The embedded runtime uses `quickjs-ng`, fetched when the host is built.

- Source: https://github.com/quickjs-ng/quickjs
- License (MIT): https://github.com/quickjs-ng/quickjs/blob/master/LICENSE

## Node.js dependency packages

The JavaScript/TypeScript layer depends on the packages listed in the lockfile
(`bun.lock`). Their licenses are recorded in their respective `package.json`
files inside `node_modules`.

## Material Icons — UI icon font (Apache-2.0)

The JS UI renderer bundles the Material Icons font
(`host/qml/fonts/MaterialIcons.ttf`) for `icon` and `iconButton` nodes.
Material Design Icons are licensed under the Apache License 2.0.

- Source: https://github.com/google/material-design-icons
- License text: `host/qml/fonts/LICENSE-MaterialIcons.txt`
- Apache-2.0: https://www.apache.org/licenses/LICENSE-2.0

## Paper Mono — UI font

The JS UI renderer bundles the Paper Mono font (`host/qml/fonts/PaperMono-*.ttf`).

- License text: `host/qml/fonts/LICENSE-PaperMono.txt`

## Acknowledgements

Qt is a trademark of The Qt Company Ltd. This project is not affiliated with or
endorsed by The Qt Company. Bun is a trademark of Oven Inc.
