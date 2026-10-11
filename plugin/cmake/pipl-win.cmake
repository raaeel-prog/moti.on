# Windows PiPL: same three steps as the SDK Skeleton project
# (cl /EP -> PiPLtool -> cl /EP), run as a script so redirection is portable.
foreach(var CL AESDK_ROOT HOST_DIR INPUT OUTPUT WORK_DIR)
  if(NOT DEFINED ${var})
    message(FATAL_ERROR "pipl-win.cmake: ${var} not set")
  endif()
endforeach()
# Intermediate names follow the output, so several PiPLs can build in parallel.
get_filename_component(STEM "${OUTPUT}" NAME_WE)
set(RR "${WORK_DIR}/${STEM}.rr")
set(RRC "${WORK_DIR}/${STEM}.rrc")
execute_process(COMMAND "${CL}" /nologo /I "${AESDK_ROOT}/Examples/Headers"
    /I "${AESDK_ROOT}/Examples/Resources" /I "${HOST_DIR}" /EP "${INPUT}"
  OUTPUT_FILE "${RR}" RESULT_VARIABLE result)
if(result)
  message(FATAL_ERROR "PiPL preprocess failed (${result})")
endif()
execute_process(COMMAND "${AESDK_ROOT}/Examples/Resources/PiPLtool.exe" "${RR}" "${RRC}"
  RESULT_VARIABLE result)
if(result)
  message(FATAL_ERROR "PiPLtool failed (${result})")
endif()
execute_process(COMMAND "${CL}" /nologo /D MSWindows /EP "${RRC}"
  OUTPUT_FILE "${OUTPUT}" RESULT_VARIABLE result)
if(result)
  message(FATAL_ERROR "PiPL rc generation failed (${result})")
endif()
