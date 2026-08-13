#!/bin/zsh
# App Store screenshot capture, at the exact pixel sizes App Store Connect
# accepts. Apple rejects off-by-one dimensions and any alpha channel, so every
# path here ends in `verify`.
#
#   ./scripts/screenshots.sh iphone      capture the booted iPhone simulator
#   ./scripts/screenshots.sh ipad        capture the booted iPad simulator
#   ./scripts/screenshots.sh mac         capture a selection, pad it to 16:10
#   ./scripts/screenshots.sh pad <img…>  pad shots you already took, to 16:10
#   ./scripts/screenshots.sh import iphone|ipad <img…>   conform device shots
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

# 16:10; also valid: 1280x800 1440x900 2560x1600. Override when the sources are
# non-Retina grabs — padding a small shot onto the big canvas only upscales blur.
#   MAC_W=1440 MAC_H=900 ./scripts/screenshots.sh pad shot.jpg
MAC_W="${MAC_W:-2880}"; MAC_H="${MAC_H:-1800}"

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

assert_size() {
    local f="$1" cw="$2" ch="$3"
    local got="$(dims "$f")"
    if [[ "$got" != "${cw}x${ch}" ]]; then
        echo "✗ $f is $got, expected ${cw}x${ch}" >&2
        exit 1
    fi
    flatten "$f"
    echo "✓ $f  ($got)"
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
    local f="$(next_path "$slug")"
    xcrun simctl io "$name" screenshot "$f" >/dev/null 2>&1
    local got="$(dims "$f")"
    if [[ "$got" != "${w}x${h}" ]]; then
        echo "✗ $f is $got, expected ${w}x${h} — wrong simulator device?" >&2
        exit 1
    fi
    flatten "$f"
    echo "✓ $f  ($got)"
}

next_path() {
    local slug="$1"
    mkdir -p "$OUT/$slug"
    local n=1
    while [[ -e "$OUT/$slug/$(printf '%02d' $n).png" ]]; do n=$((n + 1)); done
    echo "$OUT/$slug/$(printf '%02d' $n).png"
}

# Fit inside the canvas, then pad. Scaling to fill would crop; stretching would
# distort — Apple's canvas is rarely the shape of what you captured.
fit_and_pad() {
    local f="$1" cw="$2" ch="$3"
    local d="$(dims "$f")" w h
    w="${d%x*}"; h="${d#*x}"
    if (( w * ch > h * cw )); then
        sips --resampleWidth $cw "$f" >/dev/null
    else
        sips --resampleHeight $ch "$f" >/dev/null
    fi
    sips -p $ch $cw --padColor "$PAD_COLOR" "$f" >/dev/null 2>&1  # --padColor logs a CGColor dump
    assert_size "$f" $cw $ch
}

# What to do when the aspect genuinely differs. `pad` is honest but leaves bars
# down the sides, which looks wrong next to a natively-sized shot in the same
# set; `crop` scales to fill and trims the overflow instead. Cropping is
# anchored at the top — a centered crop would eat the status bar.
#   FIT=crop ./scripts/screenshots.sh import ipad shot.png
FIT="${FIT:-pad}"

fit_and_crop() {
    local f="$1" cw="$2" ch="$3"
    local d="$(dims "$f")" w h
    w="${d%x*}"; h="${d#*x}"
    if (( w * ch < h * cw )); then
        sips --resampleWidth $cw "$f" >/dev/null
    else
        sips --resampleHeight $ch "$f" >/dev/null
    fi
    # Not sips: its --cropOffset is accepted and then ignored, so it can only
    # crop centered — which trims the status bar and URL bar off the top.
    swift "$SCRIPT_DIR/crop-png.swift" "$f" 0 0 $cw $ch
    assert_size "$f" $cw $ch
}

# A device screenshot is a different pixel size than the App Store class it
# belongs to — an iPhone 16 Pro is 1206x2622 where the 6.9" slot wants
# 1320x2868. Those aspect ratios agree to 0.05%, far below anything the eye
# resolves, so a straight resample beats letterboxing. Only genuinely
# mismatched shapes get padded (or cropped, with FIT=crop).
ASPECT_TOL="0.01"   # 1% — a 1320x2868 canvas would tolerate ~14px of skew

conform() {
    local f="$1" cw="$2" ch="$3"
    local d="$(dims "$f")" w h
    w="${d%x*}"; h="${d#*x}"
    local skew="$(awk -v a=$((w)) -v b=$((h)) -v c=$cw -v e=$ch \
        'BEGIN{r=(a/b)/(c/e); if(r<1)r=1/r; printf "%.4f", r-1}')"
    if awk -v s="$skew" -v t="$ASPECT_TOL" 'BEGIN{exit !(s<=t)}'; then
        sips -z $ch $cw "$f" >/dev/null          # -z takes height then width
        assert_size "$f" $cw $ch
    else
        printf 'aspect off by %.1f%%, %s instead of stretching\n' \
            "$(awk -v s="$skew" 'BEGIN{print s*100}')" \
            "$([[ "$FIT" == crop ]] && echo cropping || echo letterboxing)"
        if [[ "$FIT" == crop ]]; then
            fit_and_crop "$f" $cw $ch
        else
            fit_and_pad "$f" $cw $ch
        fi
    fi
}

shoot_mac() {
    local f="$(next_path mac)"
    echo "Select a region, or press space then click a window…"
    screencapture -o -i "$f"          # -o: no window shadow (it carries alpha)
    [[ -f "$f" ]] || { echo "cancelled"; exit 1; }
    fit_and_pad "$f" $MAC_W $MAC_H
}

# Re-encode rather than copy: a JPEG under a .png name is still JPEG bytes,
# and App Store Connect rejects the mismatch.
adopt() { sips -s format png "$1" --out "$2" >/dev/null; }

# For shots taken by hand (⌘⇧5) — or when Screen Recording permission is off,
# which makes `mac` fail without capturing anything.
pad_existing() {
    (( $# )) || { echo "usage: screenshots.sh pad <image> …" >&2; exit 2; }
    for src in "$@"; do
        [[ -f "$src" ]] || { echo "no such file: $src" >&2; exit 1; }
        local f="$(next_path mac)"
        adopt "$src" "$f"
        fit_and_pad "$f" $MAC_W $MAC_H
    done
}

# Real-device screenshots (AirDropped from an iPhone/iPad) rather than
# simulator grabs — a 16 Pro or a non-Pro iPad is the wrong pixel size for the
# App Store class, so conform them.
import_device() {
    local slug="${1:-}"; shift 2>/dev/null || true
    local w h
    case "$slug" in
        iphone) w=$IPHONE_W; h=$IPHONE_H ;;
        ipad)   w=$IPAD_W;   h=$IPAD_H ;;
        *) echo "usage: screenshots.sh import <iphone|ipad> <image> …" >&2; exit 2 ;;
    esac
    (( $# )) || { echo "usage: screenshots.sh import $slug <image> …" >&2; exit 2; }
    for src in "$@"; do
        [[ -f "$src" ]] || { echo "no such file: $src" >&2; exit 1; }
        local f="$(next_path "$slug")"
        adopt "$src" "$f"
        conform "$f" $w $h
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
    import) shift; import_device "$@" ;;
    verify) verify ;;
    *) sed -n '2,14p' "$0"; exit 1 ;;
esac
