class Pulsarjs < Formula
  desc "Native desktop and Android apps in TypeScript, drawn by Qt on the GPU"
  homepage "https://pulsarjs.org"
  version "@VERSION@"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/riclud/pulsar/releases/download/v@VERSION@/pulsar-macos-arm64.tar.gz"
      sha256 "@SHA_MACOS_ARM64@"
    end

    on_intel do
      url "https://github.com/riclud/pulsar/releases/download/v@VERSION@/pulsar-macos-x64.tar.gz"
      sha256 "@SHA_MACOS_X64@"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/riclud/pulsar/releases/download/v@VERSION@/pulsar-linux-arm64.tar.gz"
      sha256 "@SHA_LINUX_ARM64@"
    end

    on_intel do
      url "https://github.com/riclud/pulsar/releases/download/v@VERSION@/pulsar-linux-x64.tar.gz"
      sha256 "@SHA_LINUX_X64@"
    end
  end

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"bin/pulsar"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/pulsar version")
  end
end
