import SwiftUI
#if os(macOS)
import AppKit
#endif

/// Where kernels run, as a picker for menus and popovers (#473): this
/// device or a remote with a server, the current one checked. The same
/// app-wide setting as Settings › Kernels; switching restarts the server.
struct KernelLocationPicker: View {
    var model = AppModel.shared
    /// Kernels running now, which a switch shuts down; nil when unknown
    /// (no notebook window is in front to say).
    var running: Int?
    var title = "Run Kernels On"

    var body: some View {
        let locations = model.kernelLocations
        Picker(title, selection: Binding(
            get: { locations.selected },
            set: { chooseKernelLocation($0, model: model, running: running) }
        )) {
            ForEach(locations.choices) { choice in
                Text(choice.title).tag(choice.id)
            }
        }
    }
}

/// Runs kernels on `id`'s server, or this device when nil. On the Mac it
/// asks first while kernels run, since they are shut down, and when it
/// can't tell whether any do.
@MainActor
func chooseKernelLocation(_ id: UUID?, model: AppModel, running: Int?) {
    guard id != model.kernelRemoteID else { return }
    #if os(macOS)
    if running != 0 {
        let title = id.flatMap { model.remote($0)?.title } ?? KernelLocations.thisDevice
        let alert = NSAlert()
        alert.messageText = "Run kernels on \(title)?"
        alert.informativeText = switch running {
        case 1?: "The running kernel is shut down."
        case let count?: "The \(count) running kernels are shut down."
        case nil: "Running kernels are shut down."
        }
        alert.addButton(withTitle: "Switch")
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
    }
    #endif
    model.useForKernels(id)
}
