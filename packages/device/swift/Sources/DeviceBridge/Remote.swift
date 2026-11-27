import WebKit

/// What a window's remote handler is for (#877). This device's own windows
/// take the defaults: their dialogs are their own, and a server kernel's
/// clipboard read needs no prompt on the Mac.
public struct RemoteOptions: Equatable, Sendable {
    /// The machine the page's kernels run on, named in every dialog and
    /// clipboard prompt: "A cell on mini asks to use this device." Nil for a
    /// window of this device, whose dialogs say nothing about where the cell
    /// runs. It is the app's name for the machine (`Remote.title`), never a
    /// name the machine chose.
    public var asker: String?
    /// Whether `clipboard.readText` and `clipboard.readImage` ask first.
    /// A machine's notebook can be written by other people and agents
    /// there, and what a read takes leaves this device for that machine, so
    /// a machine's window turns this on. This device's own windows leave it
    /// off, as its server kernels have always read without asking.
    public var confirmClipboardReads: Bool

    public init(asker: String? = nil, confirmClipboardReads: Bool = false) {
        self.asker = asker
        self.confirmClipboardReads = confirmClipboardReads
    }
}

/// The bridge's second handler, for kernels that aren't in the app
/// (docs/protocol.md, "Over a Jupyter comm"): the notebook page answers a
/// remote kernel's comm (`answerDevice` in src/frontend.ts) and posts the
/// calls here. That page also renders notebook outputs, so this handler
/// takes only the remote subset, the methods that need no permission
/// (docs/plan.md, "The remote subset"), and only from the main frame.
extension DeviceBridge {
    /// The name `webkitForward()` posts to.
    public static let remoteHandlerName = "deviceRemote"

    /// What a remote kernel may call: the methods whose `remote` column in
    /// src/support.ts isn't `no`. test/swift.test.ts checks the two agree.
    public static let remoteMethods: Set<String> = [
        "info", "clipboard.readText", "clipboard.writeText", "clipboard.readImage", "clipboard.writeImage",
        "haptics.impact", "haptics.notification", "haptics.selection", "openURL",
        "ui.alert", "ui.confirm", "ui.prompt", "ui.actionSheet", "ui.pickDate",
        "share", "preview", "files.pick", "files.export", "photos.pick", "sound.play",
    ]

    /// Adds the remote handler to `controller`, in the page's content world.
    /// Only main-frame messages for which `allow` is true reach the bridge.
    /// `allow` has no default: handlers outlive navigation, so the app must
    /// check that the message comes from its own page (origin, web view).
    /// `options` says who is asking, for a machine's window (#877).
    public func registerRemote(
        in controller: WKUserContentController,
        _ options: RemoteOptions = RemoteOptions(),
        allow: @escaping @MainActor (WKScriptMessage) -> Bool
    ) {
        controller.addScriptMessageHandler(
            RemoteHandler(bridge: self, options: options, allow: allow),
            contentWorld: .page, name: Self.remoteHandlerName)
    }

    /// Answers one message from the remote handler, as `respond(to:from:reply:)`
    /// does, but only for the remote subset. Its ids and owners are kept apart
    /// from the kernel page's (both count up from 1), so a cancel from one
    /// page never closes the other's dialog, and a release never stops the
    /// other's sounds. `hello` lists only the remote subset.
    public func respondRemote(
        to body: Any, from host: DialogHost? = nil, options: RemoteOptions = RemoteOptions(),
        reply: @escaping ([String: Any]) -> Void
    ) {
        guard var call = body as? [String: Any] else {
            reply(Self.error("failed", "a device message must be an object"))
            return
        }
        let cancel = call["cancel"] as? Bool == true
        // Every message but a cancel names its owner, so none falls into the
        // kernel page's owner-less bucket (owner 0).
        for key in ["id", "owner"] where call[key] != nil || (key == "owner" && !cancel) {
            // Below the engine range, so a remote message can't name an
            // engine context's calls or owner.
            guard let n = Self.callID(call[key]), n > 0, n < engineBase else {
                reply(Self.error("failed", "a remote message's \(key) must be a positive integer below 2^40"))
                return
            }
            call[key] = -n
        }
        if cancel || call["release"] as? Bool == true {
            reply(handle(call))
            return
        }
        guard let method = call["method"] as? String else {
            reply(Self.error("failed", "a device call needs a method"))
            return
        }
        if method == "hello" {
            var answer = handle(call)
            if var hello = answer["result"] as? [String: Any] {
                hello["capabilities"] = capabilities.filter { Self.remoteMethods.contains($0) }
                answer["result"] = hello
            }
            reply(answer)
            return
        }
        guard Self.remoteMethods.contains(method) else {
            reply(Self.error("unavailable", "\(method) isn't available to a remote kernel"))
            return
        }
        // A machine's kernel may have the clipboard only with the person's
        // say-so each time (#877): what it reads goes to another computer.
        if options.confirmClipboardReads, method == "clipboard.readText" || method == "clipboard.readImage" {
            confirmClipboardRead(method, call: call, asker: options.asker, from: host, reply: reply)
            return
        }
        respond(to: call, from: host, asker: options.asker, reply: reply)
    }

    /// Asks, every time, before a machine's kernel reads this device's
    /// clipboard (#877): Allow goes on with the call, anything else rejects
    /// it `denied`, the code this protocol uses for a person's refusal.
    private func confirmClipboardRead(
        _ method: String, call: [String: Any], asker: String?, from host: DialogHost?,
        reply: @escaping ([String: Any]) -> Void
    ) {
        guard let id = Self.callID(call["id"]) else {
            reply(Self.error("failed", "\(method) needs a numeric id, so it can be cancelled"))
            return
        }
        dialogs.show(.clipboardRead, asker: asker, id: id, on: host) { [weak self] outcome in
            guard let self else { return }
            switch outcome {
            case .answered(_, .confirmed):
                self.respond(to: call, from: host, asker: asker, reply: reply)
            case .answered:
                reply(Self.error("denied", "\(method): this device's clipboard wasn't read"))
            case .cancelled:
                reply(Self.error("cancelled", "\(method) was cancelled"))
            case let .failed(code, message):
                reply(Self.error(code, message))
            }
        }
    }
}

/// The remote handler. Weak, so the content controller, which keeps its
/// handlers, doesn't keep the bridge.
@MainActor
private final class RemoteHandler: NSObject, WKScriptMessageHandlerWithReply {
    weak var bridge: DeviceBridge?
    let options: RemoteOptions
    let allow: @MainActor (WKScriptMessage) -> Bool

    init(bridge: DeviceBridge, options: RemoteOptions, allow: @escaping @MainActor (WKScriptMessage) -> Bool) {
        self.bridge = bridge
        self.options = options
        self.allow = allow
    }

    func userContentController(
        _ controller: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        // Output frames get the page's handlers too; only the page itself
        // may call.
        guard message.frameInfo.isMainFrame, allow(message), let bridge else {
            replyHandler(DeviceBridge.error("unavailable", "device calls are taken from the notebook page only"), nil)
            return
        }
        bridge.respondRemote(to: message.body, from: message.webView, options: options) { replyHandler($0, nil) }
    }
}
