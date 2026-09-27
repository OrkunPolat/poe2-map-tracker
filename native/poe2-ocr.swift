// Reads text from an image with Apple Vision and prints one JSON line per recognized line:
// {"y":0.12,"x0":0.30,"x1":0.62,"conf":1.0,"text":"SORROW CLAW"}  (y/x in 0..1, y from the top)
// Used by the price checker on macOS, where GeForce Now keeps the game's clipboard in the cloud.
import AppKit
import Foundation
import Vision

guard CommandLine.arguments.count > 1,
  let img = NSImage(contentsOfFile: CommandLine.arguments[1]),
  let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil)
else {
  FileHandle.standardError.write("usage: poe2-ocr <image>\n".data(using: .utf8)!)
  exit(1)
}
let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
// Game text is not prose; language correction turns "+76(65-78)" into words.
req.usesLanguageCorrection = false
req.recognitionLanguages = ["en-US"]
do {
  try VNImageRequestHandler(cgImage: cg).perform([req])
} catch {
  FileHandle.standardError.write("ocr failed: \(error)\n".data(using: .utf8)!)
  exit(2)
}
for o in (req.results ?? []).sorted(by: { $0.boundingBox.minY > $1.boundingBox.minY }) {
  guard let t = o.topCandidates(1).first else { continue }
  let b = o.boundingBox
  let line: [String: Any] = ["y": 1 - b.midY, "x0": b.minX, "x1": b.maxX, "conf": t.confidence, "text": t.string]
  if let data = try? JSONSerialization.data(withJSONObject: line), let s = String(data: data, encoding: .utf8) { print(s) }
}
