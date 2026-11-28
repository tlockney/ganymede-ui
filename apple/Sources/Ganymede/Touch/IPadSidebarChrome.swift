#if os(iOS)
import SwiftUI
import UIKit

/// The iPad sidebar's top chrome (#914): Ganymede app mark + wordmark over a
/// touch-sized capsule navigator control (`>= 44pt` tall) keeping every
/// existing iPad tab and `⌘1`–`⌘6` shortcut.
struct IPadSidebarHeader: View {
    let tabs: [NavigatorTab]
    let shownTab: NavigatorTab
    let runningCount: Int
    let select: (NavigatorTab) -> Void

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                IPadAppMark()
                    .frame(width: 24, height: 24)
                    .accessibilityHidden(true)
                Text("Ganymede")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(SidebarBrand())
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14)
            .padding(.top, 8)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)

            capsule
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
        }
        .background(Color("SidebarTint"))
        .overlay(alignment: .bottom) {
            Divider().opacity(0.45)
        }
    }

    private var capsule: some View {
        HStack(spacing: 2) {
            ForEach(tabs) { item in
                Button {
                    select(item)
                } label: {
                    segment(item)
                }
                .buttonStyle(.plain)
                .foregroundStyle(shownTab == item ? AnyShapeStyle(SidebarInk()) : AnyShapeStyle(SidebarCaption()))
                .accessibilityLabel(item.title)
                .accessibilityValue(item == .running ? NavigatorTab.runningValue(runningCount) : "")
                .accessibilityAddTraits(shownTab == item ? .isSelected : [])
                .keyboardShortcut(item.shortcut, modifiers: .command)
                .hoverEffect()
                .overlay(alignment: .topTrailing) {
                    if item == .running, runningCount > 0 {
                        Text("\(runningCount)")
                            .font(.system(size: 9.5, weight: .semibold))
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(Capsule().fill(Color("AccentFill")))
                            .foregroundStyle(Color("OnAccent"))
                            .offset(x: 2, y: -2)
                            .accessibilityHidden(true)
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isTabBar)
        .padding(4)
        .frame(minHeight: IPadLayout.minimumTouchTarget)
        .background(
            Capsule().fill(
                colorScheme == .dark ? Color.white.opacity(0.07) : Color.black.opacity(0.05)
            )
        )
        .overlay(
            Capsule().strokeBorder(
                colorScheme == .dark ? Color.white.opacity(0.12) : Color.black.opacity(0.10),
                lineWidth: 0.5
            )
        )
    }

    @ViewBuilder
    private func segment(_ item: NavigatorTab) -> some View {
        if shownTab == item {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 5) {
                    Image(systemName: item.symbol)
                        .symbolVariant(.fill)
                    Text(item.title)
                        .lineLimit(1)
                        .fixedSize()
                }
                Image(systemName: item.symbol)
                    .symbolVariant(.fill)
            }
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 8)
            .frame(maxWidth: .infinity, minHeight: 36)
            .background(
                Capsule().fill(
                    colorScheme == .dark ? Color.white.opacity(0.14) : Color.white.opacity(0.88)
                )
            )
            .contentShape(Capsule())
        } else {
            Image(systemName: item.symbol)
                .font(.subheadline)
                .frame(minWidth: 30, minHeight: 36)
                .contentShape(Capsule())
        }
    }
}

/// Pinned live outline card at the iPad sidebar's foot (`E-Touch.png`):
/// "IN THIS JOURNAL" or "IN THIS NOTEBOOK", highlighting the current section
/// in accessible orange accent with tap-to-jump (`go-to-cell`).
struct IPadSidebarOutlineCard: View {
    var page: PageModel
    var onPick: () -> Void = {}

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let headings = page.state.headings
        let top = headings.map(\.level).min() ?? 1
        let currentIndex = page.state.currentHeadingIndex

        VStack(alignment: .leading, spacing: 8) {
            Text(IPadLayout.inlineOutlineHeader(isJournal: page.state.journal == true))
                .font(.system(size: 10.5, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(SidebarCaption())
                .accessibilityAddTraits(.isHeader)

            ScrollView(.vertical, showsIndicators: false) {
                LazyVStack(alignment: .leading, spacing: 2) {
                    ForEach(Array(headings.enumerated()), id: \.offset) { index, heading in
                        let isCurrent = index == currentIndex
                        Button {
                            page.run("go-to-cell", arg: String(heading.cell))
                            onPick()
                        } label: {
                            Text(heading.text)
                                .font(.footnote.weight(isCurrent ? .semibold : .regular))
                                .foregroundStyle(
                                    isCurrent
                                        ? AnyShapeStyle(IPadPalette.currentOutlineColor(for: colorScheme))
                                        : AnyShapeStyle(SidebarCaption())
                                )
                                .lineLimit(1)
                                .truncationMode(.tail)
                                .padding(.leading, CGFloat(max(0, heading.level - top)) * 10)
                                .padding(.vertical, 5)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(isCurrent ? .isSelected : [])
                        .accessibilityValue(isCurrent ? "Current section" : "")
                    }
                }
            }
            .frame(maxHeight: 156)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(
                    colorScheme == .dark ? Color.black.opacity(0.24) : Color.white.opacity(0.60)
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(
                    colorScheme == .dark ? Color.white.opacity(0.10) : Color.black.opacity(0.08),
                    lineWidth: 0.5
                )
        )
        .padding(.horizontal, 12)
        .padding(.top, 6)
        .padding(.bottom, 10)
        .background(Color("SidebarTint"))
    }
}

/// Ganymede's app icon mark for the iPad sidebar header: loads the bundled
/// 192px icon from `web/icons/icon-192.png` (or `CFBundleIcons`), falling back
/// to a vector emblem using the app icon palette.
private struct IPadAppMark: View {
    private static let cachedImage: UIImage? = {
        if let url = Bundle.main.url(forResource: "icon-192", withExtension: "png", subdirectory: "web/icons"),
           let image = UIImage(contentsOfFile: url.path) {
            return image
        }
        if let icons = Bundle.main.infoDictionary?["CFBundleIcons"] as? [String: Any],
           let primary = icons["CFBundlePrimaryIcon"] as? [String: Any],
           let files = primary["CFBundleIconFiles"] as? [String],
           let last = files.last,
           let image = UIImage(named: last) {
            return image
        }
        return nil
    }()

    var body: some View {
        if let image = Self.cachedImage {
            Image(uiImage: image)
                .resizable()
                .interpolation(.high)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        } else {
            ZStack {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                Color(red: 0x2b / 255, green: 0x3a / 255, blue: 0x67 / 255),
                                Color(red: 0x0d / 255, green: 0x12 / 255, blue: 0x26 / 255),
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                Circle()
                    .fill(Color(red: 0xf4 / 255, green: 0xe9 / 255, blue: 0xd8 / 255))
                    .frame(width: 11, height: 11)
                Ellipse()
                    .stroke(Color("AccentFill"), lineWidth: 1.5)
                    .frame(width: 20, height: 7)
                    .rotationEffect(.degrees(-22))
            }
        }
    }
}
#endif
