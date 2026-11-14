#if os(macOS)
import Foundation

/// Moves a live terminal between a notebook window's bottom panel and a
/// tab of its own (#248): the session (its transport) and the screen (its
/// SwiftTerm view) go with it, so the shell keeps running and the
/// scrollback stays.
///
/// Each terminal on show lists its transport here by its id (the panel
/// terminal's id, or its window's `TerminalRequest` id). A move marks the
/// id as leaving and removes the terminal from where it was. Its view
/// then parks here instead of closing the transport, and the new place,
/// asked for once it has parked, takes the transport and view back by
/// the same id. A parked terminal no place takes in `timeout` is closed.
/// The view and coordinator are kept as `AnyObject`, so this compiles,
/// and is tested, without SwiftTerm.
@MainActor
final class TerminalHandoff {
    static let shared = TerminalHandoff()

    /// How long a parked terminal waits for its new place.
    var timeout: TimeInterval = 10

    private struct Live {
        var target: TerminalTarget
        var transport: TerminalTransport
        var title: String
    }

    private struct Parked {
        var view: AnyObject
        var coordinator: AnyObject
        /// Ends the session and frees the view, if no place takes it.
        var close: @MainActor () -> Void
    }

    private var live: [UUID: Live] = [:]
    private var leaving: Set<UUID> = []
    private var parked: [UUID: Parked] = [:]
    /// Waiting for a leaving terminal to park.
    private var onParked: [UUID: [@MainActor () -> Void]] = [:]
    /// Each move under way, so a lapse is never another move's.
    private var moves: [UUID: UUID] = [:]

    /// `id`'s terminal is on show with `transport`.
    func register(_ id: UUID, target: TerminalTarget, transport: TerminalTransport, title: String) {
        live[id] = Live(target: target, transport: transport, title: title)
    }

    /// `id`'s terminal is gone. A leaving one stays listed for its new place.
    func unregister(_ id: UUID) {
        guard !leaving.contains(id) else { return }
        live[id] = nil
    }

    /// Whether `id` names a terminal on show that can move.
    func canMove(_ id: UUID) -> Bool {
        live[id] != nil && !leaving.contains(id)
    }

    /// Starts moving `id`'s terminal; the caller then removes it from where
    /// it is. `arrive` runs once its view has parked, to show it in its
    /// new place. False, and nothing happens, if it can't move.
    @discardableResult
    func move(_ id: UUID, arrive: @escaping @MainActor () -> Void) -> Bool {
        guard canMove(id) else { return false }
        leaving.insert(id)
        onParked[id, default: []].append(arrive)
        let move = UUID()
        moves[id] = move
        // A view that never leaves its place keeps its session there.
        DispatchQueue.main.asyncAfter(deadline: .now() + timeout) { @MainActor [weak self] in
            guard let self, self.moves[id] == move, self.parked[id] == nil else { return }
            self.leaving.remove(id)
            self.onParked[id] = nil
            self.moves[id] = nil
        }
        return true
    }

    /// Whether `id`'s view should park rather than close its transport.
    func isLeaving(_ id: UUID) -> Bool {
        leaving.contains(id)
    }

    /// `id`'s view has left its place; it waits here for the new one.
    func park(_ id: UUID, view: AnyObject, coordinator: AnyObject, close: @escaping @MainActor () -> Void) {
        parked[id] = Parked(view: view, coordinator: coordinator, close: close)
        for arrive in onParked.removeValue(forKey: id) ?? [] { arrive() }
        DispatchQueue.main.asyncAfter(deadline: .now() + timeout) { @MainActor [weak self] in
            self?.expire(id, view: view)
        }
    }

    /// The transport and title of a terminal arriving as `id`, or nil when
    /// none is on its way.
    func arriving(_ id: UUID) -> (transport: TerminalTransport, title: String)? {
        guard leaving.contains(id), let entry = live[id] else { return nil }
        return (entry.transport, entry.title)
    }

    /// The parked coordinator for `id`, which keeps its transport's
    /// callbacks; nil when none is parked.
    func coordinator(_ id: UUID) -> AnyObject? {
        parked[id]?.coordinator
    }

    /// Takes `id`'s parked view for its new place, which ends the move.
    func takeView(_ id: UUID) -> AnyObject? {
        guard let entry = parked.removeValue(forKey: id) else { return nil }
        leaving.remove(id)
        moves[id] = nil
        return entry.view
    }

    /// The move ended without a view, as when the new place made its own.
    func arrived(_ id: UUID) {
        leaving.remove(id)
        parked[id] = nil
        onParked[id] = nil
        moves[id] = nil
    }

    /// Closes a parked terminal no place took.
    private func expire(_ id: UUID, view: AnyObject) {
        guard let entry = parked[id], entry.view === view else { return }
        parked[id] = nil
        leaving.remove(id)
        live[id] = nil
        onParked[id] = nil
        moves[id] = nil
        entry.close()
    }
}
#endif
