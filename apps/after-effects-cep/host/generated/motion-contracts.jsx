/**
 * ARQUIVO GERADO. NÃO EDITE À MÃO.
 *
 * Origem: packages/contracts/src/{errors,protocol,rig-metadata,text-effects,gradient}.ts
 * Gerador: packages/contracts/scripts/gen-extendscript.mjs
 *
 * Regenere com `npm run build`. O teste de drift em
 * packages/contracts/tests/generated-drift.test.mjs falha se este arquivo sair
 * de sincronia com o fonte TypeScript.
 */
(function (global) {
  global.MotionContracts = {
    PROTOCOL_VERSION: 1,

    ERROR: {
      NO_ACTIVE_PROJECT: "NO_ACTIVE_PROJECT",
      NO_ACTIVE_COMP: "NO_ACTIVE_COMP",
      NO_ACTIVE_SEQUENCE: "NO_ACTIVE_SEQUENCE",
      NO_SELECTION: "NO_SELECTION",
      INVALID_SELECTION_TYPE: "INVALID_SELECTION_TYPE",
      UNSUPPORTED_HOST_VERSION: "UNSUPPORTED_HOST_VERSION",
      CAPABILITY_UNAVAILABLE: "CAPABILITY_UNAVAILABLE",
      PERMISSION_DENIED: "PERMISSION_DENIED",
      NETWORK_UNAVAILABLE: "NETWORK_UNAVAILABLE",
      PROVIDER_ERROR: "PROVIDER_ERROR",
      LICENSE_REQUIRED: "LICENSE_REQUIRED",
      MODEL_NOT_INSTALLED: "MODEL_NOT_INSTALLED",
      NATIVE_SERVICE_UNAVAILABLE: "NATIVE_SERVICE_UNAVAILABLE",
      INVALID_PRESET: "INVALID_PRESET",
      EXPRESSION_CONFLICT: "EXPRESSION_CONFLICT",
      KEYFRAME_CONFLICT: "KEYFRAME_CONFLICT",
      TRACK_CONFLICT: "TRACK_CONFLICT",
      ASSET_LICENSE_BLOCKED: "ASSET_LICENSE_BLOCKED",
      USER_CANCELLED: "USER_CANCELLED",
      HOST_OPERATION_FAILED: "HOST_OPERATION_FAILED",
      ROLLBACK_FAILED: "ROLLBACK_FAILED",
      INTERNAL_ERROR: "INTERNAL_ERROR"
    },

    ERROR_RECOVERABLE: {
      NO_ACTIVE_PROJECT: true,
      NO_ACTIVE_COMP: true,
      NO_ACTIVE_SEQUENCE: true,
      NO_SELECTION: true,
      INVALID_SELECTION_TYPE: true,
      UNSUPPORTED_HOST_VERSION: false,
      CAPABILITY_UNAVAILABLE: false,
      PERMISSION_DENIED: true,
      NETWORK_UNAVAILABLE: true,
      PROVIDER_ERROR: true,
      LICENSE_REQUIRED: true,
      MODEL_NOT_INSTALLED: true,
      NATIVE_SERVICE_UNAVAILABLE: false,
      INVALID_PRESET: false,
      EXPRESSION_CONFLICT: true,
      KEYFRAME_CONFLICT: true,
      TRACK_CONFLICT: true,
      ASSET_LICENSE_BLOCKED: false,
      USER_CANCELLED: true,
      HOST_OPERATION_FAILED: true,
      ROLLBACK_FAILED: false,
      INTERNAL_ERROR: false
    },

    ERROR_ACTION: {
      NO_ACTIVE_PROJECT: "error.action.openProject",
      NO_ACTIVE_COMP: "error.action.openComposition",
      NO_ACTIVE_SEQUENCE: "error.action.openSequence",
      NO_SELECTION: "error.action.selectLayers",
      INVALID_SELECTION_TYPE: "error.action.selectSupportedType",
      UNSUPPORTED_HOST_VERSION: "error.action.updateHost",
      CAPABILITY_UNAVAILABLE: "error.action.checkSystemCheck",
      PERMISSION_DENIED: "error.action.grantPermission",
      NETWORK_UNAVAILABLE: "error.action.checkConnection",
      PROVIDER_ERROR: "error.action.retryLater",
      LICENSE_REQUIRED: "error.action.activateLicense",
      MODEL_NOT_INSTALLED: "error.action.installModel",
      NATIVE_SERVICE_UNAVAILABLE: "error.action.checkSystemCheck",
      INVALID_PRESET: "error.action.reportIssue",
      EXPRESSION_CONFLICT: "error.action.chooseConflictMode",
      KEYFRAME_CONFLICT: "error.action.chooseConflictMode",
      TRACK_CONFLICT: "error.action.chooseTrack",
      ASSET_LICENSE_BLOCKED: "error.action.chooseAnotherAsset",
      USER_CANCELLED: "error.action.none",
      HOST_OPERATION_FAILED: "error.action.checkUndoHistory",
      ROLLBACK_FAILED: "error.action.undoManually",
      INTERNAL_ERROR: "error.action.exportLogBundle"
    },

    META_OPEN: "[MOTION_META_V1]",
    META_CLOSE: "[/MOTION_META_V1]",
    RIG_PREFIX: "MOTION | ",
    EXPRESSION_HEADER: "// MOTION_EXPRESSION v1 | ",
    PULSE_PRESETS: {
      "impact": {
        "durationSeconds": 1.8,
        "controls": {
          "peakScalePercent": 360,
          "animationMode": "center-out",
          "waveSpread": 45,
          "distortion": 65,
          "glow": 80,
          "seed": 1,
          "accentColor": [
            1,
            0.68,
            0.08
          ],
          "fluidity": 45
        },
        "timing": {
          "attackStart": 0.02,
          "attackEnd": 0.12,
          "holdEnd": 0.38,
          "releaseEnd": 0.62,
          "reboundEnd": 0.7,
          "reboundDepth": 0.035
        },
        "matterDelay": 0.08,
        "matterStretch": 1.12,
        "sparks": 0
      },
      "electric": {
        "durationSeconds": 1.5,
        "controls": {
          "peakScalePercent": 340,
          "animationMode": "left-to-right",
          "waveSpread": 35,
          "distortion": 85,
          "glow": 95,
          "seed": 1,
          "accentColor": [
            0.08,
            0.86,
            1
          ],
          "fluidity": 30
        },
        "timing": {
          "attackStart": 0.02,
          "attackEnd": 0.09,
          "holdEnd": 0.33,
          "releaseEnd": 0.53,
          "reboundEnd": 0.61,
          "reboundDepth": 0.025
        },
        "matterDelay": 0.05,
        "matterStretch": 1.1,
        "sparks": 4
      },
      "plasma": {
        "durationSeconds": 2.2,
        "controls": {
          "peakScalePercent": 380,
          "animationMode": "center-out",
          "waveSpread": 60,
          "distortion": 70,
          "glow": 95,
          "seed": 1,
          "accentColor": [
            0.63,
            0.18,
            1
          ],
          "fluidity": 75
        },
        "timing": {
          "attackStart": 0.02,
          "attackEnd": 0.18,
          "holdEnd": 0.34,
          "releaseEnd": 0.69,
          "reboundEnd": 0.69,
          "reboundDepth": 0
        },
        "matterDelay": 0.1,
        "matterStretch": 1.25,
        "sparks": 0
      },
      "liquid": {
        "durationSeconds": 2.6,
        "controls": {
          "peakScalePercent": 320,
          "animationMode": "center-out",
          "waveSpread": 75,
          "distortion": 35,
          "glow": 65,
          "seed": 1,
          "accentColor": [
            0.05,
            0.8,
            0.65
          ],
          "fluidity": 95
        },
        "timing": {
          "attackStart": 0.02,
          "attackEnd": 0.22,
          "holdEnd": 0.34,
          "releaseEnd": 0.7,
          "reboundEnd": 0.7,
          "reboundDepth": 0
        },
        "matterDelay": 0.1,
        "matterStretch": 1.12,
        "sparks": 0
      },
      "rupture": {
        "durationSeconds": 1.7,
        "controls": {
          "peakScalePercent": 420,
          "animationMode": "right-to-left",
          "waveSpread": 40,
          "distortion": 95,
          "glow": 85,
          "seed": 1,
          "accentColor": [
            1,
            0.23,
            0.18
          ],
          "fluidity": 40
        },
        "timing": {
          "attackStart": 0.02,
          "attackEnd": 0.09,
          "holdEnd": 0.33,
          "releaseEnd": 0.58,
          "reboundEnd": 0.68,
          "reboundDepth": 0.06
        },
        "matterDelay": 0.06,
        "matterStretch": 1.2,
        "sparks": 2
      }
    },
    GRADIENT: {
      "native": {
        "matchName": "Moti.on Gradient",
        "schemaVersion": 1,
        "stopStartIndex": 30,
        "schemaIndex": 54,
        "parameterCount": 54
      },
      "scalars": [
        {
          "key": "mode",
          "index": 1,
          "diskId": 3001,
          "kind": "enum",
          "default": "linear",
          "options": [
            "linear",
            "radial",
            "angular"
          ]
        },
        {
          "key": "centerX",
          "index": 2,
          "diskId": 3002,
          "kind": "number",
          "default": 0.5,
          "min": -2,
          "max": 3
        },
        {
          "key": "centerY",
          "index": 3,
          "diskId": 3003,
          "kind": "number",
          "default": 0.5,
          "min": -2,
          "max": 3
        },
        {
          "key": "scale",
          "index": 4,
          "diskId": 3004,
          "kind": "number",
          "default": 1,
          "min": 0.01,
          "max": 10
        },
        {
          "key": "aspect",
          "index": 5,
          "diskId": 3005,
          "kind": "number",
          "default": 1,
          "min": 0.1,
          "max": 10
        },
        {
          "key": "angle",
          "index": 6,
          "diskId": 3006,
          "kind": "number",
          "default": 0,
          "min": -36000,
          "max": 36000
        },
        {
          "key": "cycles",
          "index": 7,
          "diskId": 3007,
          "kind": "number",
          "default": 1,
          "min": 0.1,
          "max": 20
        },
        {
          "key": "offset",
          "index": 8,
          "diskId": 3008,
          "kind": "number",
          "default": 0,
          "min": -100,
          "max": 100
        },
        {
          "key": "depth",
          "index": 9,
          "diskId": 3009,
          "kind": "number",
          "default": 0.25,
          "min": 0,
          "max": 2
        },
        {
          "key": "depthRadius",
          "index": 10,
          "diskId": 3010,
          "kind": "number",
          "default": 40,
          "min": 0,
          "max": 500
        },
        {
          "key": "bulge",
          "index": 11,
          "diskId": 3011,
          "kind": "number",
          "default": 0.2,
          "min": -2,
          "max": 2
        },
        {
          "key": "turbulence",
          "index": 12,
          "diskId": 3012,
          "kind": "number",
          "default": 0.15,
          "min": 0,
          "max": 2
        },
        {
          "key": "turbulenceScale",
          "index": 13,
          "diskId": 3013,
          "kind": "number",
          "default": 200,
          "min": 1,
          "max": 2000
        },
        {
          "key": "seed",
          "index": 14,
          "diskId": 3014,
          "kind": "integer",
          "default": 1,
          "min": 0,
          "max": 1000000
        },
        {
          "key": "glow",
          "index": 15,
          "diskId": 3015,
          "kind": "number",
          "default": 0.35,
          "min": 0,
          "max": 5
        },
        {
          "key": "glowRadius",
          "index": 16,
          "diskId": 3016,
          "kind": "number",
          "default": 32,
          "min": 0,
          "max": 500
        },
        {
          "key": "glowThreshold",
          "index": 17,
          "diskId": 3017,
          "kind": "number",
          "default": 0.6,
          "min": 0,
          "max": 10
        },
        {
          "key": "highlightProtection",
          "index": 18,
          "diskId": 3018,
          "kind": "number",
          "default": 0.5,
          "min": 0,
          "max": 1
        },
        {
          "key": "diffusion",
          "index": 19,
          "diskId": 3019,
          "kind": "number",
          "default": 0,
          "min": 0,
          "max": 1
        },
        {
          "key": "diffusionRadius",
          "index": 20,
          "diskId": 3020,
          "kind": "number",
          "default": 30,
          "min": 0,
          "max": 500
        },
        {
          "key": "focusX",
          "index": 21,
          "diskId": 3021,
          "kind": "number",
          "default": 0.5,
          "min": -2,
          "max": 3
        },
        {
          "key": "focusY",
          "index": 22,
          "diskId": 3022,
          "kind": "number",
          "default": 0.5,
          "min": -2,
          "max": 3
        },
        {
          "key": "focusRadius",
          "index": 23,
          "diskId": 3023,
          "kind": "number",
          "default": 0.25,
          "min": 0,
          "max": 2
        },
        {
          "key": "focusSoftness",
          "index": 24,
          "diskId": 3024,
          "kind": "number",
          "default": 0.25,
          "min": 0.001,
          "max": 2
        },
        {
          "key": "grain",
          "index": 25,
          "diskId": 3025,
          "kind": "number",
          "default": 0,
          "min": 0,
          "max": 1
        },
        {
          "key": "animation",
          "index": 26,
          "diskId": 3026,
          "kind": "enum",
          "default": "static",
          "options": [
            "static",
            "loop"
          ]
        },
        {
          "key": "duration",
          "index": 27,
          "diskId": 3027,
          "kind": "number",
          "default": 4,
          "min": 0.1,
          "max": 120
        },
        {
          "key": "phase",
          "index": 28,
          "diskId": 3028,
          "kind": "number",
          "default": 0,
          "min": -36000,
          "max": 36000
        },
        {
          "key": "colorProcessing",
          "index": 29,
          "diskId": 3029,
          "kind": "enum",
          "default": "project",
          "options": [
            "project",
            "srgb-linear"
          ]
        }
      ],
      "keys": [
        "mode",
        "centerX",
        "centerY",
        "scale",
        "aspect",
        "angle",
        "cycles",
        "offset",
        "depth",
        "depthRadius",
        "bulge",
        "turbulence",
        "turbulenceScale",
        "seed",
        "glow",
        "glowRadius",
        "glowThreshold",
        "highlightProtection",
        "diffusion",
        "diffusionRadius",
        "focusX",
        "focusY",
        "focusRadius",
        "focusSoftness",
        "grain",
        "animation",
        "duration",
        "phase",
        "colorProcessing",
        "stops.0.enabled",
        "stops.0.color",
        "stops.0.position",
        "stops.1.enabled",
        "stops.1.color",
        "stops.1.position",
        "stops.2.enabled",
        "stops.2.color",
        "stops.2.position",
        "stops.3.enabled",
        "stops.3.color",
        "stops.3.position",
        "stops.4.enabled",
        "stops.4.color",
        "stops.4.position",
        "stops.5.enabled",
        "stops.5.color",
        "stops.5.position",
        "stops.6.enabled",
        "stops.6.color",
        "stops.6.position",
        "stops.7.enabled",
        "stops.7.color",
        "stops.7.position"
      ],
      "defaults": {
        "mode": "linear",
        "centerX": 0.5,
        "centerY": 0.5,
        "scale": 1,
        "aspect": 1,
        "angle": 0,
        "cycles": 1,
        "offset": 0,
        "depth": 0.25,
        "depthRadius": 40,
        "bulge": 0.2,
        "turbulence": 0.15,
        "turbulenceScale": 200,
        "seed": 1,
        "glow": 0.35,
        "glowRadius": 32,
        "glowThreshold": 0.6,
        "highlightProtection": 0.5,
        "diffusion": 0,
        "diffusionRadius": 30,
        "focusX": 0.5,
        "focusY": 0.5,
        "focusRadius": 0.25,
        "focusSoftness": 0.25,
        "grain": 0,
        "animation": "static",
        "duration": 4,
        "phase": 0,
        "colorProcessing": "project",
        "schemaVersion": 1,
        "stops": [
          {
            "enabled": true,
            "color": [
              0.025,
              0.035,
              0.12
            ],
            "position": 0
          },
          {
            "enabled": true,
            "color": [
              0.16,
              0.12,
              0.85
            ],
            "position": 0.3333333333333333
          },
          {
            "enabled": true,
            "color": [
              0.98,
              0.28,
              0.45
            ],
            "position": 0.6666666666666666
          },
          {
            "enabled": true,
            "color": [
              1,
              0.84,
              0.66
            ],
            "position": 1
          },
          {
            "enabled": false,
            "color": [
              1,
              0.84,
              0.66
            ],
            "position": 1
          },
          {
            "enabled": false,
            "color": [
              1,
              0.84,
              0.66
            ],
            "position": 1
          },
          {
            "enabled": false,
            "color": [
              1,
              0.84,
              0.66
            ],
            "position": 1
          },
          {
            "enabled": false,
            "color": [
              1,
              0.84,
              0.66
            ],
            "position": 1
          }
        ]
      }
    }
  };
}($.global));
