import DeviceBridge
import SwiftUI
import UniformTypeIdentifiers
#if os(macOS)
import AppKit
#else
import UIKit
#endif

// The share extension (#435, ganymede-device phase 4.3; a spike, built
// but not embedded in the apps yet): lists the notebooks offered to the
// share sheet, runs the chosen one in the headless runner (#433) with
// what was shared as `device.input`, and hands `device.output` back to
// the host app. Headless: no prompts, so a permissioned call needs a
// kept "always", and a shorter time limit than Shortcuts', since the
// system ends an extension that holds the sheet open.

@MainActor
final class ShareModel: ObservableObject {
    enum Phase: Equatable {
        case choosing
        case running(String)
        case done(ScriptResult)
    }

    /// Extensions get far less memory than apps, and the sheet blocks
    /// its host while it's open.
    static let timeLimit: TimeInterval = 20

    @Published var phase = Phase.choosing
    let notebooks: [ShareNotebook]
    private let store: ShareNotebooks?
    private let providers: [NSItemProvider]
    /// The items to hand back, or nil to cancel.
    private let finish: ([NSExtensionItem]?) -> Void

    init(providers: [NSItemProvider], finish: @escaping ([NSExtensionItem]?) -> Void) {
        store = ShareNotebooks.shared()
        notebooks = store?.list() ?? []
        self.providers = providers
        self.finish = finish
    }

    func run(_ notebook: ShareNotebook) async {
        // A second tap while the first run starts.
        guard phase == .choosing else { return }
        phase = .running(notebook.name)
        guard let store, let engine = ScriptRunner.bundledEngine() else {
            phase = .done(ScriptResult(error: "the runner isn't in this build"))
            return
        }
        do {
            let source = try ScriptSource.notebook(store.data(for: notebook))
            let input = ShareInput.input(await ShareInput.load(providers))
            let runner = ScriptRunner(bridge: Self.bridge, notebook: notebook.path, input: input, timeLimit: Self.timeLimit, engine: engine)
            phase = .done(await runner.run(source))
        } catch {
            phase = .done(ScriptResult(error: "\(error)"))
        }
    }

    /// Hands back the output, or the return value as text as Shortcuts'
    /// action does, or nothing; a failed run hands back nothing too.
    func done() {
        guard case let .done(result) = phase, result.error == nil else { return finish(nil) }
        finish([Self.item(result.output ?? RunOutput(text: result.value))])
    }

    func cancel() { finish(nil) }

    /// The output as one item for the host: its text, link and files.
    static func item(_ output: RunOutput) -> NSExtensionItem {
        var attachments: [NSItemProvider] = []
        if let text = output.text { attachments.append(NSItemProvider(object: text as NSString)) }
        if let url = output.url { attachments.append(NSItemProvider(object: url as NSURL)) }
        for file in output.files {
            let type = UTType(mimeType: file.type) ?? UTType(filenameExtension: (file.name as NSString).pathExtension) ?? .data
            let provider = NSItemProvider(item: file.data as NSData, typeIdentifier: type.identifier)
            provider.suggestedName = file.name
            attachments.append(provider)
        }
        let item = NSExtensionItem()
        item.attachments = attachments
        return item
    }

    /// The namespaces an extension can use without the app: the ledger,
    /// shared through the App Group, and the permissioned ones that need
    /// no window. No notifications, folders or host events.
    static let bridge: DeviceBridge = {
        let store: LedgerStore? = AppGroup.defaults().map { UserDefaultsLedgerStore(defaults: $0) }
        let bridge = DeviceBridge(ledger: PermissionLedger(store: store))
        bridge.addLocation()
        bridge.addMotion()
        bridge.addContacts()
        bridge.addReminders()
        return bridge
    }()
}

struct ShareView: View {
    @ObservedObject var model: ShareModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            switch model.phase {
            case .choosing:
                Text("Run a Notebook").font(.headline)
                if model.notebooks.isEmpty {
                    Text("No notebooks are offered to the share sheet yet.").foregroundStyle(.secondary)
                } else {
                    List(model.notebooks) { notebook in
                        Button(notebook.name) { Task { await model.run(notebook) } }
                    }
                }
                HStack {
                    Spacer()
                    Button("Cancel", role: .cancel) { model.cancel() }
                }
            case let .running(name):
                ProgressView("Running \(name)…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case let .done(result):
                ScrollView {
                    Text(Self.summary(result))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                HStack {
                    Spacer()
                    Button("Done") { model.done() }.keyboardShortcut(.defaultAction)
                }
            }
        }
        .padding()
        .frame(minWidth: 320, minHeight: 240)
    }

    static func summary(_ result: ScriptResult) -> String {
        if let error = result.error { return "The notebook failed: \(error)" }
        if let output = result.output {
            var parts = [output.text, output.url?.absoluteString].compactMap { $0 }
            if !output.files.isEmpty { parts.append(output.files.map(\.name).joined(separator: ", ")) }
            return parts.joined(separator: "\n")
        }
        return result.value ?? "The notebook finished with no output."
    }
}

#if os(macOS)
final class ShareViewController: NSViewController {
    override var nibName: NSNib.Name? { nil }

    override func loadView() {
        let context = extensionContext
        let providers = (context?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        let model = ShareModel(providers: providers) { items in
            if let items { context?.completeRequest(returningItems: items) } else { context?.cancelRequest(withError: CocoaError(.userCancelled)) }
        }
        view = NSHostingView(rootView: ShareView(model: model))
    }
}
#else
final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        let context = extensionContext
        let providers = (context?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        let model = ShareModel(providers: providers) { items in
            if let items { context?.completeRequest(returningItems: items) } else { context?.cancelRequest(withError: CocoaError(.userCancelled)) }
        }
        let host = UIHostingController(rootView: ShareView(model: model))
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
    }
}
#endif
