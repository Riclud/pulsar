#!/bin/sh
# Generates host/compile_flags.txt for clangd (Zed / editors).
# Machine-specific paths, so the output is gitignored.
set -eu

DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT="$(dirname "$DIR")"
OUT="${1:-$ROOT/host/compile_flags.txt}"

{
    printf '%s\n' "-std=c++20"
    printf '%s\n' "-xc++"
    printf '%s\n' "-fPIC"
    printf '%s\n' "-DQT_NO_EMIT"
    sh "$DIR/qt-flags.sh" | tr ' ' '\n'
} > "$OUT"

echo "wrote $OUT"
