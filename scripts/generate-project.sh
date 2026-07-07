#!/bin/zsh
# Regenerates the Xcode wrapper project from Extension/ and restores signing.
# Run from the repo root after changing manifest.json or adding/removing files.
set -euo pipefail

TEAM="7UFLPXKQC2"

rm -rf SteamPricesPOC
xcrun safari-web-extension-converter Extension \
    --project-location . \
    --app-name "SteamPricesPOC" \
    --bundle-identifier com.dguevara.SteamPricesPOC \
    --macos-only --no-open --no-prompt --copy-resources

# Converter doesn't set a team; add it to every target so signed builds work
sed -i '' "s/PRODUCT_BUNDLE_IDENTIFIER = /DEVELOPMENT_TEAM = ${TEAM}; PRODUCT_BUNDLE_IDENTIFIER = /" \
    SteamPricesPOC/SteamPricesPOC.xcodeproj/project.pbxproj

xcodebuild -project SteamPricesPOC/SteamPricesPOC.xcodeproj \
    -scheme SteamPricesPOC -configuration Debug build | tail -1
