#pragma once
#include "AEConfig.h"
#include "entry.h"
#include "AE_Effect.h"
#include "AE_EffectCB.h"
#include "AE_Macros.h"
#include "Param_Utils.h"
#include "AE_EffectCBSuites.h"
#include "AE_GeneralPlug.h"
#include "AEGP_SuiteHandler.h"
#include "MotionCoreVersion.h"

enum {
    GLITCH_INPUT = 0,
    GLITCH_INTENSITY,
    GLITCH_COLOR_SPLIT,
    GLITCH_FREQUENCY,
    GLITCH_DISPLACEMENT,
    GLITCH_SEED,
    GLITCH_NUM_PARAMS
};
// Disk IDs are permanent; do not reuse or reorder these when adding controls.
enum {
    INTENSITY_DISK_ID = 1,
    COLORSPLIT_DISK_ID = 2,
    FREQUENCY_DISK_ID = 3,
    DISPLACEMENT_DISK_ID = 4,
    SEED_DISK_ID = 5
};
extern "C" DllExport PF_Err GlitchMain(
    PF_Cmd, PF_InData*, PF_OutData*, PF_ParamDef*[], PF_LayerDef*, void*);

extern "C" DllExport PF_Err WaveMain(
    PF_Cmd, PF_InData*, PF_OutData*, PF_ParamDef*[], PF_LayerDef*, void*);
