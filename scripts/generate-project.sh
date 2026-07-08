#!/bin/zsh
# Regenerates the Xcode wrapper project (macOS + iOS) from Extension/ and
# restores signing. Run from the repo root after changing manifest.json or
# adding/removing extension files.
set -euo pipefail

TEAM="7UFLPXKQC2"

rm -rf "Vapor Tracker"
xcrun safari-web-extension-converter Extension \
    --project-location . \
    --app-name "Vapor Tracker" \
    --bundle-identifier com.dguevara.VaporTracker \
    --no-open --no-prompt --copy-resources

# Converter doesn't set a team; add it to every target so signed builds work
sed -i '' "s/PRODUCT_BUNDLE_IDENTIFIER = /DEVELOPMENT_TEAM = ${TEAM}; PRODUCT_BUNDLE_IDENTIFIER = /" \
    "Vapor Tracker/Vapor Tracker.xcodeproj/project.pbxproj"

# Replace the converter's placeholder app page with our setup instructions
cp AppPage/Main.html "Vapor Tracker/Shared (App)/Resources/Base.lproj/Main.html"
cp AppPage/Style.css "Vapor Tracker/Shared (App)/Resources/Style.css"

xcodebuild -project "Vapor Tracker/Vapor Tracker.xcodeproj" \
    -scheme "Vapor Tracker (macOS)" -configuration Debug build | tail -1
