#!/bin/bash
# Records the README demo in a private headless sway. Needs sway, wf-recorder, wtype and ffmpeg.
set -u

ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
OUT=${1:-pulsar-demo.mp4}
WORK=$(mktemp -d)
APP=$WORK/app

mkdir -p "$APP"
cp -r "$ROOT"/examples/tasks/{src,pulsar.json,package.json,tsconfig.json} "$APP/"

cat > "$WORK/sway.conf" <<CONF
output HEADLESS-1 resolution 1600x900 bg #0e0f12 solid_color
default_border none
default_floating_border none
exec sh -c 'echo \$WAYLAND_DISPLAY > $WORK/wl; echo \$SWAYSOCK > $WORK/sock'
CONF

env -u WAYLAND_DISPLAY -u DISPLAY -u SWAYSOCK -u HYPRLAND_INSTANCE_SIGNATURE \
  WLR_BACKENDS=headless WLR_LIBINPUT_NO_DEVICES=1 WLR_RENDERER=pixman \
  timeout 90 sway -c "$WORK/sway.conf" > "$WORK/sway.log" 2>&1 &

sleep 2.5
export WAYLAND_DISPLAY=$(cat "$WORK/wl") SWAYSOCK=$(cat "$WORK/sock")
export QT_QUICK_BACKEND=software QSG_RHI_BACKEND=software QT_QPA_PLATFORM=wayland QT_QPA_PLATFORMTHEME=
export XDG_DATA_HOME=$WORK/xdg XDG_CONFIG_HOME=$WORK/xdg XDG_CACHE_HOME=$WORK/xdg

(cd "$ROOT/examples/tasks/demo" && DEMO_TARGET=$APP/src/main.tsx DEMO_START=$APP/.start \
  timeout 85 bun "$ROOT/cli/index.ts" dev > "$WORK/stage.log" 2>&1) &
sleep 3
(cd "$APP" && timeout 80 bun "$ROOT/cli/index.ts" dev > "$WORK/app.log" 2>&1) &
sleep 3

swaymsg '[title="Stage"] resize set width 1000 px' > /dev/null
swaymsg '[title="Tasks"] focus' > /dev/null
sleep 0.5

wf-recorder -f "$WORK/raw.mp4" -r 30 -c libx264 -p crf=18 -p preset=veryfast > "$WORK/wf.log" 2>&1 &
RECORDER=$!
sleep 0.3
touch "$APP/.start"

for _ in $(seq 1 400); do
  [ -e "$APP/.start.done" ] && break
  sleep 0.1
done

sleep 0.6
wtype -s 400 -d 75 "Show it to people" -s 500 -k Return -s 2800
kill -INT "$RECORDER"
wait "$RECORDER"
swaymsg exit > /dev/null 2>&1

# wf-recorder writes limited-range pixels but tags them as full range.
ffmpeg -v error -y -i "$WORK/raw.mp4" -c:v copy \
  -bsf:v h264_metadata=video_full_range_flag=0:colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1 \
  -movflags +faststart -an "$OUT"

echo "wrote $OUT"
