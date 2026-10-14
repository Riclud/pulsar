# Third-party notices

Pulsar is licensed under the MIT License (see `LICENSE`). It links and
distributes the following third-party software.

## Qt 6 — host GUI (LGPL-3.0-only)

The Pulsar host (`qml-host`) is written in C++ and links against Qt 6
(`Qt6Core`, `Qt6Gui`, `Qt6Qml`, `Qt6Quick`, `Qt6Network`, `Qt6OpenGL`,
`Qt6QmlIntegration`) **as shared libraries** (dynamic linking). The process
supervisor (`bridge`) links against `Qt6Core` the same way.

To comply with the GNU Lesser General Public License v3:

- Qt is loaded dynamically; the binaries are not statically linked against it.
- The Qt libraries are **not** bundled with this source distribution; they are
  supplied by the user (see the install instructions in the README, or
  `PULSAR_QMAKE` / `PULSAR_QT` to point at a specific Qt installation).
- Users may re-link or replace the Qt libraries used by the host.

- Qt licensing overview: https://doc.qt.io/qt-6/lgpl.html
- Full LGPL-3.0 text: https://www.gnu.org/licenses/lgpl-3.0.txt

When Pulsar starts bundling Qt binaries (product distribution), the Qt license
texts must be shipped alongside the binaries and keep the above relink rights.

## Bun — application runtime (MIT)

Pulsar uses Bun as its application runtime.
Bun: https://bun.sh
License (MIT): https://github.com/oven-sh/bun/blob/main/LICENSE.md

## Node.js dependency packages

The JavaScript/TypeScript layer depends on the packages listed in the lockfile
(`bun.lock`). Their licenses are recorded in their respective `package.json`
files inside `node_modules`.

## Acknowledgements

Qt is a trademark of The Qt Company Ltd. This project is not affiliated with or
endorsed by The Qt Company. Bun is a trademark of Oven Inc.
