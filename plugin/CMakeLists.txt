cmake_minimum_required(VERSION 3.20)
set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64" CACHE STRING "macOS architectures")
set(CMAKE_XCODE_ATTRIBUTE_ONLY_ACTIVE_ARCH "NO")
set(CMAKE_OSX_DEPLOYMENT_TARGET "12.0" CACHE STRING "Minimum macOS version")
project(MotionCore VERSION 1.4.0 LANGUAGES CXX OBJCXX)
if(NOT APPLE)
    message(FATAL_ERROR "This bundle target currently supports macOS only.")
endif()
set(AESDK_ROOT "$ENV{AESDK_ROOT}" CACHE PATH "Adobe After Effects SDK root")
if(NOT EXISTS "${AESDK_ROOT}/Examples/Headers/AE_Effect.h")
    message(FATAL_ERROR "Set AESDK_ROOT to the extracted Adobe After Effects SDK root.")
endif()
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
include(CTest)
if(BUILD_TESTING)
    add_executable(glitch-kernel-tests tests/GlitchKernelTests.cpp)
    target_compile_features(glitch-kernel-tests PRIVATE cxx_std_17)
    target_include_directories(glitch-kernel-tests PRIVATE host)
    target_compile_options(glitch-kernel-tests PRIVATE -UNDEBUG)
    add_test(NAME glitch-kernel COMMAND glitch-kernel-tests)
    add_executable(wave-kernel-tests tests/WaveKernelTests.cpp)
    target_compile_features(wave-kernel-tests PRIVATE cxx_std_17)
    target_include_directories(wave-kernel-tests PRIVATE host)
    target_compile_options(wave-kernel-tests PRIVATE -UNDEBUG)
    add_test(NAME wave-kernel COMMAND wave-kernel-tests)
    add_executable(transition-kernel-tests tests/TransitionKernelTests.cpp)
    target_compile_features(transition-kernel-tests PRIVATE cxx_std_17)
    target_include_directories(transition-kernel-tests PRIVATE host)
    target_compile_options(transition-kernel-tests PRIVATE -UNDEBUG)
    add_test(NAME transition-kernel COMMAND transition-kernel-tests)
    add_executable(gradient-kernel-tests tests/GradientKernelTests.cpp host/GradientKernel.cpp)
    target_compile_features(gradient-kernel-tests PRIVATE cxx_std_17)
    target_include_directories(gradient-kernel-tests PRIVATE host)
    target_compile_options(gradient-kernel-tests PRIVATE -UNDEBUG)
    add_test(NAME gradient-kernel COMMAND gradient-kernel-tests)
    add_executable(gradient-metal-tests tests/GradientMetalTests.mm host/GradientKernel.cpp host/GradientMetal.mm)
    target_compile_features(gradient-metal-tests PRIVATE cxx_std_17)
    target_include_directories(gradient-metal-tests PRIVATE host)
    target_compile_options(gradient-metal-tests PRIVATE -UNDEBUG)
    target_link_libraries(gradient-metal-tests PRIVATE "-framework Foundation" "-framework Metal")
    add_test(NAME gradient-metal COMMAND gradient-metal-tests)
endif()
