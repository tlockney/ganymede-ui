import SwiftUI

/// The place switcher (#701): the current place's name with a dot for
/// reachable or offline, and a menu of the places to open. Opening one
/// shows its window; the caller decides how. A machine the app verified is
/// this Mac's own server wears a "This Mac" badge (#883) beside the
/// switcher's name, and " — This Mac" in the menu, where a menu item is its
/// title alone: it is listed with the machines, and its windows are this
/// Mac's place.
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
                    row(entry)
                }
            }
        } label: {
            HStack(spacing: 6) {
                Text(currentTitle).fontWeight(.semibold).lineLimit(1)
                if current.isThisMac { ThisMacBadge() }
                Circle()
                    .fill(reachability.isReachable(current) ? Color("Ready") : Color.red)
                    .frame(width: 7, height: 7)
                    .accessibilityHidden(true)
                Image(systemName: "chevron.down").font(.caption2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .menuStyle(.borderlessButton)
        .accessibilityLabel(
            "Place: \(currentTitle)\(current.isThisMac ? ", this Mac's own server" : ""), "
                + "\(reachability.isReachable(current) ? "reachable" : "offline")")
    }

    /// One place in the menu: its name, whether it answers, and whether it
    /// is this Mac's own (#883). An `NSMenu` flattens an item to its title,
    /// so the badge's capsule would not show there: the title says it.
    private func row(_ entry: PlaceEntry) -> some View {
        let offline = !reachability.isReachable(entry.place)
        let own = entry.place.isThisMac ? " — This Mac" : ""
        return HStack(spacing: 6) {
            if entry.place == current { Image(systemName: "checkmark") }
            Text(entry.title + own + (offline ? " · offline" : ""))
        }
    }
}

/// The badge a machine that is this Mac's own server wears (#883).
struct ThisMacBadge: View {
    var body: some View {
        Text("This Mac")
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 5)
            .padding(.vertical, 1)
            .background(Capsule().fill(Color.primary.opacity(0.1)))
            .foregroundStyle(.secondary)
    }
}
