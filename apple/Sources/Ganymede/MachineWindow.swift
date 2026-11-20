import SwiftUI

/// The place switcher (#701): the current place's name with a dot for
/// reachable or offline, and a menu of the places to open. Opening one
/// shows its window; the caller decides how.
struct PlaceMenu: View {
    let entries: [PlaceEntry]
    let current: Place
    let reachability: PlaceReachability
    let pick: (Place) -> Void

    private var currentTitle: String {
        entries.first { $0.place == current }?.title ?? KernelLocations.thisDevice
    }

    var body: some View {
        Menu {
            ForEach(entries) { entry in
                Button {
                    pick(entry.place)
                } label: {
                    let offline = !reachability.isReachable(entry.place)
                    if entry.place == current {
                        Label(entry.title + (offline ? " · offline" : ""), systemImage: "checkmark")
                    } else {
                        Text(entry.title + (offline ? " · offline" : ""))
                    }
                }
            }
        } label: {
            HStack(spacing: 6) {
                Text(currentTitle).fontWeight(.semibold).lineLimit(1)
                Circle()
                    .fill(reachability.isReachable(current) ? Color.green : Color.red)
                    .frame(width: 7, height: 7)
                    .accessibilityHidden(true)
                Image(systemName: "chevron.down").font(.caption2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .menuStyle(.borderlessButton)
        .accessibilityLabel("Place: \(currentTitle), \(reachability.isReachable(current) ? "reachable" : "offline")")
    }
}

#if os(macOS)
/// A window on a connected machine (#701): the page, with its own sidebar
/// and toolbar, loaded from the app's server with `machine=` so it reaches
/// the machine through the mount. None of the app's device bridge, Notebook
/// Access, Shortcuts, editor or link handling is attached: the web view is
/// made for `target.place`, which gates them (`Place.allows`).
struct MachineWindow: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openWindow) private var openWindow
    /// What the window was opened on. The page's own navigation moves it,
    /// through `follow`, so a restored window comes back to the notebook.
    let target: WindowTarget
    let follow: (WindowTarget) -> Void
    @State private var current: WindowTarget?

    private var shown: WindowTarget { current ?? target }
    private var name: String? { shown.place.machineID.flatMap(model.machineName(_:)) }

    var body: some View {
        Group {
            if let url = model.page(for: target) {
                WebView(
                    url: url,
                    onNavigate: { page in
                        // Only this machine's own pages: a link in an output
                        // can't make the window another place's.
                        if let page, let next = WindowTarget(page: page), next.place == target.place {
                            current = next
                            follow(next)
                        }
                    },
                    place: target.place,
                    places: model.places,
                    onOpenPlace: open
                )
            } else if let error = model.error {
                Text(error).foregroundStyle(.secondary).padding()
            } else {
                ProgressView()
            }
        }
        .navigationTitle(shown.displayTitle(machineName: name))
        .navigationSubtitle(name.map { "on \($0)" } ?? "")
        .frame(minWidth: 720, minHeight: 480)
        .task { model.startIfNeeded() }
        .background(WindowReader { WorkspaceTabs.join($0) })
    }

    /// A pick in the page's place switcher: that place's window, a new tab.
    private func open(_ place: Place) {
        switch place {
        case .thisDevice:
            openWindow(value: WindowTarget.folder(model.root))
        case .machine(let id):
            if let target = WindowTarget.machine(id, path: "/", isFolder: true) {
                openWindow(value: target)
            }
        }
    }
}
#endif

#if os(iOS)
/// The iPad's and iPhone's screen on a connected machine (#701): the page
/// with its own sidebar and toolbar, over the scene. It is made for the
/// machine's place, so it gets none of the device bridge or native
/// handlers; its place switcher goes back to this device or to another
/// machine.
struct MachineScreen: View {
    @Environment(AppModel.self) private var model
    let machine: String
    /// A pick in the page's place switcher.
    let switchTo: (Place) -> Void

    var body: some View {
        Group {
            if let target = WindowTarget.machine(machine, path: "/", isFolder: true),
               let url = model.page(for: target) {
                WebView(
                    url: url, place: target.place, places: model.places, onOpenPlace: switchTo)
                    // One page per machine: switching machines loads another.
                    .id(machine)
            } else if let error = model.error {
                Text(error).foregroundStyle(.secondary).padding()
            } else {
                ProgressView()
            }
        }
        .task { model.startIfNeeded() }
    }
}
#endif
