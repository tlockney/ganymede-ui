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
                    .fill(reachability.isReachable(current) ? Color("Ready") : Color.red)
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
