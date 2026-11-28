#if os(macOS)
import SwiftUI

/// Slim Mac status bar under the workspace (#882): save state on the
/// left, kernel version and memory on the right. Non-notebook windows
/// keep the bar's height empty when shown so switching tabs or opening a
/// notebook doesn't move the page vertically.
struct StatusBar: View {
    static let height: CGFloat = 26

    var active: Bool
    var content: StatusBarContent
    var page: PageModel?
    @State private var watcher = PageMemoryWatcher()

    var body: some View {
        VStack(spacing: 0) {
            Divider()
                .opacity(active ? 1 : 0)
            HStack(spacing: 12) {
                if active {
                    if let save = content.save {
                        Text(save)
                            .lineLimit(1)
                            .truncationMode(.tail)
                            .help("Notebook save state")
                    }
                    Spacer(minLength: 12)
                    if let version = content.version {
                        Text(version)
                            .lineLimit(1)
                            .truncationMode(.middle)
                            .help("Kernel version")
                    }
                    if let memory = content.memory {
                        Text(memory)
                            .monospacedDigit()
                            .lineLimit(1)
                            .help("Kernel memory")
                    }
                }
            }
            .font(.caption)
            .foregroundStyle(Color("StatusBarText"))
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(height: Self.height)
        .background(Color("WindowBackground"))
        .accessibilityHidden(!active)
        .onAppear { watcher.update(page: page, visible: active) }
        .onChange(of: active) { _, active in watcher.update(page: page, visible: active) }
        .onChange(of: page.map(ObjectIdentifier.init)) { _, _ in
            watcher.update(page: page, visible: active)
        }
        .onDisappear { watcher.update(page: nil, visible: false) }
    }
}

/// View › Show/Hide Status Bar (⌘/), remembered across launches (#882).
struct StatusBarCommands: View {
    @AppStorage(StatusBarContent.shownKey) private var shown = true

    var body: some View {
        Button(StatusBarContent.menuTitle(shown: shown)) {
            shown.toggle()
        }
        .keyboardShortcut("/", modifiers: .command)
    }
}
#endif
