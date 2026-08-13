// Paints opaque rectangles over a PNG, in place — for removing personal data
// from a screenshot before it goes on a public App Store listing.
//
// The regions worth masking (a bookmarks bar, an account name, a wallet
// balance) sit on flat backgrounds, so a rectangle in the sampled background
// color is invisible. Sample first, then mask:
//
//   swift scripts/mask-png.swift --sample shot.png 1200 150      → 1b2838
//   swift scripts/mask-png.swift shot.png 1465,120,93,50,1b2838 …
//
// Origin is top-left, matching crop-png.swift.

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

func die(_ message: String) -> Never {
    FileHandle.standardError.write("\(message)\n".data(using: .utf8)!)
    exit(1)
}

func load(_ path: String) -> CGImage {
    guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        die("cannot read \(path)")
    }
    return image
}

// Sampling and filling must share one color space, or a mask lands a few
// values off the color it was sampled from.
let deviceRGB = CGColorSpaceCreateDeviceRGB()

// Draw into a known layout rather than trusting the file's own byte order.
func rasterize(_ image: CGImage) -> CGContext {
    guard let context = CGContext(
        data: nil, width: image.width, height: image.height,
        bitsPerComponent: 8, bytesPerRow: image.width * 4,
        space: deviceRGB,
        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
    ) else { die("cannot build context") }
    context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
    return context
}

let args = Array(CommandLine.arguments.dropFirst())

if args.first == "--sample" {
    guard args.count == 4, let x = Int(args[2]), let y = Int(args[3]) else {
        die("usage: mask-png.swift --sample <file.png> <x> <y>")
    }
    let image = load(args[1])
    let context = rasterize(image)
    guard x >= 0, y >= 0, x < image.width, y < image.height else {
        die("\(x),\(y) is outside \(image.width)x\(image.height)")
    }
    guard let data = context.data else { die("cannot read pixels") }
    // The backing buffer runs top-down — row 0 is the top of the image — so
    // indexing matches the top-left convention directly, with no flip. (Drawing
    // still goes through user space, which is bottom-left; see fill below.)
    let pixel = data.advanced(by: (y * image.width + x) * 4)
        .assumingMemoryBound(to: UInt8.self)
    print(String(format: "%02x%02x%02x", pixel[0], pixel[1], pixel[2]))
    exit(0)
}

guard args.count >= 2 else {
    FileHandle.standardError.write(
        "usage: mask-png.swift <file.png> <x,y,w,h,RRGGBB> …\n".data(using: .utf8)!)
    exit(2)
}

let path = args[0]
let image = load(path)
let context = rasterize(image)

for spec in args.dropFirst() {
    let parts = spec.split(separator: ",")
    guard parts.count == 5, let x = Int(parts[0]), let y = Int(parts[1]),
          let w = Int(parts[2]), let h = Int(parts[3]),
          let rgb = Int(parts[4], radix: 16), parts[4].count == 6 else {
        die("bad rect \(spec) — want x,y,w,h,RRGGBB")
    }
    guard x >= 0, y >= 0, w > 0, h > 0,
          x + w <= image.width, y + h <= image.height else {
        die("rect \(spec) falls outside \(image.width)x\(image.height)")
    }
    // Build the color in the context's own space. CGColor(red:green:blue:alpha:)
    // is generic sRGB, and filling that into a DeviceRGB context color-converts
    // it — the mask then lands a few values off the color it was sampled from
    // and shows as a faint rectangle.
    guard let fill = CGColor(colorSpace: deviceRGB, components: [
        CGFloat((rgb >> 16) & 0xff) / 255,
        CGFloat((rgb >> 8) & 0xff) / 255,
        CGFloat(rgb & 0xff) / 255,
        1,
    ]) else { die("cannot build color \(parts[4])") }
    context.setFillColor(fill)
    // Flip into the context's bottom-left origin.
    context.fill(CGRect(x: x, y: image.height - y - h, width: w, height: h))
}

guard let masked = context.makeImage(),
      let destination = CGImageDestinationCreateWithURL(
          URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil
      ) else { die("cannot write \(path)") }
CGImageDestinationAddImage(destination, masked, nil)
guard CGImageDestinationFinalize(destination) else { die("write failed for \(path)") }
