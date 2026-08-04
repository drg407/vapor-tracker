#!/bin/zsh
# App Store screenshot capture, at the exact pixel sizes App Store Connect
# accepts. Apple rejects off-by-one dimensions and any alpha channel, so every
# path here ends in `verify`.
#
#   ./scripts/screenshots.sh iphone      capture the booted iPhone simulator
#   ./scripts/screenshots.sh ipad        capture the booted iPad simulator
#   ./scripts/screenshots.sh mac         capture a selection, pad it to 16:10
#   ./scripts/screenshots.sh pad <img…>  pad shots you already took, to 16:10
#   ./scripts/screenshots.sh verify      check everything in screenshots/
#
# Simulator grabs are already native-resolution, so they need no resizing —
# that is why the iOS/iPadOS sizes are exact by construction. Only the Mac
# shots get scaled, and they are padded (letterboxed), never stretched.
set -euo pipefail

SCRIPT_DIR="${0:a:h}"   # resolved here: inside a zsh function $0 is the function name
OUT="screenshots"
PAD_COLOR="1B2838"   # Steam's page background, so letterboxing reads as intent

IPHONE_SIM="iPhone 16 Pro Max"       # 6.9" class
IPHONE_W=1320; IPHONE_H=2868
IPAD_SIM="iPad Pro 13-inch (M4)"     # 13" class
IPAD_W=2064;  IPAD_H=2752
MAC_W=2880;   MAC_H=1800             # 16:10; also valid: 1280x800 1440x900 2560x1600

dims() { echo "$(sips -g pixelWidth -g pixelHeight "$1" | awk '/pixelWidth/{w=$2}/pixelHeight/{h=$2}END{print w"x"h}')"; }

# Apple rejects any alpha channel, and simulator grabs always carry one. sips
# can only drop alpha by re-encoding as JPEG, which puts artifacts on
# screenshot text, so a Swift helper redraws the PNG opaque instead.
flatten() {
    local f="$1"
    if [[ "$(sips -g hasAlpha "$f" | awk '/hasAlpha/{print $2}')" == "yes" ]]; then
        swift "$SCRIPT_DIR/flatten-png.swift" "$f"
    fi
}

shoot_sim() {
    local name="$1" w="$2" h="$3" slug="$4"
    if ! xcrun simctl list devices booted | grep -q "$name"; then
        echo "Booting $name…"
        xcrun simctl boot "$name"
        open -a Simulator
        # The device reports booted before the UI is drawn; a screenshot taken
        # too early is a black frame.
        sleep 12
    fi
    mkdir -p "$OUT/$slug"
    local n=1
    while [[ -e "$OUT/$slug/$(printf '%02d' $n).png" ]]; do n=$((n + 1)); done
    local f="$OUT/$slug/$(printf '%02d' $n).png"
    xcrun simctl io "$name" screenshot "$f" >/dev/null 2>&1
    local got="$(dims "$f")"
    if [[ "$got" != "${w}x${h}" ]]; then
        echo "✗ $f is $got, expected ${w}x${h} — wrong simulator device?" >&2
        exit 1
    fi
    flatten "$f"
    echo "✓ $f  ($got)"
}

next_mac_path() {
    mkdir -p "$OUT/mac"
    local n=1
    while [[ -e "$OUT/mac/$(printf '%02d' $n).png" ]]; do n=$((n + 1)); done
    echo "$OUT/mac/$(printf '%02d' $n).png"
}

# Fit inside the canvas, then pad. Scaling to fill would crop; stretching would
# distort — Apple's 16:10 is rarely the shape of a window.
fit_to_mac_canvas() {
    local f="$1"
    local d="$(dims "$f")" w h
    w="${d%x*}"; h="${d#*x}"
    if (( w * MAC_H > h * MAC_W )); then
        sips --resampleWidth $MAC_W "$f" >/dev/null
    else
        sips --resampleHeight $MAC_H "$f" >/dev/null
    fi
    sips -p $MAC_H $MAC_W --padColor "$PAD_COLOR" "$f" >/dev/null 2>&1  # --padColor logs a CGColor dump

    local got="$(dims "$f")"
    if [[ "$got" != "${MAC_W}x${MAC_H}" ]]; then
        echo "✗ $f is $got, expected ${MAC_W}x${MAC_H}" >&2
        exit 1
    fi
    flatten "$f"
    echo "✓ $f  ($got)"
}

shoot_mac() {
    local f="$(next_mac_path)"
    echo "Select a region, or press space then click a window…"
    screencapture -o -i "$f"          # -o: no window shadow (it carries alpha)
    [[ -f "$f" ]] || { echo "cancelled"; exit 1; }
    fit_to_mac_canvas "$f"
}

# For shots taken by hand (⌘⇧5) — or when Screen Recording permission is off,
# which makes `mac` fail without capturing anything.
pad_existing() {
    (( $# )) || { echo "usage: screenshots.sh pad <image> …" >&2; exit 2; }
    for src in "$@"; do
        [[ -f "$src" ]] || { echo "no such file: $src" >&2; exit 1; }
        local f="$(next_mac_path)"
        cp "$src" "$f"
        fit_to_mac_canvas "$f"
    done
}

verify() {
    [[ -d "$OUT" ]] || { echo "no $OUT/ yet"; exit 1; }
    local bad=0 count=0
    for f in "$OUT"/**/*.(png|jpg|jpeg)(N); do
        count=$((count + 1))
        local d="$(dims "$f")" a="$(sips -g hasAlpha "$f" | awk '/hasAlpha/{print $2}')" ok=""
        case "$f:$d" in
            */iphone/*:${IPHONE_W}x${IPHONE_H}|*/iphone/*:${IPHONE_H}x${IPHONE_W}) ok=1 ;;
            */ipad/*:${IPAD_W}x${IPAD_H}|*/ipad/*:${IPAD_H}x${IPAD_W}) ok=1 ;;
            */mac/*:2880x1800|*/mac/*:2560x1600|*/mac/*:1440x900|*/mac/*:1280x800) ok=1 ;;
        esac
        if [[ -z "$ok" ]]; then echo "✗ $f  $d  (not an accepted size for its folder)"; bad=1; fi
        if [[ "$a" == "yes" ]]; then echo "✗ $f  has an alpha channel"; bad=1; fi
    done
    # Not `(( bad )) && exit 1`: that arithmetic is false when bad is 0, which
    # under `set -e` fails the script on the success path.
    if (( count == 0 )); then echo "no images found under $OUT/"; exit 1; fi
    if (( bad )); then exit 1; fi
    echo "✓ all $count screenshot(s) match App Store Connect specs"
}

case "${1:-}" in
    iphone) shoot_sim "$IPHONE_SIM" $IPHONE_W $IPHONE_H iphone ;;
    ipad)   shoot_sim "$IPAD_SIM"   $IPAD_W   $IPAD_H   ipad ;;
    mac)    shoot_mac ;;
    pad)    shift; pad_existing "$@" ;;
    verify) verify ;;
    *) sed -n '2,13p' "$0"; exit 1 ;;
esac
