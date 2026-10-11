#include "AEConfig.h"
#ifndef AE_OS_WIN
#include <AE_General.r>
#endif
resource 'PiPL' (16000) {{
 Kind { AEGP }, Name { "Moti.on Live Gestures" }, Category { "General Plugin" },
#ifdef AE_OS_WIN
 Version { 196608 }, CodeWin64X86 { "GestureBridgeMain" }
#else
 Version { 196608 }, CodeMacIntel64 { "GestureBridgeMain" }, CodeMacARM64 { "GestureBridgeMain" }
#endif
}};
