cmake_minimum_required(VERSION 3.21)

project(pulsar LANGUAGES CXX)

set(PULSAR_VERSION_FILE "${CMAKE_CURRENT_SOURCE_DIR}/package.json")
if(NOT EXISTS "${PULSAR_VERSION_FILE}")
    set(PULSAR_VERSION_FILE "${CMAKE_CURRENT_SOURCE_DIR}/cli/package.json")
endif()
if(EXISTS "${PULSAR_VERSION_FILE}")
    file(READ "${PULSAR_VERSION_FILE}" PULSAR_PACKAGE_JSON)
    string(REGEX MATCH "\"version\"[ \t]*:[ \t]*\"([^\"]+)\"" _ "${PULSAR_PACKAGE_JSON}")
    set(PULSAR_VERSION "${CMAKE_MATCH_1}")
endif()
if(NOT PULSAR_VERSION)
    set(PULSAR_VERSION "dev")
endif()

if(APPLE)
    enable_language(OBJCXX)
    set(CMAKE_OBJCXX_STANDARD 20)
    set(CMAKE_OBJCXX_STANDARD_REQUIRED ON)
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

# All executables land in <build>/bin (e.g. build/bin/qml-host).
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin")
foreach(config IN ITEMS DEBUG RELEASE RELWITHDEBINFO MINSIZEREL)
    set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_${config} "${CMAKE_BINARY_DIR}/bin")
endforeach()

# Pulsar requires Qt 6.8+. The host is a Qt app, so use Qt's CMake package.
# WebSockets is optional: the Android Qt bundle ships without it.
find_package(Qt6 6.8 REQUIRED COMPONENTS Core Gui Widgets Qml Quick Network QuickControls2)
find_package(Qt6 6.8 QUIET OPTIONAL_COMPONENTS WebSockets Multimedia DBus)

function(pulsar_link_websockets target)
    if(TARGET Qt6::WebSockets)
        target_link_libraries(${target} PRIVATE Qt6::WebSockets)
        target_compile_definitions(${target} PRIVATE PULSAR_HAS_WEBSOCKETS=1)
    endif()
endfunction()

set(CMAKE_AUTOMOC ON)

# --- QuickJS-ng: embedded JS engine for mobile and the portable target ---
include(FetchContent)
set(QJS_ENABLE_INSTALL OFF CACHE BOOL "" FORCE)
set(QJS_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(QJS_BUILD_CLI_STATIC OFF CACHE BOOL "" FORCE)
set(QJS_BUILD_WERROR OFF CACHE BOOL "" FORCE)
FetchContent_Declare(quickjs
    GIT_REPOSITORY https://github.com/quickjs-ng/quickjs.git
    GIT_TAG e68078618935dbd28c41c98931f99d9091daba50
)
FetchContent_MakeAvailable(quickjs)

# Built-in renderer for JS-driven windows (loaded as qrc:/runtime/PulsarView.qml).
# The same resources are linked into every host that can render JS windows.
function(pulsar_add_view_resources target resource_name)
    qt_add_resources(${target} ${resource_name}
        PREFIX "/runtime"
        BASE "${CMAKE_CURRENT_SOURCE_DIR}/host/qml"
        FILES
            "${CMAKE_CURRENT_SOURCE_DIR}/host/qml/PulsarView.qml"
            "${CMAKE_CURRENT_SOURCE_DIR}/host/qml/shaders/wave.frag.qsb"
            "${CMAKE_CURRENT_SOURCE_DIR}/host/qml/shaders/lightning.frag.qsb"
            "${CMAKE_CURRENT_SOURCE_DIR}/host/qml/shaders/aurora.frag.qsb"
            "${CMAKE_CURRENT_SOURCE_DIR}/host/qml/shaders/glass.raw.frag.qsb"
            "${CMAKE_CURRENT_SOURCE_DIR}/host/qml/fonts/MaterialIcons.ttf"
            "${CMAKE_CURRENT_SOURCE_DIR}/host/qml/fonts/PaperMono-Regular.ttf"
            "${CMAKE_CURRENT_SOURCE_DIR}/host/qml/fonts/PaperMono-Medium.ttf"
            "${CMAKE_CURRENT_SOURCE_DIR}/host/qml/fonts/PaperMono-Bold.ttf"
    )
endfunction()

# --- iOS host (experimental): the embedded QuickJS/QML engine as an app bundle ---
if(IOS)
    qt_add_executable(pulsar-ios MACOSX_BUNDLE
        host/embedded/main.cpp
        host/embedded/bridge.cpp
        host/quickjs_runtime.cpp
        host/quickjs_thread.cpp
        host/native_renderer.cpp
        host/net.cpp
        host/embedded/bridge.h
        host/quickjs_runtime.h
        host/quickjs_thread.h
        host/native_renderer.h
        host/net.h
        "${PULSAR_IOS_APP_QRC}"
    )
    target_include_directories(pulsar-ios PRIVATE host host/embedded)
    target_compile_definitions(pulsar-ios PRIVATE
        QT_NO_EMIT
        PULSAR_VERSION="${PULSAR_VERSION}"
        PULSAR_APP_BUILD_ID="${PULSAR_IOS_BUILD_ID}"
    )
    target_link_libraries(pulsar-ios PRIVATE
        Qt6::Core
        Qt6::Gui
        Qt6::Qml
        Qt6::Quick
        Qt6::QuickControls2
        Qt6::Network
        qjs
    )

    pulsar_link_websockets(pulsar-ios)
    pulsar_add_view_resources(pulsar-ios "pulsarview_ios")

    set_target_properties(pulsar-ios PROPERTIES
        AUTORCC ON
        QT_QML_ROOT_PATH "${CMAKE_CURRENT_SOURCE_DIR}/host/qml"
        MACOSX_BUNDLE_BUNDLE_NAME "${PULSAR_IOS_APP_NAME}"
        MACOSX_BUNDLE_GUI_IDENTIFIER "${PULSAR_IOS_BUNDLE_ID}"
        XCODE_ATTRIBUTE_PRODUCT_BUNDLE_IDENTIFIER "${PULSAR_IOS_BUNDLE_ID}"
    )

    return()
endif()

# --- Qt host: renders QML, native dialogs/tray, window management ---
add_executable(qml-host
    host/main.cpp
    host/bridge.cpp
    host/devchannel.cpp
    host/perf_recorder.cpp
    host/devchannel.h
    host/perf_recorder.h
    host/quickjs_runtime.cpp
    host/quickjs_thread.cpp
    host/native_renderer.cpp
    host/quickjs_runtime.h
    host/quickjs_thread.h
    host/native_renderer.h
    host/log.cpp
    host/embedded.cpp
    host/secure.cpp
    host/recent.cpp
    host/assoc.cpp
    host/net.cpp
    host/power.cpp
    host/bridge.h
    host/secure.h
    host/recent.h
    host/assoc.h
    host/net.h
    host/power.h
)
target_include_directories(qml-host PRIVATE host)
target_compile_definitions(qml-host PRIVATE PULSAR_VERSION="${PULSAR_VERSION}")
target_compile_definitions(qml-host PRIVATE QT_NO_EMIT)
target_link_libraries(qml-host PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Widgets
    Qt6::Qml
    Qt6::Quick
    Qt6::Network
    Qt6::QuickControls2
    qjs
)

pulsar_link_websockets(qml-host)

# In-app video uses QtMultimedia when the Qt install ships it; otherwise
# fs.open falls back to the system handler.
if(TARGET Qt6::Multimedia)
    target_link_libraries(qml-host PRIVATE Qt6::Multimedia)
    target_compile_definitions(qml-host PRIVATE PULSAR_HAS_MULTIMEDIA=1)
endif()

# Notification action buttons use the freedesktop notification daemon.
if(TARGET Qt6::DBus)
    target_link_libraries(qml-host PRIVATE Qt6::DBus)
    target_compile_definitions(qml-host PRIVATE PULSAR_HAS_DBUS=1)
endif()

# OS secret storage: Keychain on macOS, DPAPI on Windows, libsecret on Linux.
# Recent documents use Security/AppKit on macOS and the shell API on Windows.
if(APPLE)
    set_source_files_properties(host/recent.cpp PROPERTIES LANGUAGE OBJCXX)
    target_link_libraries(qml-host PRIVATE "-framework Security" "-framework AppKit")
elseif(WIN32)
    target_link_libraries(qml-host PRIVATE crypt32 shell32)
endif()

pulsar_add_view_resources(qml-host "pulsarview")

if(TARGET Qt6::Multimedia)
    qt_add_resources(qml-host "pulsarvideo"
        PREFIX "/runtime"
        BASE "${CMAKE_CURRENT_SOURCE_DIR}/host/qml"
        FILES "${CMAKE_CURRENT_SOURCE_DIR}/host/qml/VideoPlayer.qml"
    )
endif()

# --- Embedded QML host (desktop test harness, Android host) ---
add_executable(qml-host-qjs
    host/embedded/main.cpp
    host/embedded/bridge.cpp
    host/quickjs_runtime.cpp
    host/quickjs_thread.cpp
    host/native_renderer.cpp
    host/net.cpp
    host/embedded/bridge.h
    host/quickjs_runtime.h
    host/quickjs_thread.h
    host/native_renderer.h
    host/net.h
)
target_include_directories(qml-host-qjs PRIVATE host host/embedded)
target_compile_definitions(qml-host-qjs PRIVATE QT_NO_EMIT PULSAR_VERSION="${PULSAR_VERSION}")
target_link_libraries(qml-host-qjs PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Qml
    Qt6::Quick
    Qt6::QuickControls2
    Qt6::Network
    qjs
)

pulsar_link_websockets(qml-host-qjs)

pulsar_add_view_resources(qml-host-qjs "pulsarview_qjs")

# --- Android host: the same embedded QuickJS/QML engine packaged as an APK ---
if(ANDROID)
    set(PULSAR_ANDROID_PACKAGE_NAME "${PULSAR_ANDROID_PACKAGE_NAME}" CACHE STRING "Android package id")
    set(PULSAR_ANDROID_APP_NAME "${PULSAR_ANDROID_APP_NAME}" CACHE STRING "Android app label")
    set(PULSAR_ANDROID_VERSION_NAME "${PULSAR_ANDROID_VERSION_NAME}" CACHE STRING "Android version name")
    set(PULSAR_ANDROID_VERSION_CODE "${PULSAR_ANDROID_VERSION_CODE}" CACHE STRING "Android version code")
    set(PULSAR_ANDROID_PERMISSIONS "${PULSAR_ANDROID_PERMISSIONS}" CACHE STRING "Android runtime permissions")
    if(NOT PULSAR_ANDROID_PACKAGE_NAME)
        set(PULSAR_ANDROID_PACKAGE_NAME "com.pulsar.app")
    endif()
    if(NOT PULSAR_ANDROID_APP_NAME)
        set(PULSAR_ANDROID_APP_NAME "Pulsar")
    endif()
    if(NOT PULSAR_ANDROID_VERSION_NAME)
        set(PULSAR_ANDROID_VERSION_NAME "0.1.0")
    endif()
    if(NOT PULSAR_ANDROID_VERSION_CODE)
        set(PULSAR_ANDROID_VERSION_CODE "1")
    endif()

    qt_add_executable(pulsar-android
        host/embedded/main.cpp
        host/embedded/bridge.cpp
        host/devchannel.cpp
        host/perf_recorder.cpp
        host/embedded/devfetch.cpp
        host/quickjs_runtime.cpp
        host/quickjs_thread.cpp
        host/native_renderer.cpp
        host/net.cpp
        host/embedded/bridge.h
        host/devchannel.h
        host/perf_recorder.h
        host/embedded/devfetch.h
        host/quickjs_runtime.h
        host/quickjs_thread.h
        host/native_renderer.h
        host/net.h
    )
    target_include_directories(pulsar-android PRIVATE host host/embedded)
    target_compile_definitions(pulsar-android PRIVATE QT_NO_EMIT PULSAR_VERSION="${PULSAR_VERSION}")

    if(PULSAR_ANDROID_DEV)
        target_compile_definitions(pulsar-android PRIVATE PULSAR_DEV=1)
    endif()
    target_link_libraries(pulsar-android PRIVATE
        Qt6::Core
        Qt6::Gui
        Qt6::Qml
        Qt6::Quick
        Qt6::QuickControls2
        Qt6::Network
        qjs
    )

    pulsar_link_websockets(pulsar-android)

    pulsar_add_view_resources(pulsar-android "pulsarview_android")

    if(PULSAR_ANDROID_APP_QRC)
        set_target_properties(pulsar-android PROPERTIES AUTORCC ON)
        target_sources(pulsar-android PRIVATE "${PULSAR_ANDROID_APP_QRC}")
    endif()

    if(PULSAR_ANDROID_APP_DIR)
        set_target_properties(pulsar-android PROPERTIES QT_QML_ROOT_PATH "${PULSAR_ANDROID_APP_DIR}")
    endif()

    if(PULSAR_ANDROID_BUILD_ID)
        target_compile_definitions(pulsar-android PRIVATE
            PULSAR_APP_BUILD_ID="${PULSAR_ANDROID_BUILD_ID}"
        )
    endif()

    set_target_properties(pulsar-android PROPERTIES
        QT_ANDROID_PACKAGE_NAME "${PULSAR_ANDROID_PACKAGE_NAME}"
        QT_ANDROID_APP_NAME "${PULSAR_ANDROID_APP_NAME}"
        QT_ANDROID_VERSION_NAME "${PULSAR_ANDROID_VERSION_NAME}"
        QT_ANDROID_VERSION_CODE "${PULSAR_ANDROID_VERSION_CODE}"
        QT_ANDROID_PERMISSIONS "${PULSAR_ANDROID_PERMISSIONS}"
        QT_ANDROID_MIN_SDK_VERSION 28
        QT_ANDROID_TARGET_SDK_VERSION 35
    )

    # The CLI passes its own package sources when an app needs extra parts, such as the scanner.
    if(PULSAR_ANDROID_PACKAGE_DIR)
        set_target_properties(pulsar-android PROPERTIES
            QT_ANDROID_PACKAGE_SOURCE_DIR "${PULSAR_ANDROID_PACKAGE_DIR}"
        )
    elseif(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/android/AndroidManifest.xml")
        set_target_properties(pulsar-android PROPERTIES
            QT_ANDROID_PACKAGE_SOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/android"
        )
    endif()
endif()

# --- Embedded QuickJS runtime (desktop test harness, Android host) ---
add_executable(qjs-runtime
    host/qjs_main.cpp
    host/quickjs_runtime.cpp
    host/quickjs_runtime.h
)
target_include_directories(qjs-runtime PRIVATE host)
target_link_libraries(qjs-runtime PRIVATE Qt6::Core Qt6::Gui qjs)

# --- Bridge: process supervisor for the JS runtime ---
add_executable(bridge bridge/main.cpp)
target_link_libraries(bridge PRIVATE Qt6::Core)

# --- Launcher: Qt-free single-file entry point ---
# zstd unpacks the app payload on first launch.
set(ZSTD_BUILD_PROGRAMS OFF CACHE BOOL "" FORCE)
set(ZSTD_BUILD_SHARED OFF CACHE BOOL "" FORCE)
set(ZSTD_BUILD_STATIC ON CACHE BOOL "" FORCE)
set(ZSTD_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(ZSTD_LEGACY_SUPPORT OFF CACHE BOOL "" FORCE)
FetchContent_Declare(zstd
    URL https://github.com/facebook/zstd/releases/download/v1.5.6/zstd-1.5.6.tar.gz
    URL_HASH SHA256=8c29e06cf42aacc1eafc4077ae2ec6c6fcb96a626157e0593d5e82a34fd403c1
    SOURCE_SUBDIR build/cmake
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
)
FetchContent_MakeAvailable(zstd)

add_executable(launcher launcher/main.cpp)
target_link_libraries(launcher PRIVATE libzstd_static)
target_include_directories(launcher PRIVATE "${zstd_SOURCE_DIR}/lib")

# Load the bundled Qt from <root>/lib/Qt/lib when present; otherwise fall back
# to the system installation (dev and --slim builds).
if(APPLE)
    set(PULSAR_BUNDLED_RPATH "@executable_path/../lib/Qt/lib")
else()
    set(PULSAR_BUNDLED_RPATH "$ORIGIN/../lib/Qt/lib")
endif()

foreach(target IN ITEMS qml-host bridge)
    set_target_properties(${target} PROPERTIES
        INSTALL_RPATH "${PULSAR_BUNDLED_RPATH}"
        BUILD_RPATH "${PULSAR_BUNDLED_RPATH}"
    )
    # DT_RPATH (not DT_RUNPATH) is inherited by indirect dependencies, so the
    # bundled Qt finds its bundled siblings (ICU, QML plugins).
    if(UNIX AND NOT APPLE)
        target_link_options(${target} PRIVATE "-Wl,--disable-new-dtags")
    endif()
endforeach()

install(TARGETS qml-host bridge launcher RUNTIME DESTINATION bin)
