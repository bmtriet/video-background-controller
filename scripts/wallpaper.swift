import AppKit
import Foundation

do {
    let args = CommandLine.arguments
    let screens = NSScreen.screens
    func id(_ screen: NSScreen) -> String { String((screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as! NSNumber).uint32Value) }
    if args.count == 2 && args[1] == "list" {
        let values = screens.map { screen -> [String: Any] in
            let size = screen.frame.size
            return ["id": id(screen), "name": screen.localizedName, "width": Int(size.width * screen.backingScaleFactor), "height": Int(size.height * screen.backingScaleFactor)]
        }
        let data = try JSONSerialization.data(withJSONObject: values)
        print(String(data: data, encoding: .utf8)!)
    } else {
        guard args.count >= 4, let screen = screens.first(where: { id($0) == args[2] }) else { throw NSError(domain: "Màn hình không còn kết nối", code: 1) }
        let backup = URL(fileURLWithPath: args[3])
        let workspace = NSWorkspace.shared
        if args[1] == "set" {
            guard args.count == 5 else { throw NSError(domain: "Thiếu ảnh nền", code: 1) }
            let image = URL(fileURLWithPath: args[4])
            guard NSImage(contentsOf: image) != nil else { throw NSError(domain: "Ảnh nền không hợp lệ", code: 1) }
            if !FileManager.default.fileExists(atPath: backup.path) {
                guard let previous = workspace.desktopImageURL(for: screen) else { throw NSError(domain: "Không đọc được wallpaper cũ", code: 1) }
                var saved: [String: Any] = ["url": previous.absoluteString]
                let options = workspace.desktopImageOptions(for: screen) ?? [:]
                for key in [NSWorkspace.DesktopImageOptionKey.imageScaling, .allowClipping] { if let value = options[key] { saved[key.rawValue] = value } }
                try JSONSerialization.data(withJSONObject: saved).write(to: backup, options: .atomic)
            }
            try workspace.setDesktopImageURL(image, for: screen, options: [.imageScaling: NSImageScaling.scaleProportionallyUpOrDown.rawValue, .allowClipping: false])
        } else if args[1] == "restore" {
            let saved = try JSONSerialization.jsonObject(with: Data(contentsOf: backup)) as! [String: Any]
            guard let value = saved["url"] as? String, let previous = URL(string: value) else { throw NSError(domain: "Không có wallpaper cũ", code: 1) }
            var options: [NSWorkspace.DesktopImageOptionKey: Any] = [:]
            for key in [NSWorkspace.DesktopImageOptionKey.imageScaling, .allowClipping] { if let value = saved[key.rawValue] { options[key] = value } }
            try workspace.setDesktopImageURL(previous, for: screen, options: options)
            try FileManager.default.removeItem(at: backup)
        } else { throw NSError(domain: "Lệnh không hợp lệ", code: 1) }
        print("{\"ok\":true}")
    }
} catch { fputs("\(error.localizedDescription)\n", stderr); exit(1) }
