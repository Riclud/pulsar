// Minimal, Qt-free launcher for a single-file Pulsar app.
//
// It reads the payload appended to its own executable, extracts it into the
// user cache and exec()s the bundled Qt host. Because this process never links
// Qt, the bundled Qt is loaded only by the host (via its RPATH), so an
// unrelated system Qt can never be picked up.
//
// Layout after extraction:
//   <root>/bin/qml-host  <root>/bin/bridge  <root>/runtime  <root>/app/...  <root>/lib/Qt/...

#include <cstdio>
#include <cstring>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <string>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#include <direct.h>
#include <io.h>
#include <process.h>
#else
#include <unistd.h>
#include <sys/stat.h>
#ifdef __APPLE__
#include <mach-o/dyld.h>
#endif
#endif

namespace fs = std::filesystem;

namespace {

const char kHeaderMagic[4] = {'P', 'L', 'S', 'R'};
const char kTrailerMagic[8] = {'P', 'L', 'S', 'R', 'P', 'A', 'Y', 'L'};
constexpr std::streamoff kTrailerSize = 16;
constexpr size_t kChunk = 64 * 1024;

#ifdef _WIN32
constexpr const char *kExe = ".exe";
#else
constexpr const char *kExe = "";
#endif

uint32_t readU32(const unsigned char *p)
{
    return uint32_t(p[0]) | (uint32_t(p[1]) << 8) | (uint32_t(p[2]) << 16) | (uint32_t(p[3]) << 24);
}

uint64_t readU64(const unsigned char *p)
{
    uint64_t v = 0;
    for (int i = 7; i >= 0; --i)
        v = (v << 8) | uint64_t(p[i]);
    return v;
}

// Reject absolute paths, parent traversal and Windows drive letters. Entries
// come from our own build, but extraction must never escape the cache root.
bool isSafeRelative(const std::string &path)
{
    if (path.empty())
        return false;
    if (path.front() == '/')
        return false;
    if (path.find('\\') != std::string::npos)
        return false;
    if (path.find("..") != std::string::npos)
        return false;
    const char c = path[0];
    if (path.size() >= 2 && ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')) && path[1] == ':')
        return false;
    return true;
}

[[noreturn]] void fail(const char *message)
{
    std::fprintf(stderr, "launcher: %s\n", message);
    std::exit(1);
}

std::string selfPath()
{
#ifdef _WIN32
    char buf[MAX_PATH];
    const DWORD n = GetModuleFileNameA(nullptr, buf, MAX_PATH);
    if (n == 0 || n >= MAX_PATH)
        fail("cannot locate the running executable");
    return std::string(buf, size_t(n));
#elif defined(__APPLE__)
    char buf[4096];
    uint32_t size = sizeof(buf);
    if (_NSGetExecutablePath(buf, &size) != 0)
        fail("cannot locate the running executable");
    std::error_code ec;
    const fs::path resolved = fs::canonical(fs::path(buf), ec);
    return ec ? std::string(buf) : resolved.string();
#else
    char buf[4096];
    const ssize_t n = ::readlink("/proc/self/exe", buf, sizeof(buf) - 1);
    if (n <= 0)
        fail("cannot locate the running executable");
    return std::string(buf, size_t(n));
#endif
}

void setEnv(const char *name, const std::string &value)
{
#ifdef _WIN32
    _putenv_s(name, value.c_str());
#else
    ::setenv(name, value.c_str(), 1);
#endif
}

void changeDir(const std::string &path)
{
#ifdef _WIN32
    _chdir(path.c_str());
#else
    ::chdir(path.c_str());
#endif
}

[[noreturn]] void execHost(const std::string &host, std::vector<char *> &argv)
{
#ifdef _WIN32
    _execv(host.c_str(), argv.data());
#else
    ::execv(host.c_str(), argv.data());
#endif
    fail("failed to start the host");
}

fs::path cacheRoot(uint64_t buildId)
{
    char hex[32];
    std::snprintf(hex, sizeof(hex), "pulsar-embed-%llx", static_cast<unsigned long long>(buildId));

    const char *base = std::getenv("XDG_CACHE_HOME");
    fs::path root;
    if (base && *base)
        root = fs::path(base) / hex;
    else if (const char *home = std::getenv("HOME"))
        root = fs::path(home) / ".cache" / hex;
    else
        root = fs::path(".") / hex;
    return root;
}

void extract(std::ifstream &file, uint64_t offset, const fs::path &root)
{
    file.seekg(static_cast<std::streamoff>(offset));
    unsigned char header[20];
    if (!file.read(reinterpret_cast<char *>(header), 20))
        fail("bad payload header");
    if (std::memcmp(header, kHeaderMagic, 4) != 0)
        fail("bad payload magic");
    const uint32_t count = readU32(header + 16);

    std::error_code ec;
    fs::remove_all(root, ec);
    fs::create_directories(root, ec);

    for (uint32_t i = 0; i < count; ++i) {
        unsigned char lenBuf[4];
        unsigned char lenBuf8[8];
        if (!file.read(reinterpret_cast<char *>(lenBuf), 4))
            fail("truncated payload (path length)");
        const uint32_t pathLen = readU32(lenBuf);
        std::string rel(pathLen, '\0');
        if (pathLen && !file.read(rel.data(), pathLen))
            fail("truncated payload (path)");
        if (!isSafeRelative(rel))
            fail("unsafe payload path");
        if (!file.read(reinterpret_cast<char *>(lenBuf8), 8))
            fail("truncated payload (data length)");
        uint64_t remaining = readU64(lenBuf8);

        const fs::path target = root / rel;
        if (target.has_parent_path())
            fs::create_directories(target.parent_path(), ec);

        std::ofstream out(target, std::ios::binary | std::ios::trunc);
        if (!out)
            fail("cannot write extracted file");

        std::vector<char> buffer(kChunk);
        while (remaining > 0) {
            const size_t want = static_cast<size_t>(std::min<uint64_t>(remaining, buffer.size()));
            if (!file.read(buffer.data(), static_cast<std::streamsize>(want)))
                fail("truncated payload (data)");
            out.write(buffer.data(), static_cast<std::streamsize>(want));
            remaining -= want;
        }
        out.close();
    }

#ifndef _WIN32
    for (const char *rel : {"bin/qml-host", "bin/bridge", "runtime"})
        fs::permissions(root / rel,
                        fs::perms::owner_exec | fs::perms::group_exec | fs::perms::others_exec,
                        fs::perm_options::add, ec);
#endif
    std::ofstream(root / ".ok") << "ok";
}

} // namespace

int main()
{
    const std::string exe = selfPath();
    std::ifstream file(exe, std::ios::binary);
    if (!file)
        fail("cannot open self");

    file.seekg(0, std::ios::end);
    const std::streamoff size = file.tellg();
    if (size < kTrailerSize)
        fail("no embedded payload");

    file.seekg(size - kTrailerSize);
    unsigned char trailer[16];
    if (!file.read(reinterpret_cast<char *>(trailer), 16))
        fail("cannot read trailer");
    if (std::memcmp(trailer + 8, kTrailerMagic, 8) != 0)
        fail("no embedded payload");

    const uint64_t offset = readU64(trailer);
    file.seekg(static_cast<std::streamoff>(offset) + 8);
    unsigned char idBuf[8];
    if (!file.read(reinterpret_cast<char *>(idBuf), 8))
        fail("bad payload id");
    const uint64_t buildId = readU64(idBuf);
    file.clear();

    const fs::path root = cacheRoot(buildId);
    std::error_code ec;
    if (!fs::exists(root / ".ok", ec))
        extract(file, offset, root);

    const fs::path host = root / "bin" / (std::string("qml-host") + kExe);
    if (!fs::exists(host))
        fail("extracted host is missing");

    // Point the host/bridge/runtime at the extracted tree before exec.
    setEnv("PULSAR_ROOT", root.string());
    setEnv("PULSAR_APP", (root / "app").string());
    setEnv("PULSAR_RUNTIME", (root / (std::string("runtime") + kExe)).string());

    const std::string hostStr = host.string();
    changeDir(root.string());

    std::vector<char *> argv;
    argv.push_back(const_cast<char *>(hostStr.c_str()));
    argv.push_back(nullptr);
    execHost(hostStr, argv);
}
