import AppIntents
import DeviceBridge
import Foundation
import UniformTypeIdentifiers

// "Run Script on Device" for Shortcuts (#434, ganymede-device phase 4.4;
// a spike, off by default): runs a TypeScript or JavaScript file, or a
// notebook's code cells, in the headless runner (#433), with no window
// and no kernel. The Shortcut's text, link and files are `device.input`;
// what the script hands to `device.output()` comes back as text. Runs on
// the Mac, iPad and iPhone, where a kernel can't outlive a suspended app.

struct RunScriptIntent: AppIntent {
    static let title: LocalizedStringResource = "Run Script on Device"
    static let description = IntentDescription(
        """
        Runs a TypeScript or JavaScript file, or a notebook's code cells, on this device with no window, \
        and returns what it hands to device.output(). Experimental: turn it on in Settings › Device.
        """
    )

    /// The Settings switch; off by default while the runner is a spike.
    static let enabledKey = "ganymede.runner.shortcuts"

    @Parameter(title: "Script", supportedContentTypes: RunScriptIntent.scriptTypes)
    var script: IntentFile
    @Parameter(title: "Text", description: "device.input.text")
    var text: String?
    @Parameter(title: "Link", description: "device.input.url")
    var link: URL?
    @Parameter(title: "Files", description: "device.input.files")
    var files: [IntentFile]?
    @Parameter(title: "Time Limit (seconds)", default: 30, inclusiveRange: (1, 60))
    var timeLimit: Int

    static var parameterSummary: some ParameterSummary {
        Summary("Run \(\.$script)") {
            \.$text
            \.$link
            \.$files
            \.$timeLimit
        }
    }

    /// Any file: a `.ts` file's type is MPEG transport stream on Apple's
    /// systems, so the extension decides (`source(data:filename:)`).
    static let scriptTypes: [UTType] = [.data]

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        guard UserDefaults.standard.bool(forKey: Self.enabledKey) else { throw RunScriptError.off }
        guard let engine = ScriptRunner.bundledEngine() else { throw RunScriptError.failed("the runner isn't in this build") }
        let source = try Self.source(data: script.data, filename: script.filename)
        let input = Self.input(text: text, link: link, files: (files ?? []).map { ($0.filename, $0.type, $0.data) })
        let runner = ScriptRunner(
            bridge: Self.bridge,
            notebook: Self.notebookPath(url: script.fileURL, filename: script.filename),
            input: input,
            timeLimit: TimeInterval(timeLimit),
            engine: engine
        )
        let result = await runner.run(source)
        return .result(value: try Self.answer(result))
    }

    /// The bridge runs get: every namespace a notebook's kernel has, with
    /// no prompter, so a permissioned call needs a kept "always".
    @MainActor static let bridge = KernelHost.systemBridge(folders: FolderGrants())

    /// What to run, by the file's extension.
    static func source(data: Data, filename: String) throws -> ScriptSource {
        switch (filename as NSString).pathExtension.lowercased() {
        case "ipynb": return try .notebook(data)
        case let ext:
            guard let text = String(data: data, encoding: .utf8) else { throw RunScriptError.failed("\(filename) isn't UTF-8 text") }
            return .script(text, language: ext == "js" || ext == "mjs" ? "javascript" : "typescript")
        }
    }

    static func input(text: String?, link: URL?, files: [(name: String, type: UTType?, data: Data)]) -> RunInput {
        RunInput(
            text: text,
            url: link,
            files: files.map { RunFile(name: $0.name, type: $0.type?.preferredMIMEType ?? "", data: $0.data) }
        )
    }

    /// The path that keys the ledger, folders and secrets: the file's, or
    /// its name alone when Shortcuts passed a copy with no location.
    static func notebookPath(url: URL?, filename: String) -> String {
        url?.standardizedFileURL.path ?? "shortcuts/\(filename)"
    }

    /// The text the Shortcut gets: `device.output`'s text or link, else
    /// the script's return value. Output files aren't returned yet.
    static func answer(_ result: ScriptResult) throws -> String {
        if let error = result.error { throw RunScriptError.failed(error) }
        return result.output?.text ?? result.output?.url?.absoluteString ?? result.value ?? ""
    }
}

enum RunScriptError: Error, CustomLocalizedStringResourceConvertible, Equatable {
    case off
    case failed(String)

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .off: "Running scripts from Shortcuts is off. Turn it on in Ganymede's Settings › Device."
        case let .failed(why): "The script failed: \(why)"
        }
    }
}
