import AppKit
import WebKit
import Security

@main
final class CommonsSuite: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var child: Process?
    var input: FileHandle?
    var buffer = Data()
    var origin: URL?
    var token = ""
    var quitting = false
    let service = "org.commons-suite.desktop.session"
    let defaults = UserDefaults.standard

    static func main() {
        let app = NSApplication.shared
        let delegate = CommonsSuite()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        app.run()
        withExtendedLifetime(delegate) {}
    }
    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu()
        let item = NSMenuItem(); menu.addItem(item)
        let appMenu = NSMenu(); item.submenu = appMenu
        appMenu.addItem(withTitle: "About Commons Suite", action: #selector(about), keyEquivalent: "")
        let remember = appMenu.addItem(withTitle: "Remember Sign-in in Keychain", action: #selector(toggleRemember(_:)), keyEquivalent: "")
        remember.state = defaults.bool(forKey: "rememberSession") ? .on : .off
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Commons Suite", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let edit = NSMenuItem(); menu.addItem(edit); edit.submenu = NSMenu(title: "Edit")
        for (title, selector, key) in [("Undo", "undo:", "z"), ("Redo", "redo:", "Z"), ("Cut", "cut:", "x"), ("Copy", "copy:", "c"), ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")] {
            edit.submenu?.addItem(withTitle: title, action: Selector(selector), keyEquivalent: key)
        }
        let help = NSMenuItem(); menu.addItem(help); help.submenu = NSMenu(title: "Help")
        help.submenu?.addItem(withTitle: "Show Workspace Folder", action: #selector(showWorkspace), keyEquivalent: "")
        NSApp.mainMenu = menu
        let configuration = WKWebViewConfiguration()
        // Ephemeral browser storage; optional session restoration uses the macOS Keychain.
        configuration.websiteDataStore = .nonPersistent()
        web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = self; web.uiDelegate = self
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1180, height: 800), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.delegate = self; window.title = "Commons Suite"; window.contentView = web
        window.minSize = NSSize(width: 800, height: 600)
        window.center(); window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        web.loadHTMLString("<html><body style='font:24px system-ui;padding:60px;color:#155448'>Opening Commons Suite…</body></html>", baseURL: nil)
        launchBackend()
    }
    var workspace: URL {
        // A separately identified QA bundle can isolate state without changing the user's workspace.
        if Bundle.main.bundleIdentifier?.hasSuffix(".test") == true, let path = Bundle.main.object(forInfoDictionaryKey: "CommonsTestWorkspace") as? String { return URL(fileURLWithPath: path) }
        // Test builds can isolate state without changing the user's workspace.
        if let path = ProcessInfo.processInfo.environment["COMMONS_TEST_DATA_DIR"] { return URL(fileURLWithPath: path) }
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Commons Suite", isDirectory: true)
    }
    func launchBackend() {
        do {
            let resources = Bundle.main.resourceURL!
            var bytes = [UInt8](repeating: 0, count: 32)
            guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw NSError(domain: "Commons", code: 1) }
            token = bytes.map { String(format: "%02x", $0) }.joined()
            let process = Process(); child = process
            process.executableURL = resources.appendingPathComponent("runtime/bin/node")
            process.arguments = [resources.appendingPathComponent("app/desktop/entry.mjs").path]
            process.currentDirectoryURL = resources.appendingPathComponent("app")
            // Deliberately exclude development environment, NODE_OPTIONS, and credentials.
            process.environment = ["PATH": "/usr/bin:/bin", "HOME": NSHomeDirectory(), "TMPDIR": NSTemporaryDirectory()]
            let stdin = Pipe(), stdout = Pipe(), stderr = Pipe()
            process.standardInput = stdin; process.standardOutput = stdout; process.standardError = stderr
            input = stdin.fileHandleForWriting
            // Never log backend output: it may contain local filenames or account details.
            stderr.fileHandleForReading.readabilityHandler = { handle in _ = handle.availableData }
            stdout.fileHandleForReading.readabilityHandler = { [weak self] handle in
                let data = handle.availableData
                guard !data.isEmpty else { handle.readabilityHandler = nil; return }
                DispatchQueue.main.async { self?.receive(data) }
            }
            process.terminationHandler = { [weak self] _ in DispatchQueue.main.async {
                guard let self = self, !self.quitting else { return }
                self.fail("The workspace service stopped. Quit and reopen Commons Suite. Your saved files remain in the workspace folder.")
            } }
            try process.run()
            send(["dataDir": workspace.path, "token": token])
        } catch { fail("Commons Suite could not start its bundled service. \(error.localizedDescription)") }
    }
    func send(_ object: [String: String]) {
        guard let data = try? JSONSerialization.data(withJSONObject: object) else { return }
        do { try input?.write(contentsOf: data + Data([10])) } catch { fail("Could not communicate with the workspace service.") }
    }
    func receive(_ data: Data) {
        buffer.append(data)
        if buffer.count > 1_000_000 { fail("Unexpected workspace service response."); return }
        while let newline = buffer.firstIndex(of: 10) {
            let line = buffer.prefix(upTo: newline); buffer.removeSubrange(...newline)
            guard let message = try? JSONSerialization.jsonObject(with: line) as? [String: String] else { continue }
            if message["type"] == "setup" { setup() }
            if message["type"] == "ready", let value = message["url"], let url = URL(string: value), url.host == "127.0.0.1" { ready(url) }
        }
    }
    func setup() {
        let alert = NSAlert(); alert.messageText = "Create your private workspace"
        alert.informativeText = "Choose an email and a password of at least 12 characters. Files stay on this Mac. This account is separate from the earlier browser demo."
        let form = NSStackView(frame: NSRect(x: 0, y: 0, width: 360, height: 110)); form.orientation = .vertical; form.alignment = .leading; form.spacing = 8
        let email = NSTextField(); email.placeholderString = "Email"; email.setAccessibilityLabel("Workspace email")
        let password = NSSecureTextField(); password.placeholderString = "Password (12+ characters)"; password.setAccessibilityLabel("Workspace password")
        let confirm = NSSecureTextField(); confirm.placeholderString = "Confirm password"; confirm.setAccessibilityLabel("Confirm workspace password")
        for field in [email, password, confirm] { field.frame.size = NSSize(width: 360, height: 26); field.widthAnchor.constraint(equalToConstant: 360).isActive = true; form.addArrangedSubview(field) }
        alert.accessoryView = form; alert.addButton(withTitle: "Create Workspace"); alert.addButton(withTitle: "Cancel")
        while true {
            guard alert.runModal() == .alertFirstButtonReturn else { NSApp.terminate(nil); return }
            let address = email.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
            if address.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) != nil && password.stringValue.count >= 12 && password.stringValue.utf16.count <= 256 && password.stringValue == confirm.stringValue {
                send(["email": address, "password": password.stringValue]); password.stringValue = ""; confirm.stringValue = ""; return
            }
            alert.informativeText = "Enter a valid email. Both passwords must match and contain at least 12 characters."
        }
    }
    func ready(_ url: URL) {
        origin = url
        let cookies = web.configuration.websiteDataStore.httpCookieStore
        let capability = HTTPCookie(properties: [.name: "desktop", .value: token, .domain: "127.0.0.1", .path: "/", .sameSitePolicy: "Strict", .init("HttpOnly"): "TRUE"])!
        cookies.setCookie(capability) { [weak self] in
            guard let self = self else { return }
            if self.defaults.bool(forKey: "rememberSession"), let session = self.readSession(), let cookie = HTTPCookie(properties: [.name: "session", .value: session, .domain: "127.0.0.1", .path: "/", .sameSitePolicy: "Strict", .init("HttpOnly"): "TRUE"]) {
                cookies.setCookie(cookie) { self.web.load(URLRequest(url: url)) }
            } else { self.web.load(URLRequest(url: url)) }
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if url.scheme == "about" || (url.scheme == origin?.scheme && url.host == origin?.host && url.port == origin?.port) {
            decisionHandler(action.shouldPerformDownload ? .download : .allow)
        } else {
            if action.navigationType == .linkActivated && ["https", "http"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
            decisionHandler(.cancel)
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if let http = response.response as? HTTPURLResponse, http.value(forHTTPHeaderField: "Content-Disposition")?.lowercased().contains("attachment") == true { decisionHandler(.download) }
        else { decisionHandler(response.canShowMIMEType ? .allow : .download) }
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel(); panel.nameFieldStringValue = URL(fileURLWithPath: suggestedFilename).lastPathComponent
        panel.beginSheetModal(for: window) { result in completionHandler(result == .OK ? panel.url : nil) }
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) { fail("Export could not be saved: \(error.localizedDescription)") }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel(); panel.allowsMultipleSelection = parameters.allowsMultipleSelection; panel.canChooseDirectories = false
        panel.beginSheetModal(for: window) { result in completionHandler(result == .OK ? panel.urls : nil) }
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert(); alert.messageText = message; alert.addButton(withTitle: "Continue"); alert.addButton(withTitle: "Cancel"); completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert(); alert.messageText = message; alert.runModal(); completionHandler()
    }
    func fail(_ message: String) { let alert = NSAlert(); alert.messageText = "Commons Suite"; alert.informativeText = message; alert.runModal() }
    @objc func about() { let alert = NSAlert(); alert.messageText = "Commons Suite — Desktop Preview"; alert.informativeText = "Free, Apache-2.0 open-source productivity tools. Early preview; limited Office compatibility. Local workspace: \(workspace.path)\n\nDependency and Node.js licenses are included in Contents/Resources/licenses. This build is not notarized."; alert.runModal() }
    @objc func showWorkspace() { NSWorkspace.shared.open(workspace) }
    @objc func toggleRemember(_ sender: NSMenuItem) { let enabled = sender.state != .on; sender.state = enabled ? .on : .off; defaults.set(enabled, forKey: "rememberSession"); if enabled { saveSession() } else { deleteSession() } }
    func deleteSession() { SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: workspace.path] as CFDictionary) }
    func readSession() -> String? {
        var result: CFTypeRef?
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: workspace.path, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    func saveSession(_ completion: @escaping () -> Void = {}) {
        web.configuration.websiteDataStore.httpCookieStore.getAllCookies { cookies in
            self.deleteSession()
            if let value = cookies.first(where: { $0.name == "session" && $0.domain == "127.0.0.1" })?.value {
                let entry: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: self.service, kSecAttrAccount as String: self.workspace.path, kSecValueData as String: Data(value.utf8), kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
                if SecItemAdd(entry as CFDictionary, nil) != errSecSuccess { self.fail("macOS could not remember this sign-in. You can still sign in normally next time.") }
            }
            completion()
        }
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool { NSApp.terminate(nil); return false }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if quitting { return .terminateNow }
        let alert = NSAlert(); alert.messageText = "Quit Commons Suite?"; alert.informativeText = "Save spreadsheet and presentation changes before quitting. Documents sync automatically while connected."; alert.addButton(withTitle: "Quit"); alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return .terminateCancel }
        quitting = true
        let finish = { self.child?.terminate(); NSApp.reply(toApplicationShouldTerminate: true) }
        if defaults.bool(forKey: "rememberSession") { saveSession(finish) } else { finish() }
        return .terminateLater
    }
    func applicationWillTerminate(_ notification: Notification) { quitting = true; child?.terminate() }
}
