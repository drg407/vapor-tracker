// Crops a PNG to an explicit rectangle, in place.
//
// sips can only crop centered — its documented `--cropOffset` flag is silently
// ignored, so a top-anchored crop is impossible with it. That matters for
// screenshots: centering a crop eats the status bar and the URL bar, which are
// exactly the parts that show the extension is running in Safari.
//
// Origin is top-left, matching how screenshot coordinates are usually read.
//
//   swift scripts/crop-png.swift shot.png <x> <y> <width> <height>

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

func die(_ message: String) -> Never {
    FileHandle.standardError.write("\(message)\n".data(using: .utf8)!)
    exit(1)
}

let args = Array(CommandLine.arguments.dropFirst())
guard args.count == 5, let x = Int(args[1]), let y = Int(args[2]),
      let w = Int(args[3]), let h = Int(args[4]) else {
    FileHandle.standardError.write(
        "usage: crop-png.swift <file.png> <x> <y> <width> <height>\n".data(using: .utf8)!)
    exit(2)
}

let url = URL(fileURLWithPath: args[0])
guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    die("cannot read \(args[0])")
}

guard x >= 0, y >= 0, w > 0, h > 0,
      x + w <= image.width, y + h <= image.height else {
    die("crop \(w)x\(h) at \(x),\(y) falls outside \(image.width)x\(image.height)")
}

// CGImage.cropping treats the rect as top-left origin pixel coordinates, which
// is why no height flip is needed here.
guard let cropped = image.cropping(to: CGRect(x: x, y: y, width: w, height: h)) else {
    die("crop failed for \(args[0])")
}

guard let destination = CGImageDestinationCreateWithURL(
    url as CFURL, UTType.png.identifier as CFString, 1, nil
) else {
    die("cannot write \(args[0])")
}
CGImageDestinationAddImage(destination, cropped, nil)
guard CGImageDestinationFinalize(destination) else {
    die("write failed for \(args[0])")
}
