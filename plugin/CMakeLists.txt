cmake_minimum_required(VERSION 3.20)
set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64" CACHE STRING "macOS architectures")
set(CMAKE_XCODE_ATTRIBUTE_ONLY_ACTIVE_ARCH "NO")
set(CMAKE_OSX_DEPLOYMENT_TARGET "12.0" CACHE STRING "Minimum macOS version")
project(MotionCore VERSION 1.4.0 LANGUAGES CXX)
if(NOT APPLE AND NOT WIN32)
    message(FATAL_ERROR "MotionCore supports macOS and Windows only.")
endif()
set(AESDK_ROOT "$ENV{AESDK_ROOT}" CACHE PATH "Adobe After Effects SDK root")
if(NOT EXISTS "${AESDK_ROOT}/Examples/Headers/AE_Effect.h")
    message(FATAL_ERROR "Set AESDK_ROOT to the extracted Adobe After Effects SDK root.")
endif()
# Kernel tests must keep assert() active in every configuration.
set(MOTION_KEEP_ASSERTS "$<IF:$<CXX_COMPILER_ID:MSVC>,/UNDEBUG,-UNDEBUG>")
if(WIN32)
    # Windows: MotionCore.aex. Same sources and PiPL as macOS; Gradient renders
    # on the CPU (no Metal). Static CRT so AE needs no VC++ redistributable.
    if(NOT MSVC)
        message(FATAL_ERROR "Build MotionCore.aex with Visual Studio (MSVC) — the SDK PiPL tooling needs cl.exe.")
    endif()
    set(PIPL_RC "${CMAKE_CURRENT_BINARY_DIR}/MotionCorePiPL.rc")
    add_custom_command(OUTPUT "${PIPL_RC}"
        COMMAND "${CMAKE_COMMAND}" -DCL=${CMAKE_CXX_COMPILER} -DAESDK_ROOT=${AESDK_ROOT}
            -DHOST_DIR=${CMAKE_CURRENT_SOURCE_DIR}/host
            -DINPUT=${CMAKE_CURRENT_SOURCE_DIR}/resources/MotionCorePiPL.r
            -DOUTPUT=${PIPL_RC} -DWORK_DIR=${CMAKE_CURRENT_BINARY_DIR}
            -P "${CMAKE_CURRENT_SOURCE_DIR}/cmake/pipl-win.cmake"
        DEPENDS resources/MotionCorePiPL.r host/MotionCoreVersion.h cmake/pipl-win.cmake
        VERBATIM)
    # Gradient GPU path on Windows: DirectX 12 compute shaders compiled by dxc
    # (Windows SDK) and embedded as byte arrays, so nothing extra ships next to the .aex.
    set(MOTION_WINDOWS_KITS_BIN "C:/Program Files (x86)/Windows Kits/10/bin")
    file(GLOB MOTION_DXC_DIRS LIST_DIRECTORIES true "${MOTION_WINDOWS_KITS_BIN}/10.*/x64")
    list(SORT MOTION_DXC_DIRS COMPARE NATURAL ORDER DESCENDING)
    find_program(MOTION_DXC dxc
        HINTS "${MOTION_WINDOWS_KITS_BIN}/${CMAKE_VS_WINDOWS_TARGET_PLATFORM_VERSION}/x64" ${MOTION_DXC_DIRS}
        REQUIRED)
    set(GRADIENT_SHADER_DIR "${CMAKE_CURRENT_BINARY_DIR}/shaders")
    set(GRADIENT_SHADER_HEADERS "")
    foreach(kernel alpha base box copy diffusion extract accumulate finish)
        set(header "${GRADIENT_SHADER_DIR}/gradient_d3d12_${kernel}.h")
        add_custom_command(OUTPUT "${header}"
            COMMAND "${CMAKE_COMMAND}" -E make_directory "${GRADIENT_SHADER_DIR}"
            COMMAND "${MOTION_DXC}" -nologo -T cs_6_0 -E gradient_${kernel} -Gis -O3
                -Fh "${header}" -Vn g_gradient_${kernel}
                "${CMAKE_CURRENT_SOURCE_DIR}/host/GradientD3D12.hlsl"
            DEPENDS host/GradientD3D12.hlsl host/GradientMath.inc
            VERBATIM)
        list(APPEND GRADIENT_SHADER_HEADERS "${header}")
    endforeach()
    add_custom_target(gradient-d3d12-shaders DEPENDS ${GRADIENT_SHADER_HEADERS})
    add_library(MotionCore MODULE host/MotionCore.cpp host/Transition.cpp host/Gradient.cpp
        host/GradientKernel.cpp host/GradientMetalStub.cpp host/GradientD3D12.cpp
        "${AESDK_ROOT}/Examples/Util/MissingSuiteError.cpp"
        "${AESDK_ROOT}/Examples/Util/AEGP_SuiteHandler.cpp"
        "${PIPL_RC}")
    target_compile_features(MotionCore PRIVATE cxx_std_17)
    target_compile_definitions(MotionCore PRIVATE MSWindows WIN32 _WINDOWS NOMINMAX
        _CRT_SECURE_NO_WARNINGS)
    target_compile_options(MotionCore PRIVATE /utf-8 /EHsc)
    target_include_directories(MotionCore PRIVATE
        "${AESDK_ROOT}/Examples/Headers" "${AESDK_ROOT}/Examples/Headers/SP"
        "${AESDK_ROOT}/Examples/Headers/Win" "${AESDK_ROOT}/Examples/Resources"
        "${AESDK_ROOT}/Examples/Util" host "${GRADIENT_SHADER_DIR}")
    add_dependencies(MotionCore gradient-d3d12-shaders)
    target_link_libraries(MotionCore PRIVATE d3d12)
    option(MOTION_GRADIENT_QA_TRACE "Write local Gradient host diagnostics for verification builds" OFF)
    if(MOTION_GRADIENT_QA_TRACE)
        target_compile_definitions(MotionCore PRIVATE MOTION_GRADIENT_QA_TRACE=1)
    endif()
    set_target_properties(MotionCore PROPERTIES PREFIX "" SUFFIX ".aex" OUTPUT_NAME MotionCore
        MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

    # Live Gestures AEGP (quick bar on the Timeline + native parameter drag).
    # macOS builds the same plug-in from gesture/CMakeLists.txt (AppKit).
    set(GESTURE_PIPL_RC "${CMAKE_CURRENT_BINARY_DIR}/GestureBridgePiPL.rc")
    add_custom_command(OUTPUT "${GESTURE_PIPL_RC}"
        COMMAND "${CMAKE_COMMAND}" -DCL=${CMAKE_CXX_COMPILER} -DAESDK_ROOT=${AESDK_ROOT}
            -DHOST_DIR=${CMAKE_CURRENT_SOURCE_DIR}/gesture
            -DINPUT=${CMAKE_CURRENT_SOURCE_DIR}/gesture/GestureBridge.r
            -DOUTPUT=${GESTURE_PIPL_RC} -DWORK_DIR=${CMAKE_CURRENT_BINARY_DIR}
            -P "${CMAKE_CURRENT_SOURCE_DIR}/cmake/pipl-win.cmake"
        DEPENDS gesture/GestureBridge.r cmake/pipl-win.cmake
        VERBATIM)
    add_library(MotionGestureBridge MODULE gesture/win/GestureBridgeWin.cpp gesture/win/QuickBarWin.cpp
        "${AESDK_ROOT}/Examples/Util/MissingSuiteError.cpp"
        "${AESDK_ROOT}/Examples/Util/AEGP_SuiteHandler.cpp"
        "${GESTURE_PIPL_RC}")
    target_compile_features(MotionGestureBridge PRIVATE cxx_std_17)
    # Windows 10 1607+ APIs (per-monitor DPI); After Effects 2025+ requires Windows 10 22H2 or later.
    target_compile_definitions(MotionGestureBridge PRIVATE MSWindows WIN32 _WINDOWS NOMINMAX
        _CRT_SECURE_NO_WARNINGS _WIN32_WINNT=0x0A00 WINVER=0x0A00)
    target_compile_options(MotionGestureBridge PRIVATE /utf-8 /EHsc /W4)
    target_include_directories(MotionGestureBridge PRIVATE
        "${AESDK_ROOT}/Examples/Headers" "${AESDK_ROOT}/Examples/Headers/SP"
        "${AESDK_ROOT}/Examples/Headers/Win" "${AESDK_ROOT}/Examples/Resources"
        "${AESDK_ROOT}/Examples/Util" gesture)
    target_link_libraries(MotionGestureBridge PRIVATE gdiplus comctl32 shcore rpcrt4 shell32 ole32 user32 gdi32)
    set_target_properties(MotionGestureBridge PROPERTIES PREFIX "" SUFFIX ".aex" OUTPUT_NAME MotionGestureBridge
        MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
else()
enable_language(OBJCXX)
set(MOTION_CODESIGN_IDENTITY "-" CACHE STRING "Signing identity; - is development ad-hoc only")
execute_process(COMMAND xcrun --show-sdk-path OUTPUT_VARIABLE MACOS_SDK
    OUTPUT_STRIP_TRAILING_WHITESPACE COMMAND_ERROR_IS_FATAL ANY)
execute_process(COMMAND xcrun --find Rez OUTPUT_VARIABLE REZ
    OUTPUT_STRIP_TRAILING_WHITESPACE COMMAND_ERROR_IS_FATAL ANY)
set(PIPL_RESOURCE "${CMAKE_CURRENT_BINARY_DIR}/MotionCore.rsrc")
# Adobe's Skeleton sample places the Rez resource in the bundle Resources phase.
# Never merge a resource fork into, or append resources to, the Mach-O.
add_custom_command(OUTPUT "${PIPL_RESOURCE}"
    COMMAND "${REZ}" -d __MACH__ -isysroot "${MACOS_SDK}"
        -i "${AESDK_ROOT}/Examples/Headers"
        -i "${AESDK_ROOT}/Examples/Resources"
        -i "${CMAKE_CURRENT_SOURCE_DIR}/host"
        -useDF -o "${PIPL_RESOURCE}"
        "${CMAKE_CURRENT_SOURCE_DIR}/resources/MotionCorePiPL.r"
    DEPENDS resources/MotionCorePiPL.r host/MotionCoreVersion.h
        "${AESDK_ROOT}/Examples/Headers/AE_EffectVers.h"
        "${AESDK_ROOT}/Examples/Resources/AE_General.r"
    VERBATIM)
set_source_files_properties("${PIPL_RESOURCE}" PROPERTIES
    GENERATED TRUE MACOSX_PACKAGE_LOCATION Resources)
add_library(MotionCore MODULE host/MotionCore.cpp host/Transition.cpp host/Gradient.cpp host/GradientKernel.cpp host/GradientMetal.mm
    "${AESDK_ROOT}/Examples/Util/MissingSuiteError.cpp"
    "${AESDK_ROOT}/Examples/Util/AEGP_SuiteHandler.cpp"
    "${PIPL_RESOURCE}")
target_compile_features(MotionCore PRIVATE cxx_std_17)
option(MOTION_GRADIENT_QA_TRACE "Write local Gradient host diagnostics for verification builds" OFF)
if(MOTION_GRADIENT_QA_TRACE)
    target_compile_definitions(MotionCore PRIVATE MOTION_GRADIENT_QA_TRACE=1)
endif()
target_include_directories(MotionCore PRIVATE
    "${AESDK_ROOT}/Examples/Headers" "${AESDK_ROOT}/Examples/Headers/SP"
    "${AESDK_ROOT}/Examples/Util")
target_link_libraries(MotionCore PRIVATE "-framework CoreFoundation" "-framework Foundation" "-framework Metal")
set_target_properties(MotionCore PROPERTIES
    BUNDLE TRUE BUNDLE_EXTENSION plugin PREFIX "" OUTPUT_NAME MotionCore
    CXX_VISIBILITY_PRESET hidden VISIBILITY_INLINES_HIDDEN YES
    MACOSX_BUNDLE_INFO_PLIST "${CMAKE_CURRENT_SOURCE_DIR}/resources/Info.plist"
    XCODE_ATTRIBUTE_CODE_SIGNING_ALLOWED NO)
add_custom_command(TARGET MotionCore POST_BUILD
    COMMAND /usr/bin/codesign --force --sign "${MOTION_CODESIGN_IDENTITY}"
        --timestamp=none "$<TARGET_BUNDLE_DIR:MotionCore>"
    COMMAND /bin/bash "${CMAKE_CURRENT_SOURCE_DIR}/verify-bundle.sh"
        "$<TARGET_BUNDLE_DIR:MotionCore>"
    VERBATIM)
endif()
include(CTest)
if(BUILD_TESTING)
    add_executable(glitch-kernel-tests tests/GlitchKernelTests.cpp)
    target_compile_features(glitch-kernel-tests PRIVATE cxx_std_17)
    target_include_directories(glitch-kernel-tests PRIVATE host)
    target_compile_options(glitch-kernel-tests PRIVATE ${MOTION_KEEP_ASSERTS})
    add_test(NAME glitch-kernel COMMAND glitch-kernel-tests)
    add_executable(wave-kernel-tests tests/WaveKernelTests.cpp)
    target_compile_features(wave-kernel-tests PRIVATE cxx_std_17)
    target_include_directories(wave-kernel-tests PRIVATE host)
    target_compile_options(wave-kernel-tests PRIVATE ${MOTION_KEEP_ASSERTS})
    add_test(NAME wave-kernel COMMAND wave-kernel-tests)
    add_executable(transition-kernel-tests tests/TransitionKernelTests.cpp)
    target_compile_features(transition-kernel-tests PRIVATE cxx_std_17)
    target_include_directories(transition-kernel-tests PRIVATE host)
    target_compile_options(transition-kernel-tests PRIVATE ${MOTION_KEEP_ASSERTS})
    add_test(NAME transition-kernel COMMAND transition-kernel-tests)
    add_executable(gradient-kernel-tests tests/GradientKernelTests.cpp host/GradientKernel.cpp)
    target_compile_features(gradient-kernel-tests PRIVATE cxx_std_17)
    target_include_directories(gradient-kernel-tests PRIVATE host)
    target_compile_options(gradient-kernel-tests PRIVATE ${MOTION_KEEP_ASSERTS})
    add_test(NAME gradient-kernel COMMAND gradient-kernel-tests)
    if(WIN32)
    add_executable(quickbar-protocol-tests tests/QuickBarProtocolTests.cpp)
    target_compile_features(quickbar-protocol-tests PRIVATE cxx_std_17)
    target_compile_options(quickbar-protocol-tests PRIVATE ${MOTION_KEEP_ASSERTS} /utf-8)
    add_test(NAME quickbar-protocol COMMAND quickbar-protocol-tests)
    # CPU × DirectX 12 parity on the default GPU (falls back to WARP); 77 = no device.
    add_executable(gradient-d3d12-tests tests/GradientD3D12Tests.cpp host/GradientKernel.cpp host/GradientD3D12.cpp)
    add_dependencies(gradient-d3d12-tests gradient-d3d12-shaders)
    target_compile_features(gradient-d3d12-tests PRIVATE cxx_std_17)
    target_compile_definitions(gradient-d3d12-tests PRIVATE NOMINMAX)
    target_include_directories(gradient-d3d12-tests PRIVATE host "${GRADIENT_SHADER_DIR}")
    target_compile_options(gradient-d3d12-tests PRIVATE ${MOTION_KEEP_ASSERTS} /utf-8)
    target_link_libraries(gradient-d3d12-tests PRIVATE d3d12 dxgi)
    add_test(NAME gradient-d3d12 COMMAND gradient-d3d12-tests)
    set_tests_properties(gradient-d3d12 PROPERTIES SKIP_RETURN_CODE 77)
    endif()
    if(APPLE)
    add_executable(gradient-metal-tests tests/GradientMetalTests.mm host/GradientKernel.cpp host/GradientMetal.mm)
    target_compile_features(gradient-metal-tests PRIVATE cxx_std_17)
    target_include_directories(gradient-metal-tests PRIVATE host)
    target_compile_options(gradient-metal-tests PRIVATE ${MOTION_KEEP_ASSERTS})
    target_link_libraries(gradient-metal-tests PRIVATE "-framework Foundation" "-framework Metal")
    add_test(NAME gradient-metal COMMAND gradient-metal-tests)
    endif()
endif()
