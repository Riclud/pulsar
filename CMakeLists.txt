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
set_target_properties(qml-host PROPERTIES
    INSTALL_RPATH "${PULSAR_BUNDLED_RPATH}"
    BUILD_RPATH "${PULSAR_BUNDLED_RPATH}"
)

install(TARGETS qml-host bridge launcher RUNTIME DESTINATION bin)
