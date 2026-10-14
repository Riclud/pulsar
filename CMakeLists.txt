cmake_minimum_required(VERSION 3.21)

project(pulsar LANGUAGES CXX)

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
find_package(Qt6 6.8 REQUIRED COMPONENTS Core Gui Widgets Qml Quick Network OpenGL)

set(CMAKE_AUTOMOC ON)

# --- Qt host: renders QML, native dialogs/tray, window management ---
add_executable(qml-host
    host/main.cpp
    host/bridge.cpp
    host/log.cpp
    host/embedded.cpp
    host/bridge.h
)
target_include_directories(qml-host PRIVATE host)
target_compile_definitions(qml-host PRIVATE QT_NO_EMIT)
target_link_libraries(qml-host PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Widgets
    Qt6::Qml
    Qt6::Quick
    Qt6::Network
    Qt6::OpenGL
)

# Built-in renderer for JS-driven windows (loaded as qrc:/pulsar/PulsarView.qml).
qt_add_resources(qml-host "pulsarview"
    PREFIX "/pulsar"
    BASE "${CMAKE_CURRENT_SOURCE_DIR}/host/qml"
    FILES "${CMAKE_CURRENT_SOURCE_DIR}/host/qml/PulsarView.qml"
)

# --- Bridge: process supervisor for the JS runtime ---
add_executable(bridge bridge/main.cpp)
target_link_libraries(bridge PRIVATE Qt6::Core)

# --- Launcher: Qt-free single-file entry point ---
add_executable(launcher launcher/main.cpp)

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
