#include "AEConfig.h"
#include "AE_EffectVers.h"
#include "MotionCoreVersion.h"
#ifndef AE_OS_WIN
#include <AE_General.r>
#endif

resource 'PiPL' (16000) {
    {
        Kind { AEEffect },
        Name { MOTION_CORE_NAME },
        Category { MOTION_CORE_CATEGORY },
#ifdef AE_OS_WIN
        CodeWin64X86 { "GlitchMain" },
#else
        CodeMacIntel64 { "GlitchMain" },
        CodeMacARM64 { "GlitchMain" },
#endif
        AE_PiPL_Version { 2, 0 },
        AE_Effect_Spec_Version { PF_PLUG_IN_VERSION, PF_PLUG_IN_SUBVERS },
        AE_Effect_Version { MOTION_CORE_VERSION },
        AE_Effect_Info_Flags { 0 },
        AE_Effect_Global_OutFlags { MOTION_CORE_OUT_FLAGS },
        AE_Effect_Global_OutFlags_2 { MOTION_CORE_OUT_FLAGS2 },
        AE_Effect_Match_Name { MOTION_CORE_MATCH_NAME },
        AE_Reserved_Info { 0 }
    }
};

resource 'PiPL' (16001) {
    {
        Kind { AEEffect },
        Name { MOTION_WAVE_NAME },
        Category { MOTION_CORE_CATEGORY },
#ifdef AE_OS_WIN
        CodeWin64X86 { "WaveMain" },
#else
        CodeMacIntel64 { "WaveMain" },
        CodeMacARM64 { "WaveMain" },
#endif
        AE_PiPL_Version { 2, 0 },
        AE_Effect_Spec_Version { PF_PLUG_IN_VERSION, PF_PLUG_IN_SUBVERS },
        AE_Effect_Version { MOTION_CORE_VERSION },
        AE_Effect_Info_Flags { 0 },
        AE_Effect_Global_OutFlags { MOTION_CORE_OUT_FLAGS },
        AE_Effect_Global_OutFlags_2 { MOTION_CORE_OUT_FLAGS2 },
        AE_Effect_Match_Name { MOTION_WAVE_MATCH_NAME },
        AE_Reserved_Info { 0 }
    }
};

resource 'PiPL' (16002) {
    {
        Kind { AEEffect },
        Name { MOTION_TRANSITION_NAME },
        Category { MOTION_CORE_CATEGORY },
#ifdef AE_OS_WIN
        CodeWin64X86 { "TransitionMain" },
#else
        CodeMacIntel64 { "TransitionMain" },
        CodeMacARM64 { "TransitionMain" },
#endif
        AE_PiPL_Version { 2, 0 },
        AE_Effect_Spec_Version { PF_PLUG_IN_VERSION, PF_PLUG_IN_SUBVERS },
        AE_Effect_Version { MOTION_TRANSITION_VERSION },
        AE_Effect_Info_Flags { 0 },
        AE_Effect_Global_OutFlags { MOTION_TRANSITION_FLAGS },
        AE_Effect_Global_OutFlags_2 { MOTION_TRANSITION_FLAGS2 },
        AE_Effect_Match_Name { MOTION_TRANSITION_MATCH_NAME },
        AE_Reserved_Info { 0 }
    }
};

resource 'PiPL' (16003) {
    {
        Kind { AEEffect },
        Name { MOTION_GRADIENT_NAME },
        Category { MOTION_CORE_CATEGORY },
#ifdef AE_OS_WIN
        CodeWin64X86 { "GradientMain" },
#else
        CodeMacIntel64 { "GradientMain" },
        CodeMacARM64 { "GradientMain" },
#endif
        AE_PiPL_Version { 2, 0 },
        AE_Effect_Spec_Version { PF_PLUG_IN_VERSION, PF_PLUG_IN_SUBVERS },
        AE_Effect_Version { MOTION_GRADIENT_VERSION },
        AE_Effect_Info_Flags { 0 },
        AE_Effect_Global_OutFlags { MOTION_GRADIENT_FLAGS },
        AE_Effect_Global_OutFlags_2 { MOTION_GRADIENT_FLAGS2 },
        AE_Effect_Match_Name { MOTION_GRADIENT_MATCH_NAME },
        AE_Reserved_Info { 0 }
    }
};
