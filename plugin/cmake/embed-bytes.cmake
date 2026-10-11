# Writes INPUT as a NUL-terminated byte array named NAME into OUTPUT (a header).
# Used for the CUDA PTX: a byte array avoids MSVC's string-literal length limit.
foreach(var INPUT OUTPUT NAME)
  if(NOT DEFINED ${var})
    message(FATAL_ERROR "embed-bytes.cmake: ${var} not set")
  endif()
endforeach()
file(READ "${INPUT}" HEX HEX)
string(REGEX REPLACE "([0-9a-f][0-9a-f])" "0x\\1," BYTES "${HEX}")
string(REGEX REPLACE "(0x..,0x..,0x..,0x..,0x..,0x..,0x..,0x..,0x..,0x..,0x..,0x..,0x..,0x..,0x..,0x..,)" "\\1\n" BYTES "${BYTES}")
file(WRITE "${OUTPUT}" "// Generated from ${INPUT}. Do not edit.\n#pragma once\nstatic const unsigned char ${NAME}[] = {\n${BYTES}0x00};\n")
