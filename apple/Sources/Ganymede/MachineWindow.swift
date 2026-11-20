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
        entries.first { $0.place == current }?.title ?? Places.deviceName
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
