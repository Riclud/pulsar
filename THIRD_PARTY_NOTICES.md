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

## Noto Sans — default UI font (SIL OFL-1.1)

The JS UI renderer bundles Noto Sans (`host/qml/fonts/NotoSans-Variable.ttf`) as the default UI font.

- Source: https://github.com/google/fonts/blob/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/notosans/NotoSans%5Bwdth,wght%5D.ttf
  (google/fonts commit `8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5`; upstream: https://github.com/notofonts/latin-greek-cyrillic)
- Upstream file SHA-256: `bfb7bb691513f12e734dc346c03a03f784912432d7e3fa8e56efcf906fe86b3d` (2049096 bytes)
- Bundled file SHA-256: `0199b44fc251aeff9de0c1294f92aa7637fe86dd87e341058c0509e54352d097` (532736 bytes)
- Modification: the width axis is pinned to 100 and the font is subset to Latin, Cyrillic, Greek and common
  punctuation and symbols with fontTools; the weight axis (100-900) is kept. The Noto OFL names no Reserved Font Name.
  The commands, run on the upstream file:

  ```sh
  python3 -m fontTools varLib.instancer NotoSans[wdth,wght].ttf wdth=100 -o w.ttf
  pyftsubset w.ttf --output-file=NotoSans-Variable.ttf --layout-features='*' --no-hinting --desubroutinize \
    --unicodes=U+0020-007E,U+00A0-024F,U+0300-036F,U+0370-03FF,U+0400-052F,U+1E00-1EFF,U+2000-206F,U+20A0-20CF,U+2100-214F,U+2190-21FF,U+2200-22FF,U+25A0-25FF,U+2713
  ```

- Copyright 2022 The Noto Project Authors. License text: `host/qml/fonts/LICENSE-NotoSans.txt`
- SIL Open Font License 1.1: https://openfontlicense.org

```
Copyright 2022 The Noto Project Authors (https://github.com/notofonts/latin-greek-cyrillic)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
https://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

## OpenSSL — Android TLS (Apache-2.0)

Android apps bundle the OpenSSL 3.1.8 shared libraries `libssl_3.so` and `libcrypto_3.so`, which
Qt's TLS backend loads at runtime for HTTPS. `pulsar install --android` downloads the prebuilt
arm64-v8a libraries published by KDAB, pinned to one commit and checked by SHA-256. They are not
stored in this repository. OpenSSL 3 is licensed under the Apache License 2.0.

- Source: https://github.com/openssl/openssl
- Prebuilt libraries: https://github.com/KDAB/android_openssl
- License text: https://github.com/openssl/openssl/blob/openssl-3.1.8/LICENSE.txt
- Apache-2.0: https://www.apache.org/licenses/LICENSE-2.0

## Acknowledgements

Qt is a trademark of The Qt Company Ltd. This project is not affiliated with or
endorsed by The Qt Company. Bun is a trademark of Oven Inc.
