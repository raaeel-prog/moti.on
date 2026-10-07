#!/usr/bin/env bash
set -euo pipefail
BUNDLE="${1:?Usage: verify-bundle.sh MotionCore.plugin}"
EXECUTABLE="$BUNDLE/Contents/MacOS/MotionCore"
RESOURCE="$BUNDLE/Contents/Resources/MotionCore.rsrc"
/usr/bin/plutil -lint "$BUNDLE/Contents/Info.plist"
[[ "$(/usr/libexec/PlistBuddy -c 'Print CFBundlePackageType' "$BUNDLE/Contents/Info.plist")" == eFKT ]]
[[ -s "$RESOURCE" ]]
/usr/bin/file "$EXECUTABLE"
/usr/bin/lipo -info "$EXECUTABLE"
/usr/bin/nm -gU "$EXECUTABLE" | /usr/bin/grep ' _GlitchMain$' >/dev/null
/usr/bin/DeRez -useDF "$RESOURCE" | /usr/bin/grep "data 'PiPL' (16000)" >/dev/null
/usr/bin/nm -gU "$EXECUTABLE" | /usr/bin/grep ' _WaveMain$' >/dev/null
/usr/bin/DeRez -useDF "$RESOURCE" | /usr/bin/grep "data 'PiPL' (16001)" >/dev/null
/usr/bin/nm -gU "$EXECUTABLE" | /usr/bin/grep ' _TransitionMain$' >/dev/null
/usr/bin/DeRez -useDF "$RESOURCE" | /usr/bin/grep "data 'PiPL' (16002)" >/dev/null
/usr/bin/nm -gU "$EXECUTABLE" | /usr/bin/grep ' _GradientMain$' >/dev/null
/usr/bin/DeRez -useDF "$RESOURCE" | /usr/bin/grep "data 'PiPL' (16003)" >/dev/null
[[ "$(/usr/bin/DeRez -useDF "$RESOURCE" | /usr/bin/grep -c "data 'PiPL'")" == 4 ]]
/usr/bin/codesign --verify --strict --verbose=2 "$BUNDLE"
echo 'Mach-O, entry points, PiPL resource and signature: PASS'
