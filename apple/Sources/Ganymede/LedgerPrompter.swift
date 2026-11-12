import DeviceBridge
import Foundation

/// The app's side of ganymede-device's permission ledger (#383): before a
/// cell's permissioned call reaches the system prompt, the person says
/// whether this notebook may use the capability. "Always" and "deny" are
/// kept per notebook (UserDefaults, shared by every window's bridge and
/// Settings) until revoked in Settings › Device.
///
/// The prompt is an action sheet through ganymede-device's
/// `SystemDialogPresenter`: a sheet on the notebook's window on the Mac,
/// an alert-style sheet on the iPad and iPhone. One shows at a time; the
/// rest wait in order.
@MainActor
final class AppLedgerPrompter: LedgerPrompter {
    private let presenter: DialogPresenter
    /// The view whose window the prompt shows on.
    var host: () -> DialogHost?

    private struct Ask {
        let id: Int
        let dialog: Dialog
        let done: (DialogResult) -> Void
    }

    /// The prompt on screen. A class, so a late answer can tell whether
    /// it is still the one showing.
    private final class Showing {
        let id: Int
        var close: Close?
        init(id: Int) { self.id = id }
    }

    private var queue: [Ask] = []
    private var showing: Showing?
    /// A closed prompt is still going away: the next waits for it.
    private var closing = false
    /// Ids for prompts at open, which no call waits on: negative, so they
    /// never meet the bridge's.
    private var nextOpenID = -1

    /// `host`: the view whose window the prompt shows on.
    /// `presenter`: the system's when nil. Made here, not as a default
    /// argument: defaults are evaluated outside the main actor.
    init(presenter: DialogPresenter? = nil, host: @escaping () -> DialogHost?) {
        self.presenter = presenter ?? SystemDialogPresenter()
        self.host = host
    }

    func askPermission(
        _ capability: String, notebook: String, id: Int,
        answer: @escaping @MainActor (LedgerAnswer?) -> Void
    ) {
        let dialog = Dialog.actionSheet(
            title: Self.title(capability, notebook: notebook),
            message: "“Always Allow” and “Don’t Allow” apply to this notebook until you change them in Settings › Device.",
            options: ["Allow Once", "Always Allow", "Don’t Allow"],
            cancel: "Cancel", destructive: 2)
        enqueue(Ask(id: id, dialog: dialog) { result in
            switch result {
            case .option(0): answer(.once)
            case .option(1): answer(.always)
            case .option(2): answer(.deny)
            default: answer(nil)
            }
        })
    }

    /// At open, for a capability the notebook declares
    /// (`metadata.ganymede.device`) and nothing has decided: allow or deny
    /// from now on, or leave it for the first call to ask.
    func askAtOpen(_ capability: String, notebook: String, answer: @escaping @MainActor (LedgerAnswer?) -> Void) {
        let id = nextOpenID
        nextOpenID -= 1
        let dialog = Dialog.actionSheet(
            title: Self.title(capability, notebook: notebook),
            message: "The notebook says it uses this. You can change your answer in Settings › Device.",
            options: ["Allow", "Don’t Allow"],
            cancel: "Not Now", destructive: 1)
        enqueue(Ask(id: id, dialog: dialog) { result in
            switch result {
            case .option(0): answer(.always)
            case .option(1): answer(.deny)
            default: answer(nil)
            }
        })
    }

    func dismissPermission(_ id: Int) {
        if let index = queue.firstIndex(where: { $0.id == id }) {
            queue.remove(at: index)
            return
        }
        guard let current = showing, current.id == id else { return }
        showing = nil
        closing = true
        let done: () -> Void = { [weak self] in
            self?.closing = false
            self?.next()
        }
        if let close = current.close { close(done) } else { done() }
    }

    private func enqueue(_ ask: Ask) {
        queue.append(ask)
        next()
    }

    private func next() {
        guard showing == nil, !closing, !queue.isEmpty else { return }
        let ask = queue.removeFirst()
        let current = Showing(id: ask.id)
        showing = current
        do {
            current.close = try presenter.present(ask.dialog, on: host()) { [weak self] result in
                // A dismissed prompt's late answer is ignored.
                guard let self, self.showing === current else { return }
                self.showing = nil
                ask.done(result)
                self.next()
            }
        } catch {
            // No window to show it on: as if dismissed.
            if showing === current { showing = nil }
            ask.done(.dismissed)
            next()
        }
    }

    /// “Untitled.ipynb” wants to use your location.
    static func title(_ capability: String, notebook: String) -> String {
        let name = URL(fileURLWithPath: notebook).lastPathComponent
        return "“\(name)” wants to use \(describe(capability))"
    }

    /// A capability (a `device` namespace) in words.
    static func describe(_ capability: String) -> String {
        switch capability {
        case "notifications": "notifications"
        case "location": "your location"
        case "motion": "motion and fitness data"
        case "camera": "the camera"
        case "photos": "your photo library"
        case "contacts": "your contacts"
        case "reminders": "your reminders"
        case "calendar": "your calendars"
        case "microphone": "the microphone"
        case "bluetooth": "Bluetooth"
        // Consent to run any of them (ganymede-device#40): say so.
        case "shortcuts": "your Shortcuts (it can run any of them)"
        default: capability
        }
    }
}
