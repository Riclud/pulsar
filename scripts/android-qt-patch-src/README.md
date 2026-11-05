# Source of the Qt patch

`scripts/android-qt-patch` holds five compiled classes that replace those in
`Qt6Android.jar`. This directory is their source, as Qt is licensed under the LGPL.

- `QtInputDelegate.java` is the patched file. It is `QtInputDelegate.java` from Qt 6.9.3
  (`qtbase`, tag `v6.9.3`, `src/android/jar/src/org/qtproject/qt/android/`).
- `QtInputDelegate.patch` is the whole change.

The change removes the `controlWindowInsetsAnimation` call from `showKeyboard`, because it
never finishes on Samsung devices and on Android 16, and leaves the direct
`insetsController.show(ime)`.

To rebuild the classes, with the Android platform jar and `Qt6Android.jar` from Qt 6.9.3:

```sh
mkdir -p src/org/qtproject/qt/android
cp QtInputDelegate.java src/org/qtproject/qt/android/
javac -nowarn --release 8 -cp "android.jar:Qt6Android.jar" -d ../android-qt-patch \
  src/org/qtproject/qt/android/QtInputDelegate.java
```

The result matches the committed classes, compared as `javap -p -c` output.
