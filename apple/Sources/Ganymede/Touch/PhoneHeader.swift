#if os(iOS)
import SwiftUI

/// The iPhone navigation bar's principal title (#915): display title in
/// `TitleText`, with a compact save/lock note only when there is something to
/// say (`Edited`, `Locked: changed on disk`) or `"on <machine>"` without a
/// notebook.
struct PhoneHeaderTitle: View {
    let title: String
    let header: HeaderStatus?
    let machineName: String?

    var body: some View {
        VStack(spacing: 1) {
            Text(title)
                .font(.headline)
                .foregroundStyle(Color("TitleText"))
                .lineLimit(1)
            if let saveNote = header?.saveNote {
                Text(saveNote)
                    .font(.caption2)
                    .foregroundStyle(header?.needsAttention == true ? AnyShapeStyle(Color.red) : AnyShapeStyle(SidebarCaption()))
                    .lineLimit(1)
            } else if header == nil, let machineName, !machineName.isEmpty {
                Text("on \(machineName)")
                    .font(.caption2)
                    .foregroundStyle(SidebarCaption())
                    .lineLimit(1)
            }
        }
    }
}

/// Subtle navy-to-orange gradient header strip behind the top of the iPhone
/// notebook and journal views (#915), carrying the compact kernel chip on the
/// leading side and the `Notebook | Journal` switcher on the trailing side.
struct PhoneHeaderStrip: View {
    let header: HeaderStatus?
    var page: PageModel
    var place: Place = .thisDevice
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        if page.state.hasNotebook {
            HStack(spacing: 8) {
                if let header {
                    PhoneKernelChip(header: header, page: page, place: place)
                }
                Spacer(minLength: 4)
                JournalViewPicker(page: page)
                    .controlSize(.small)
                    .fixedSize()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(
                LinearGradient(
                    colors: PhoneHeaderPalette.gradientColors(for: colorScheme),
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(Color.primary.opacity(colorScheme == .dark ? 0.14 : 0.09))
                    .frame(height: 0.5)
            }
        }
    }
}

/// Compact iPhone kernel chip (`● TS · Studio Mac`) opening the status menu
/// with full file path, kernel version, kernel switcher, remote warning, and
/// Where Kernels Run (#915).
struct PhoneKernelChip: View {
    let header: HeaderStatus
    var page: PageModel
    var place: Place = .thisDevice
    @Environment(\.colorScheme) private var colorScheme

    private var chip: PhoneKernelChipState { PhoneKernelChipState.make(header: header) }

    var body: some View {
        Menu {
            fileSection
            kernelSection
        } label: {
            HStack(spacing: 5) {
                statusMark
                Text(chip.label)
                    .font(.caption.weight(.medium))
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(PhoneHeaderPalette.subtitleColor(for: colorScheme))
                    .accessibilityHidden(true)
            }
            .foregroundStyle(
                chip.needsAttention
                    ? AnyShapeStyle(Color.red)
                    : AnyShapeStyle(PhoneHeaderPalette.titleColor(for: colorScheme))
            )
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(
                Capsule()
                    .fill(colorScheme == .dark ? Color.white.opacity(0.10) : Color.black.opacity(0.06))
            )
            .overlay(
                Capsule()
                    .strokeBorder(
                        chip.needsAttention
                            ? Color.red.opacity(0.55)
                            : (colorScheme == .dark ? Color.white.opacity(0.14) : Color.black.opacity(0.10)),
                        lineWidth: 0.75
                    )
            )
        }
        .accessibilityLabel(chip.buttonAccessibilityLabel)
        .accessibilityValue(chip.dotAccessibilityLabel)
        .accessibilityHint("Shows the file and the kernel")
    }

    @ViewBuilder
    private var statusMark: some View {
        ZStack {
            switch chip.kind {
            case .idle:
                Circle()
                    .fill(Color("Ready"))
                    .frame(width: 7, height: 7)
            case .working:
                ProgressView()
                    .controlSize(.mini)
                    .tint(Color("Ready"))
            case .stopped:
                Circle()
                    .fill(SidebarCaption())
                    .frame(width: 7, height: 7)
            case .missing:
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.red)
            }
        }
        .frame(width: 10, height: 10)
        .accessibilityLabel(chip.dotAccessibilityLabel)
    }

    @ViewBuilder
    private var fileSection: some View {
        if let path = page.state.path {
            Section("File") {
                Text(path)
                Text(header.save)
            }
        }
    }

    private var kernelSection: some View {
        Section("Kernel") {
            if let version = page.state.kernelVersionLine {
                Text(version)
            }
            ForEach(page.state.kernels, id: \.name) { kernel in
                Button {
                    page.run("change-kernel", arg: kernel.name)
                } label: {
                    if kernel.name == page.state.kernel {
                        Label(kernel.pickerName, systemImage: "checkmark")
                    } else {
                        Text(kernel.pickerName)
                    }
                }
                .accessibilityLabel(kernel.pickerLabel)
            }
            if let line = page.state.notAnswering(machine: machine) {
                Text(line).font(.caption).foregroundStyle(SidebarCaption())
            }
            if place.allows(.kernelLocation), AppModel.shared.kernelLocations.hasRemotes {
                KernelLocationPicker(running: page.state.sessions.count)
                    .pickerStyle(.inline)
            }
        }
    }

    private var machine: String? { place.machineID.flatMap(AppModel.shared.machineName(_:)) }
}

/// Matches the iPhone navigation bar's background to the navy-to-orange header
/// strip's leading tone while a notebook is open so the bar and strip read as
/// one surface (#915).
struct PhoneHeaderBarBackground: ViewModifier {
    var hasNotebook: Bool
    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        content
            .toolbarBackground(
                hasNotebook
                    ? AnyShapeStyle(PhoneHeaderPalette.leadingColor(for: colorScheme))
                    : AnyShapeStyle(.bar),
                for: .navigationBar
            )
            .toolbarBackgroundVisibility(hasNotebook ? .visible : .automatic, for: .navigationBar)
    }
}
#endif
