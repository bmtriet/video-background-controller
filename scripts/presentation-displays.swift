import AppKit
import Foundation

// NSScreen coordinates use a bottom-left origin. AppleScript window bounds
// and browser screenX/screenY use the primary display's top-left origin.
let primaryHeight = NSScreen.screens.first?.frame.height ?? 0
let displays = NSScreen.screens.map { screen -> [String: Any] in
    let frame = screen.visibleFrame
    return ["id": String(describing: screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] ?? ""),
            "name": screen.localizedName, "x": frame.minX,
            "y": primaryHeight - frame.maxY, "width": frame.width, "height": frame.height]
}
let data = try JSONSerialization.data(withJSONObject: displays)
FileHandle.standardOutput.write(data)
