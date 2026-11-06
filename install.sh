#!/bin/sh
# Pulsar bootstrap: installs the CLI from GitHub Releases for this platform, then
# the toolchain (Qt host) with `pulsar install`. Bun is inside the CLI.
# Set PULSAR_SLIM=1 for a toolchain that uses the system Qt.
set -eu

REPO="${PULSAR_REPO:-riclud/pulsar}"
PULSAR_HOME="${PULSAR_HOME:-$HOME/.local/share/pulsar}"
BIN_DIR="${PULSAR_BIN_DIR:-$HOME/.local/bin}"

os=$(uname -s | tr 'A-Z' 'a-z')
case "$os" in
  linux) os=linux ;;
  darwin) os=macos ;;
  *) echo "pulsar: unsupported OS: $os" >&2; exit 1 ;;
esac

arch=$(uname -m)
case "$arch" in
  x86_64 | amd64) arch=x64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) echo "pulsar: unsupported architecture: $arch" >&2; exit 1 ;;
esac
platform="$os-$arch"

asset="pulsar-cli-$platform.tar.gz"
url="https://github.com/$REPO/releases/latest/download/$asset"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "pulsar: downloading $asset"
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$url" -o "$tmp/$asset"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$tmp/$asset" "$url"
else
  echo "pulsar: need curl or wget" >&2
  exit 1
fi

mkdir -p "$tmp/stage"
tar -xzf "$tmp/$asset" -C "$tmp/stage"
version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$tmp/stage/cli/package.json" | head -1)
if [ -z "$version" ]; then
  echo "pulsar: could not determine the CLI version from the archive" >&2
  exit 1
fi

dest="$PULSAR_HOME/versions/$version"
rm -rf "$dest"
mkdir -p "$dest"
cp -a "$tmp/stage/." "$dest/"

ln -sfn "versions/$version" "$PULSAR_HOME/current"

mkdir -p "$BIN_DIR"

# Releases from 2.0 carry bin/pulsar with Bun inside; older ones need a system Bun.
if [ -x "$dest/bin/pulsar" ]; then
  cat > "$BIN_DIR/pulsar" <<EOF
#!/bin/sh
exec "$PULSAR_HOME/current/bin/pulsar" "\$@"
EOF
else
  if ! command -v bun >/dev/null 2>&1; then
    echo "pulsar: this release needs Bun; install it from https://bun.sh and re-run" >&2
    exit 1
  fi

  cat > "$BIN_DIR/pulsar" <<EOF
#!/bin/sh
exec bun "$PULSAR_HOME/current/cli/index.ts" "\$@"
EOF
fi

chmod +x "$BIN_DIR/pulsar"

echo "pulsar: installed $version to $dest"
echo "  binary: $BIN_DIR/pulsar"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "  add $BIN_DIR to your PATH" ;;
esac

if [ "${PULSAR_SLIM:-}" = "1" ]; then
  "$BIN_DIR/pulsar" install --slim
else
  "$BIN_DIR/pulsar" install
fi
