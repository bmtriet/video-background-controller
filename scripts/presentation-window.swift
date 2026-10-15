import AppKit
import ApplicationServices
import Foundation

// Limit all UI actions to the UUID-named uploaded copy and its Reading View.
// Never prompt for Accessibility access or inspect another application's UI.
func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data(message.utf8)); exit(1)
}
func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var result: CFTypeRef?
    AXUIElementCopyAttributeValue(element, name as CFString, &result)
    return result
}
func text(_ element: AXUIElement, _ name: String) -> String {
    attribute(element, name) as? String ?? ""
}
func children(_ element: AXUIElement) -> [AXUIElement] {
    attribute(element, kAXChildrenAttribute) as? [AXUIElement] ?? []
}
func find(_ element: AXUIElement, depth: Int = 0, matching: (AXUIElement) -> Bool) -> AXUIElement? {
    if matching(element) { return element }
    if depth >= 16 { return nil }
    for child in children(element) {
        if let result = find(child, depth: depth + 1, matching: matching) { return result }
    }
    return nil
}
let arguments = Array(CommandLine.arguments.dropFirst())
guard arguments.count >= 4 else { fail("Thiếu tham số cửa sổ.") }
let backgroundKey = arguments[0] == "capture-next" || arguments[0] == "capture-previous"
let action = arguments[0] == "capture-next" ? "next" : arguments[0] == "capture-previous" ? "previous" : arguments[0]
let file = arguments[1], filename = arguments[2]
let total = Int(arguments[3]) ?? 0
let stem = (filename as NSString).deletingPathExtension
guard AXIsProcessTrusted() else {
    fail("ACCESSIBILITY_REQUIRED: macOS chưa cho phép bản thử điều khiển cửa sổ. Cần quyền Accessibility cho ứng dụng chạy bản thử; không cần Full Disk Access.")
}
guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: "com.microsoft.Powerpoint").first else {
    fail("Mở Microsoft PowerPoint trước khi thử.")
}
let appElement = AXUIElementCreateApplication(app.processIdentifier)
AXUIElementSetMessagingTimeout(appElement, 2)
func windows() -> [AXUIElement] { attribute(appElement, kAXWindowsAttribute) as? [AXUIElement] ?? [] }
func show() -> AXUIElement? {
    let title = "PowerPoint Slide Show - [\(stem)]"
    for window in windows() {
        if text(window, kAXTitleAttribute) == title { return window }
        if let tab = find(window, matching: { text($0, kAXRoleAttribute) != kAXWindowRole && text($0, kAXTitleAttribute) == title }) {
            if backgroundKey { fail("Chọn tab Reading View của bài thử trước khi chuyển trang ở nền.") }
            // macOS can group Reading View windows into tabs automatically.
            // Select only our named tab, never whichever tab happens to be front.
            AXUIElementPerformAction(tab, kAXPressAction as CFString)
            return window
        }
    }
    return nil
}
func document() -> AXUIElement? {
    windows().first { let title = text($0, kAXTitleAttribute); return title == stem || title == filename }
}
if action == "open", show() == nil {
    if document() == nil {
        NSWorkspace.shared.open(URL(fileURLWithPath: file))
        for _ in 0..<40 {
            if document() != nil { break }
            Thread.sleep(forTimeInterval: 0.1)
        }
    }
    guard let editor = document() else { fail("Chọn bản sao bài thử trong hộp thoại PowerPoint rồi bấm Mở PowerPoint vào khung lại.") }
    app.activate(options: [])
    AXUIElementPerformAction(editor, kAXRaiseAction as CFString)
    guard let reading = find(editor, matching: {
        text($0, kAXRoleAttribute) == kAXRadioButtonRole && text($0, kAXTitleAttribute) == "Reading View"
    }) else { fail("Bấm Reading View trong PowerPoint rồi chọn Căn vào khung.") }
    guard AXUIElementPerformAction(reading, kAXPressAction as CFString) == .success else { fail("Không mở được Reading View.") }
    for _ in 0..<40 {
        if show() != nil { break }
        Thread.sleep(forTimeInterval: 0.1)
    }
}
guard let window = show() else {
    if action == "status" || action == "end" { print("closed"); exit(0) }
    fail("Reading View đã đóng. Bấm Mở PowerPoint vào khung để mở lại.")
}
AXUIElementSetMessagingTimeout(window, 2)
if action == "end" {
    let title = "PowerPoint Slide Show - [\(stem)]"
    if let tab = find(window, matching: { text($0, kAXRoleAttribute) != kAXWindowRole && text($0, kAXTitleAttribute) == title }),
       let closeTab = find(tab, matching: { text($0, kAXRoleAttribute) == kAXButtonRole && (text($0, kAXTitleAttribute).contains("Close") || text($0, kAXDescriptionAttribute).contains("Close")) }) {
        guard AXUIElementPerformAction(closeTab, kAXPressAction as CFString) == .success else { fail("Không đóng được tab Reading View của bài hiện tại.") }
        print("closed"); exit(0)
    }
    if find(window, matching: { text($0, kAXRoleAttribute) == kAXTabGroupRole }) != nil {
        fail("Không xác định được nút đóng tab của bài hiện tại. Đóng đúng tab Reading View bằng tay.")
    }
    guard let close = attribute(window, kAXCloseButtonAttribute) else { fail("Không tìm thấy nút đóng Reading View.") }
    guard AXUIElementPerformAction(close as! AXUIElement, kAXPressAction as CFString) == .success else { fail("Không đóng được Reading View.") }
    print("closed"); exit(0)
}
if action != "status" && !backgroundKey {
    app.activate(options: [])
    AXUIElementPerformAction(window, kAXRaiseAction as CFString)
}
if action == "open" || action == "fit" {
    guard arguments.count == 8, let x = Double(arguments[4]), let y = Double(arguments[5]), let right = Double(arguments[6]), let bottom = Double(arguments[7]) else { fail("Kích thước cửa sổ không hợp lệ.") }
    var size = CGSize(width: right-x, height: bottom-y)
    let dimensions = AXValueCreate(.cgSize, &size)!
    guard AXUIElementSetAttributeValue(window, kAXSizeAttribute as CFString, dimensions) == .success else { fail("Không đổi được kích thước Reading View.") }
    // PowerPoint applies window size asynchronously; wait before positioning to
    // avoid macOS clamping the new position using the previous larger size.
    Thread.sleep(forTimeInterval: 0.2)
    // Reading View enforces its own aspect ratio and window border. Correct
    // small differences so a 4:3 window remains inside the reserved rectangle.
    for _ in 0..<2 {
        guard let actualValue = attribute(window, kAXSizeAttribute) else { break }
        var actual = CGSize.zero
        AXValueGetValue(actualValue as! AXValue, .cgSize, &actual)
        let scale = min((right-x)/actual.width, (bottom-y)/actual.height)
        if scale >= 0.999 { break }
        size.width *= scale; size.height *= scale
        AXUIElementSetAttributeValue(window, kAXSizeAttribute as CFString, AXValueCreate(.cgSize, &size)!)
        Thread.sleep(forTimeInterval: 0.2)
    }
    var actual = size
    if let value = attribute(window, kAXSizeAttribute) { AXValueGetValue(value as! AXValue, .cgSize, &actual) }
    var point = CGPoint(x: x + max(0, (right-x-actual.width)/2), y: y + max(0, (bottom-y-actual.height)/2))
    let position = AXValueCreate(.cgPoint, &point)!
    guard AXUIElementSetAttributeValue(window, kAXPositionAttribute as CFString, position) == .success else { fail("Không căn được cửa sổ. Giữ PowerPoint ở Reading View, cùng Desktop với Chrome.") }
}
func slideNumber() -> Int {
    guard let slide = find(window, matching: { text($0, kAXRoleAttribute) == kAXLayoutAreaRole && text($0, kAXTitleAttribute).hasPrefix("Slide ") }) else { return 0 }
    return Int(text(slide, kAXTitleAttribute).dropFirst(6)) ?? 0
}
let before = slideNumber()
if (action == "next" && before > 0 && before < total) || (action == "previous" && before > 1) {
    let code: CGKeyCode = action == "next" ? 124 : 123
    CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: true)?.postToPid(app.processIdentifier)
    CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: false)?.postToPid(app.processIdentifier)
    Thread.sleep(forTimeInterval: 0.2)
}
Thread.sleep(forTimeInterval: 0.3)
var point = CGPoint.zero, size = CGSize.zero
guard let p = attribute(window, kAXPositionAttribute), let s = attribute(window, kAXSizeAttribute) else { fail("Không đọc được kích thước cửa sổ.") }
AXValueGetValue(p as! AXValue, .cgPoint, &point)
AXValueGetValue(s as! AXValue, .cgSize, &size)
let slide = slideNumber()
guard slide > 0, total >= slide else { fail("Không đọc được trang hiện tại trong Reading View.") }
print("\(Int(point.x))|\(Int(point.y))|\(Int(point.x+size.width))|\(Int(point.y+size.height))|\(slide)|\(total)|false")
