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

# App Store metadata the converter leaves off. Keyed to the app targets' exact
# bundle id so it lands on the apps, not the appex. Without the category, Mac
# App Store validation rejects the build; without the encryption key, every
# upload re-asks the export-compliance question.
sed -i '' "s|PRODUCT_BUNDLE_IDENTIFIER = com.dguevara.VaporTracker;|PRODUCT_BUNDLE_IDENTIFIER = com.dguevara.VaporTracker; INFOPLIST_KEY_LSApplicationCategoryType = \"public.app-category.utilities\"; INFOPLIST_KEY_ITSAppUsesNonExemptEncryption = NO; INFOPLIST_KEY_NSHumanReadableCopyright = \"Copyright © 2026 David Guevara\";|g" \
    "Vapor Tracker/Vapor Tracker.xcodeproj/project.pbxproj"

# --copy-resources snapshots Extension/ into the wrapper. That second copy
# goes stale the moment Extension/ is edited, and Xcode builds the snapshot —
# so a JS fix silently doesn't ship. Replace it with a symlink: one source of
# truth, and any build picks up the current files.
rm -rf "Vapor Tracker/Shared (Extension)/Resources"
ln -s ../../Extension "Vapor Tracker/Shared (Extension)/Resources"

# Replace the converter's placeholder app page with our setup instructions
cp AppPage/Main.html "Vapor Tracker/Shared (App)/Resources/Base.lproj/Main.html"
cp AppPage/Style.css "Vapor Tracker/Shared (App)/Resources/Style.css"

# grep, not tail: xcodebuild's last stdout line is blank, so `tail -1` showed
# nothing and a failed build looked exactly like a successful one. pipefail
# still aborts the script on a real failure.
xcodebuild -project "Vapor Tracker/Vapor Tracker.xcodeproj" \
    -scheme "Vapor Tracker (macOS)" -configuration Debug build | grep -E '^\*\* BUILD'

# The rm -rf above makes the app briefly vanish. If Safari notices, it marks
# the extension removed and later purges its storage — that is how an API key
# got lost once. Re-register and launch so Safari sees it installed again.
APP="$(xcodebuild -project "Vapor Tracker/Vapor Tracker.xcodeproj" \
    -scheme "Vapor Tracker (macOS)" -configuration Debug \
    -showBuildSettings 2>/dev/null | awk '/ BUILT_PRODUCTS_DIR =/{print $3}')/Vapor Tracker.app"
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Versions/Current/Frameworks/LaunchServices.framework/Versions/Current/Support/lsregister
"$LSREGISTER" -f -R -trusted "$APP"
open "$APP"
