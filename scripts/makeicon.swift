import AppKit

// Draws the extension/app icon: dark Steam-navy squircle with a falling
// price-chart arrow in Steam green. Writes PNGs for all manifest sizes.

let sizes = [16, 32, 48, 64, 96, 128, 256, 512, 1024]
let outDir = "Extension/img"

try FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

// fullBleed draws the iOS App Store icon: edge-to-edge and fully opaque.
// iOS applies its own rounded mask, so shipping the macOS squircle there would
// render inset inside a second set of corners — and App Store Connect rejects
// any alpha channel in the icon outright (ITMS-90717).
func draw(size: Int, fullBleed: Bool = false) -> NSBitmapImageRep {
    let s = CGFloat(size)
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
                               bitsPerSample: 8, samplesPerPixel: fullBleed ? 3 : 4,
                               hasAlpha: !fullBleed, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

    // Squircle background with macOS-style margins; square and edge-to-edge for iOS
    let inset = fullBleed ? 0 : s * 0.05
    let bgRect = NSRect(x: inset, y: inset, width: s - 2 * inset, height: s - 2 * inset)
    let radius = fullBleed ? 0 : s * 0.2
    let bg = NSBezierPath(roundedRect: bgRect, xRadius: radius, yRadius: radius)
    let gradient = NSGradient(starting: NSColor(calibratedRed: 0x2a/255, green: 0x47/255, blue: 0x5e/255, alpha: 1),
                              ending: NSColor(calibratedRed: 0x16/255, green: 0x20/255, blue: 0x2d/255, alpha: 1))!
    gradient.draw(in: bg, angle: -90)

    // Falling price line: high at left, zigzag down to the right
    let green = NSColor(calibratedRed: 0xa4/255, green: 0xd0/255, blue: 0x07/255, alpha: 1)
    let line = NSBezierPath()
    line.lineWidth = s * 0.09
    line.lineCapStyle = .round
    line.lineJoinStyle = .round
    line.move(to: NSPoint(x: s * 0.22, y: s * 0.74))
    line.line(to: NSPoint(x: s * 0.40, y: s * 0.52))
    line.line(to: NSPoint(x: s * 0.52, y: s * 0.62))
    line.line(to: NSPoint(x: s * 0.72, y: s * 0.34))
    green.setStroke()
    line.stroke()

    // Arrowhead at the end of the fall
    let head = NSBezierPath()
    head.move(to: NSPoint(x: s * 0.78, y: s * 0.44))
    head.line(to: NSPoint(x: s * 0.79, y: s * 0.24))
    head.line(to: NSPoint(x: s * 0.60, y: s * 0.29))
    head.close()
    green.setFill()
    head.fill()

    // Baseline dots in Steam blue for a hint of "chart"
    let blue = NSColor(calibratedRed: 0x66/255, green: 0xc0/255, blue: 0xf4/255, alpha: 1)
    blue.setFill()
    for i in 0..<4 {
        let x = s * (0.24 + 0.16 * CGFloat(i))
        let r = s * 0.025
        NSBezierPath(ovalIn: NSRect(x: x - r, y: s * 0.16 - r, width: 2 * r, height: 2 * r)).fill()
    }

    NSGraphicsContext.restoreGraphicsState()
    return rep
}

for size in sizes {
    let rep = draw(size: size)
    let png = rep.representation(using: .png, properties: [:])!
    let path = "\(outDir)/icon\(size).png"
    try png.write(to: URL(fileURLWithPath: path))
    print("wrote \(path)")
}

// The iOS entries in AppIcon.appiconset all point at this one file. The mac
// entries use their own mac-icon-*.png and keep the inset squircle.
let appIconDir = "Vapor Tracker/Shared (App)/Assets.xcassets/AppIcon.appiconset"
if FileManager.default.fileExists(atPath: appIconDir) {
    let rep = draw(size: 1024, fullBleed: true)
    let png = rep.representation(using: .png, properties: [:])!
    let path = "\(appIconDir)/universal-icon-1024@1x.png"
    try png.write(to: URL(fileURLWithPath: path))
    print("wrote \(path)")
}
