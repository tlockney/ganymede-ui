#if os(iOS)
import SwiftUI

/// The redesigned iPad navigation bar (#914, matching `E-Touch.png` and
/// `E-Touch2.png` left):
/// - Full width (`>= 600pt`): display title (`TitleText`) + kernel chip
///   (`dot · language · runs on`), `Notebook | Journal`, orange Run capsule
///   (Run + Run menu + Interrupt), Share, and More (`⋯`) holding notebook and
///   workspace actions.
/// - Narrow Split View (`< 600pt`): display title + compact kernel status dot
///   (VoiceOver still reads full label; Run sits inside its menu),
///   `Notebook | Journal`, and More (`⋯`) with Share + workspace actions.
struct IPadRedesignedToolbar: ToolbarContent {
    let width: CGFloat
    let title: String
    let header: HeaderStatus?
    let machineName: String?
    var page: PageModel
    var place: Place
    var model: AppModel
    var newTerminal: TerminalTarget?
    var panelShown: Bool
    var mainFills: Bool
    var onRename: () -> Void
    var onOpenTerminal: (TerminalRequest) -> Void
    var onTogglePanel: () -> Void
    var onToggleMainFill: () -> Void
    var onOpenSettings: () -> Void
    var onOpenFolder: () -> Void

    private var isCompact: Bool { IPadLayout.isNarrowSplitView(width: width) }

    var body: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            HStack(spacing: 10) {
                titleStack
                if let header {
                    IPadKernelChipMenu(
                        header: header,
                        page: page,
                        place: place,
                        compact: isCompact
                    )
                }
            }
        }

        // Keeps the centered system title slot clear so the leading display
        // title is not duplicated while `.navigationTitle(title)` stays set
        // for the window switcher and VoiceOver.
        ToolbarItem(placement: .principal) {
            Color.clear
                .frame(width: 0, height: 0)
                .accessibilityHidden(true)
        }

        ToolbarItemGroup(placement: .topBarTrailing) {
            if !isCompact, !page.state.trusted {
                Button { page.run("trust") } label: {
                    Label("Trust Notebook", systemImage: "checkmark.shield")
                }
            }
            if !isCompact, let wanted = page.state.accessWanted, !wanted.isEmpty {
                Button { page.run("notebook-access") } label: {
                    Label("Notebook Access", systemImage: "lock.shield")
                }
                .accessibilityHint("Asks for \(wanted.joined(separator: ", "))")
            }
            if page.state.hasNotebook {
                JournalViewPicker(page: page)
            }
            if IPadLayout.showsStandaloneRunPill(width: width) {
                IPadRunCapsule(page: page)
            }
            if IPadLayout.showsStandaloneShareButton(width: width) {
                shareMenu
            }
            moreMenu
        }
    }

    private var titleStack: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(title)
                .font(.headline.weight(.semibold))
                .foregroundStyle(page.state.hasNotebook ? Color("TitleText") : Color.primary)
                .lineLimit(1)
                .truncationMode(.tail)
            if !isCompact, let note = header?.saveNote {
                Text(note)
                    .font(.caption2)
                    .foregroundStyle(header?.locked == true ? Color.red : Color.secondary)
                    .lineLimit(1)
            } else if header == nil, let machineName, !machineName.isEmpty {
                Text("on \(machineName)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: isCompact ? 170 : 280, alignment: .leading)
    }

    private var shareMenu: some View {
        Menu {
            shareItems
        } label: {
            Label("Share", systemImage: "square.and.arrow.up")
        }
        .disabled(!page.state.hasNotebook)
    }

    @ViewBuilder
    private var shareItems: some View {
        Button { page.run("download") } label: { Label("Download", systemImage: "arrow.down.doc") }
        Menu {
            Button("Markdown") { page.run("export", arg: "markdown") }
            Button("Script") { page.run("export", arg: "script") }
        } label: {
            Label("Export As", systemImage: "square.and.arrow.up.on.square")
        }
        .disabled(page.state.publish != true)
        Button { page.run("publish") } label: {
            Label("Publish as Web Page…", systemImage: "globe")
        }
        .disabled(page.state.publish != true)
    }

    /// Fixed-order More menu preserving every existing notebook action and
    /// every existing iPad workspace action (Terminals, Terminal Panel, Fill
    /// Screen, Open Folder, Settings). Always enabled so workspace actions
    /// remain reachable even with no notebook open.
    private var moreMenu: some View {
        Menu {
            if page.state.hasNotebook {
                editItems
                Divider()
                Button { page.run("shutdown-others") } label: {
                    Label("Shut Down Other Kernels", systemImage: "power")
                }
                .disabled(page.state.otherSessions.isEmpty)
                Divider()
                fileItems
                Divider()
            }
            workspaceItems
            Divider()
            if page.state.hasNotebook {
                Button { page.run("show-shortcuts") } label: {
                    Label("Keyboard Shortcuts", systemImage: "keyboard")
                }
            }
            Button(action: onOpenSettings) {
                Label("Settings", systemImage: "gearshape")
            }
        } label: {
            Label("More", systemImage: "ellipsis")
        }
    }

    @ViewBuilder
    private var editItems: some View {
        Button { page.run("toggle-journal") } label: {
            Label(page.state.journalToggleTitle, systemImage: page.state.journalToggleSymbol)
        }
        Button { page.run("insert-code") } label: {
            Label("Insert Code Cell", systemImage: "plus.rectangle")
        }
        .disabled(!page.state.editsCells)
        Button { page.run("insert-markdown") } label: {
            Label("Insert Markdown Cell", systemImage: "text.badge.plus")
        }
        .disabled(!page.state.editsCells)
        Picker("Cell Type", selection: cellType) {
            Text("Code").tag("code")
            Text("Markdown").tag("markdown")
            Text("Raw").tag("raw")
        }
        .disabled(!page.state.editsCells)
    }

    @ViewBuilder
    private var fileItems: some View {
        Button { page.run("save") } label: {
            Label("Save", systemImage: "square.and.arrow.down")
        }
        .disabled(!page.state.dirty)
        Button(action: onRename) {
            Label("Rename…", systemImage: "pencil")
        }
        if isCompact {
            Menu {
                shareItems
            } label: {
                Label("Share", systemImage: "square.and.arrow.up")
            }
        }
        Button { page.run("trust") } label: {
            Label("Trust Notebook", systemImage: "checkmark.shield")
        }
        .disabled(page.state.trusted)
        Button { page.run("notebook-access") } label: {
            Label("Notebook Access…", systemImage: "lock.shield")
        }
        .disabled(page.state.hostGrants != true)
    }

    @ViewBuilder
    private var workspaceItems: some View {
        let remotes = model.remotes.filter { $0.hasServer || $0.ssh != nil }
        Menu {
            if let newTerminal {
                Button("New Terminal") { onOpenTerminal(TerminalRequest(target: newTerminal)) }
            }
            if newTerminal != nil, !remotes.isEmpty { Divider() }
            ForEach(remotes) { remote in
                if remote.ssh != nil {
                    Button("\(remote.title) (SSH)") {
                        onOpenTerminal(TerminalRequest(target: .ssh(remote.id)))
                    }
                }
                if remote.hasServer {
                    Button("\(remote.title) (Server)") {
                        onOpenTerminal(TerminalRequest(target: .server(remote.id)))
                    }
                }
            }
        } label: {
            Label("Terminals", systemImage: "terminal")
        }
        .disabled(newTerminal == nil && remotes.isEmpty)

        Button(action: onTogglePanel) {
            Label(
                panelShown ? "Hide Terminal Panel" : "Show Terminal Panel",
                systemImage: "rectangle.bottomthird.inset.filled"
            )
        }
        Button(action: onToggleMainFill) {
            Label(
                mainFills ? "Restore" : "Fill the Screen",
                systemImage: mainFills
                    ? "arrow.down.right.and.arrow.up.left"
                    : "arrow.up.left.and.arrow.down.right"
            )
        }
        if place.isThisDevice {
            Button(action: onOpenFolder) {
                Label("Open Folder", systemImage: "folder")
            }
        }
    }

    private var cellType: Binding<String> {
        Binding(
            get: { page.state.cellType ?? "code" },
            set: { page.run("cell-type", arg: $0) }
        )
    }
}

/// The iPad kernel chip (`dot · language · runs on`, or status dot alone
/// below `600pt` wide) opening the notebook's file/kernel status menu, with
/// Run actions folded into the menu in narrow Split View (`E-Touch2.png`).
struct IPadKernelChipMenu: View {
    let header: HeaderStatus
    var page: PageModel
    var place: Place = .thisDevice
    var compact = false

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Menu {
            if compact {
                Section("Run") {
                    Button {
                        if page.state.editsCells { page.run("run") }
                    } label: {
                        Label("Run Cell", systemImage: "play.fill")
                    }
                    .disabled(!page.state.editsCells)
                    Button {
                        page.run("interrupt")
                    } label: {
                        Label("Interrupt", systemImage: "stop.fill")
                    }
                    .disabled(!page.state.isBusy)
                    RunMenuItems(page: page)
                }
            }
            if let path = page.state.path {
                Section("File") {
                    Text(path)
                }
            }
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
                    Text(line).font(.caption).foregroundStyle(.secondary)
                }
                if place.allows(.kernelLocation), AppModel.shared.kernelLocations.hasRemotes {
                    KernelLocationPicker(running: page.state.sessions.count)
                        .pickerStyle(.inline)
                }
            }
        } label: {
            chipLabel
        }
        .accessibilityLabel(header.full)
        .accessibilityValue(header.dotLabel)
        .accessibilityHint(compact ? "Runs cells and shows the file and the kernel" : "Shows the file and the kernel")
    }

    @ViewBuilder
    private var chipLabel: some View {
        if compact {
            statusMark
                .frame(width: 32, height: 32)
                .background(chipBackground)
                .overlay(chipStroke)
        } else {
            HStack(spacing: 6) {
                statusMark
                Text(IPadLayout.kernelChipText(for: header))
                    .font(.subheadline)
                    .foregroundStyle(header.needsAttention ? Color.red : Color.primary)
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(chipBackground)
            .overlay(chipStroke)
        }
    }

    private var chipBackground: some View {
        Capsule().fill(
            colorScheme == .dark ? Color.white.opacity(0.08) : Color.black.opacity(0.05)
        )
    }

    private var chipStroke: some View {
        Capsule().strokeBorder(
            header.needsAttention
                ? Color.red.opacity(0.45)
                : (colorScheme == .dark ? Color.white.opacity(0.14) : Color.black.opacity(0.12)),
            lineWidth: 0.5
        )
    }

    private var statusMark: some View {
        Group {
            switch header.chipKind {
            case .working:
                ProgressView()
                    .controlSize(.mini)
            case .missing:
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.caption2)
                    .foregroundStyle(Color.red)
            case .idle:
                Circle()
                    .fill(Color("Ready"))
                    .frame(width: 7, height: 7)
            case .stopped:
                Circle()
                    .fill(Color.secondary)
                    .frame(width: 7, height: 7)
            }
        }
        .frame(width: 12, height: 12)
        .accessibilityHidden(true)
    }

    private var machine: String? { place.machineID.flatMap(AppModel.shared.machineName(_:)) }
}

/// Touch-friendly orange Run capsule group (`E-Touch.png` left): filled orange
/// `▶ Run` button (`AccentFill` / `OnAccent`), Run menu chevron, and Interrupt
/// stop button joined in one capsule.
struct IPadRunCapsule: View {
    var page: PageModel

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: 2) {
            Button {
                if page.state.editsCells { page.run("run") }
            } label: {
                Label("Run", systemImage: "play.fill")
                    .labelStyle(.titleAndIcon)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color("OnAccent"))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color("AccentFill"), in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Run Cell")
            .disabled(!page.state.hasNotebook)

            Menu {
                RunMenuItems(page: page)
            } label: {
                Image(systemName: "chevron.down")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(page.state.hasNotebook ? Color.primary : Color.secondary)
                    .frame(width: 24, height: 28)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Run Cell Menu")
            .disabled(!page.state.hasNotebook)

            Divider()
                .frame(height: 16)

            Button {
                page.run("interrupt")
            } label: {
                Image(systemName: "stop.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(page.state.isBusy ? Color.primary : Color.secondary)
                    .frame(width: 28, height: 28)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Interrupt")
            .disabled(!page.state.isBusy)
        }
        .padding(.leading, 3)
        .padding(.trailing, 4)
        .padding(.vertical, 2)
        .background(
            Capsule().fill(
                colorScheme == .dark ? Color.white.opacity(0.08) : Color.black.opacity(0.05)
            )
        )
        .overlay(
            Capsule().strokeBorder(
                colorScheme == .dark ? Color.white.opacity(0.14) : Color.black.opacity(0.12),
                lineWidth: 0.5
            )
        )
    }
}
#endif
