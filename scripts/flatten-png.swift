// Rewrites PNGs without an alpha channel, in place.
//
// App Store Connect rejects any image carrying transparency, and simulator
// screenshots always carry an alpha channel. sips can only drop alpha by
// re-encoding as JPEG, which puts compression artifacts on screenshot text —
// so redraw into an opaque RGB context instead and stay lossless PNG.
//
//   swift scripts/flatten-png.swift shot.png [more.png …]

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let paths = Array(CommandLine.arguments.dropFirst())
guard !paths.isEmpty else {
    FileHandle.standardError.write("usage: flatten-png.swift <file.png> …\n".data(using: .utf8)!)
    exit(2)
}

for path in paths {
    let url = URL(fileURLWithPath: path)
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        FileHandle.standardError.write("cannot read \(path)\n".data(using: .utf8)!)
        exit(1)
    }

    // noneSkipLast is what drops the channel: 32 bits per pixel, alpha ignored.
    guard let context = CGContext(
        data: nil,
        width: image.width,
        height: image.height,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
    ) else {
        FileHandle.standardError.write("cannot build context for \(path)\n".data(using: .utf8)!)
        exit(1)
    }

    let rect = CGRect(x: 0, y: 0, width: image.width, height: image.height)
    // Any transparent pixels composite onto black rather than undefined memory.
    context.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
    context.fill(rect)
    context.draw(image, in: rect)

    guard let flattened = context.makeImage(),
          let destination = CGImageDestinationCreateWithURL(
              url as CFURL, UTType.png.identifier as CFString, 1, nil
          ) else {
        FileHandle.standardError.write("cannot write \(path)\n".data(using: .utf8)!)
        exit(1)
    }
    CGImageDestinationAddImage(destination, flattened, nil)
    guard CGImageDestinationFinalize(destination) else {
        FileHandle.standardError.write("write failed for \(path)\n".data(using: .utf8)!)
        exit(1)
    }
}
