import Foundation
import Observation
#if os(iOS)
import SwiftUI
#endif

/// What happened when saving an open notebook before switching places or
/// restarting the kernel server (#808).
enum SwitchSaveOutcome: Equatable {
    case saved
    case failed
    case timedOut
}

/// What the person chose after a pre-switch save failed or timed out (#808).
enum UnsavedSwitchDecision: Equatable {
    case keepEditing
    case downloadCopy
    case switchWithoutSaving
}

/// An unsaved notebook whose save blocked a place or kernel switch (#808).
struct BlockedSwitchPrompt: Identifiable, Equatable {
    let id: UUID
    let attempt: Int
    let notebookName: String
    let timedOut: Bool

    var title: String {
        "Save “\(notebookName)” before switching?"
    }

    var message: String {
        if timedOut {
            return "The server didn’t answer in time. Switching closes it, and its unsaved edits would be lost. Keep editing to try again."
        }
        return "Couldn’t save “\(notebookName)”. Switching closes it, and its unsaved edits would be lost. Keep editing to see why and try again."
    }
}

/// One open notebook to save before a switch (#808).
struct SwitchSaveTarget {
    let name: @MainActor () -> String
    let save: @MainActor () async -> SwitchSaveOutcome
    let download: @MainActor () async -> Void
}

/// Coordinates saving open notebooks before retiring a WebView (`switchPlace`)
/// or restarting the local kernel server (`useForKernels`), and presents the
/// three-way Keep Editing / Download a Copy / Switch Without Saving choice on
/// failure or timeout (#808).
@MainActor
@Observable
final class SwitchSaveCoordinator {
    private(set) var prompt: BlockedSwitchPrompt?

    @ObservationIgnored private var attempt = 0
    @ObservationIgnored private var pendingContinuation: CheckedContinuation<UnsavedSwitchDecision, Never>?
    @ObservationIgnored private let afterAlertDismiss: @MainActor () async -> Void

    init(
        afterAlertDismiss: @escaping @MainActor () async -> Void = {
            try? await Task.sleep(for: .milliseconds(350))
        }
    ) {
        self.afterAlertDismiss = afterAlertDismiss
    }

    /// Races `save` against `timeout`, cancelling the losing task as soon as
    /// the winner returns.
    static func raceSave(
        timeout: Duration = .seconds(15),
        save: @escaping @MainActor @Sendable () async -> Bool
    ) async -> SwitchSaveOutcome {
        await withTaskGroup(of: SwitchSaveOutcome.self) { group in
            group.addTask { @MainActor in
                await save() ? .saved : .failed
            }
            group.addTask {
                try? await Task.sleep(for: timeout)
                return .timedOut
            }
            let first = await group.next() ?? .failed
            group.cancelAll()
            return first
        }
    }

    /// Saves `targets` in order before running `commit`. If saving fails or
    /// times out on a target, prompts the user until they choose Keep Editing
    /// (returns false without calling `commit`) or Switch Without Saving
    /// (calls `commit` and returns true). Download a Copy downloads that
    /// target's notebook and re-presents the prompt.
    @discardableResult
    func guardSwitch(
        targets: [SwitchSaveTarget],
        askChoice: (@MainActor (BlockedSwitchPrompt) async -> UnsavedSwitchDecision)? = nil,
        onCancel: @MainActor () -> Void = {},
        commit: @MainActor () -> Void
    ) async -> Bool {
        attempt += 1
        let myAttempt = attempt
        prompt = nil
        resumePending(with: .keepEditing)

        var blockedTarget: SwitchSaveTarget?
        var outcome: SwitchSaveOutcome = .saved
        for target in targets {
            let result = await target.save()
            guard myAttempt == attempt else { return false }
            if result != .saved {
                blockedTarget = target
                outcome = result
                break
            }
        }

        if outcome == .saved {
            commit()
            return true
        }

        while myAttempt == attempt {
            let failing = blockedTarget
            let current = BlockedSwitchPrompt(
                id: UUID(),
                attempt: myAttempt,
                notebookName: failing?.name() ?? "the notebook",
                timedOut: outcome == .timedOut
            )
            let decision: UnsavedSwitchDecision
            if let askChoice {
                decision = await askChoice(current)
            } else {
                decision = await withCheckedContinuation { continuation in
                    self.pendingContinuation = continuation
                    self.prompt = current
                }
            }
            guard myAttempt == attempt else { return false }

            switch decision {
            case .keepEditing:
                attempt += 1
                onCancel()
                return false
            case .downloadCopy:
                if askChoice == nil {
                    await afterAlertDismiss()
                }
                guard myAttempt == attempt else { return false }
                await failing?.download()
            case .switchWithoutSaving:
                commit()
                return true
            }
        }
        return false
    }

    /// Resolves a single-target switch conveniently.
    @discardableResult
    func guardSwitch(
        notebookName: @escaping @MainActor () -> String,
        save: @escaping @MainActor () async -> SwitchSaveOutcome,
        download: @escaping @MainActor () async -> Void,
        askChoice: (@MainActor (BlockedSwitchPrompt) async -> UnsavedSwitchDecision)? = nil,
        onCancel: @escaping @MainActor () -> Void = {},
        commit: @MainActor () -> Void
    ) async -> Bool {
        await guardSwitch(
            targets: [SwitchSaveTarget(name: notebookName, save: save, download: download)],
            askChoice: askChoice,
            onCancel: onCancel,
            commit: commit
        )
    }

    /// Resolves the currently displayed prompt with `decision`.
    func decide(_ decision: UnsavedSwitchDecision, promptID: UUID) {
        guard prompt?.id == promptID else { return }
        prompt = nil
        resumePending(with: decision)
    }

    /// Called when SwiftUI dismisses the alert outside the explicit button actions.
    func dismissed(promptID: UUID) {
        guard prompt?.id == promptID else { return }
        decide(.keepEditing, promptID: promptID)
    }

    /// Cancels any in-flight guard or displayed prompt without committing.
    func cancel() {
        attempt += 1
        prompt = nil
        resumePending(with: .keepEditing)
    }

    private func resumePending(with decision: UnsavedSwitchDecision) {
        let continuation = pendingContinuation
        pendingContinuation = nil
        continuation?.resume(returning: decision)
    }
}

#if os(iOS)
/// Presents the Keep Editing / Download a Copy / Switch Without Saving alert
/// on whichever window, sheet, or cover currently has `isEnabled` true (#808).
struct SwitchSaveAlert: ViewModifier {
    var coordinator: SwitchSaveCoordinator
    var isEnabled = true

    func body(content: Content) -> some View {
        content.alert(
            coordinator.prompt?.title ?? "",
            isPresented: Binding(
                get: { isEnabled && coordinator.prompt != nil },
                set: { [shown = coordinator.prompt?.id, enabled = isEnabled] in
                    if enabled, !$0, let shown { coordinator.dismissed(promptID: shown) }
                }
            ),
            presenting: isEnabled ? coordinator.prompt : nil
        ) { prompt in
            Button("Switch Without Saving", role: .destructive) {
                coordinator.decide(.switchWithoutSaving, promptID: prompt.id)
            }
            Button("Download a Copy") {
                coordinator.decide(.downloadCopy, promptID: prompt.id)
            }
            Button("Keep Editing", role: .cancel) {
                coordinator.decide(.keepEditing, promptID: prompt.id)
            }
        } message: { prompt in
            Text(prompt.message)
        }
    }
}
#endif
