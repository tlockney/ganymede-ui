#if os(iOS)
import SwiftUI

/// Compact touch-sized tab strip above the iPad notebook (`E-Touch.png` and
/// `E-Touch2.png` left): renders the page-joined active tab with its 1.5pt
/// colored top edge alongside quieter recent notebook chips and outlined
/// machine capsules. Below `600pt` wide, extra tabs fold into `+N tabs ⌄`.
struct IPadTabStrip: View {
    let tabs: [IPadTabItem]
    let availableWidth: CGFloat
    let onSelect: (IPadTabAction) -> Void

    @Environment(\.colorScheme) private var colorScheme

    private var isDark: Bool { colorScheme == .dark }

    private var troughBackground: Color {
        isDark
            ? Color(red: 0x13 / 255, green: 0x17 / 255, blue: 0x2a / 255)
            : Color(red: 0xec / 255, green: 0xe7 / 255, blue: 0xdc / 255)
    }

    private var separatorColor: Color {
        isDark ? Color.white.opacity(0.12) : Color.black.opacity(0.12)
    }

    var body: some View {
        let snapshot = IPadTabStripModel.layout(tabs: tabs, availableWidth: availableWidth)
        let boundaryIndex = documentEnvironmentBoundary(in: snapshot.visibleTabs)

        HStack(alignment: .bottom, spacing: 6) {
            if snapshot.isFolded {
                ForEach(snapshot.visibleTabs) { item in
                    IPadTabChip(item: item, isDark: isDark, onSelect: onSelect)
                }
                if let menuTitle = snapshot.foldedMenuTitle {
                    foldedMenu(title: menuTitle, items: snapshot.foldedTabs)
                }
                Spacer(minLength: 0)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .bottom, spacing: 6) {
                        ForEach(Array(snapshot.visibleTabs.enumerated()), id: \.element.id) { index, item in
                            IPadTabChip(item: item, isDark: isDark, onSelect: onSelect)
                            if boundaryIndex == index {
                                Rectangle()
                                    .fill(separatorColor)
                                    .frame(width: 1, height: 18)
                                    .padding(.horizontal, 4)
                                    .padding(.bottom, 10)
                                    .accessibilityHidden(true)
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                    .frame(height: IPadLayout.tabStripHeight, alignment: .bottom)
                }
            }
        }
        .padding(.horizontal, snapshot.isFolded ? 12 : 0)
        .frame(maxWidth: .infinity)
        .frame(height: IPadLayout.tabStripHeight, alignment: .bottomLeading)
        .background(troughBackground)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isTabBar)
        .accessibilityLabel("Open tabs")
    }

    private func foldedMenu(title: String, items: [IPadTabItem]) -> some View {
        Menu {
            let notebooks = items.filter { $0.group == .document }
            let environments = items.filter { $0.group == .environment }
            if !notebooks.isEmpty {
                Section("Notebooks") {
                    ForEach(notebooks) { item in
                        Button {
                            onSelect(item.action)
                        } label: {
                            Label(
                                item.isRunning ? "\(item.title) · Running" : item.title,
                                systemImage: "book.pages"
                            )
                        }
                    }
                }
            }
            if !environments.isEmpty {
                Section("Places") {
                    ForEach(environments) { item in
                        Button {
                            onSelect(item.action)
                        } label: {
                            Label(item.title, systemImage: item.machineSymbol)
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Text(title)
                    .font(.caption.weight(.medium))
                Image(systemName: "chevron.down")
                    .font(.system(size: 9, weight: .semibold))
                    .accessibilityHidden(true)
            }
            .foregroundStyle(isDark ? Color(red: 0xb9 / 255, green: 0xc2 / 255, blue: 0xd8 / 255) : Color(red: 0x3e / 255, green: 0x46 / 255, blue: 0x63 / 255))
            .padding(.horizontal, 10)
            .frame(height: IPadLayout.inactiveTabHeight)
            .background(
                Capsule().fill(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.06))
            )
            .overlay(
                Capsule().strokeBorder(
                    isDark ? Color.white.opacity(0.14) : Color.black.opacity(0.10),
                    lineWidth: 0.5
                )
            )
        }
        .padding(.bottom, 5)
        .accessibilityLabel("More tabs, \(title)")
    }

    private func documentEnvironmentBoundary(in visible: [IPadTabItem]) -> Int? {
        guard let lastDoc = visible.lastIndex(where: { $0.group == .document }),
              lastDoc + 1 < visible.count,
              visible[(lastDoc + 1)...].contains(where: { $0.group == .environment })
        else { return nil }
        return lastDoc
    }
}

private struct IPadTabChip: View {
    let item: IPadTabItem
    let isDark: Bool
    let onSelect: (IPadTabAction) -> Void

    private var activeShape: UnevenRoundedRectangle {
        UnevenRoundedRectangle(
            topLeadingRadius: TabStripLayout.activeCornerRadius,
            bottomLeadingRadius: 0,
            bottomTrailingRadius: 0,
            topTrailingRadius: TabStripLayout.activeCornerRadius,
            style: .continuous
        )
    }

    var body: some View {
        Button {
            if !item.isSelected {
                onSelect(item.action)
            }
        } label: {
            HStack(spacing: 7) {
                leadingMark
                Text(item.title)
                    .font(.system(size: item.isSelected ? 13.5 : 12.5, weight: item.isSelected ? .semibold : .regular))
                    .foregroundStyle(titleColor)
                    .lineLimit(1)
                    .truncationMode(.tail)
                if let kernelKind = item.kernelKind {
                    statusDot(kind: kernelKind)
                }
            }
            .padding(.horizontal, item.isSelected ? 14 : 11)
            .frame(
                minWidth: item.isSelected ? 120 : 80,
                maxWidth: item.isSelected ? 220 : 180,
                minHeight: item.isSelected ? IPadLayout.activeTabHeight : IPadLayout.inactiveTabHeight,
                maxHeight: item.isSelected ? IPadLayout.activeTabHeight : IPadLayout.inactiveTabHeight
            )
            .background(background)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.bottom, item.isSelected ? 0 : 5)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(item.accessibilityLabel)
        .accessibilityValue(item.accessibilityValue)
        .accessibilityAddTraits(item.isSelected ? .isSelected : [])
    }

    @ViewBuilder
    private var leadingMark: some View {
        switch item.kind {
        case .notebook, .editor:
            if let badge = item.badge {
                let side: CGFloat = item.isSelected ? 18 : 15
                Text(badge.code)
                    .font(.system(size: item.isSelected ? 8.5 : 7.5, weight: .bold))
                    .foregroundStyle(Color.white)
                    .frame(width: side, height: side)
                    .background(
                        RoundedRectangle(cornerRadius: item.isSelected ? 5 : 4, style: .continuous)
                            .fill(badgeColor(badge))
                    )
                    .accessibilityHidden(true)
            }
        case .machine:
            Image(systemName: item.machineSymbol)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(titleColor)
                .accessibilityHidden(true)
        case .terminal:
            Text(">_")
                .font(.system(size: 11.5, weight: .semibold, design: .monospaced))
                .foregroundStyle(Color("Ready"))
                .accessibilityHidden(true)
        }
    }

    @ViewBuilder
    private func statusDot(kind: HeaderStatus.ChipKind) -> some View {
        Group {
            switch kind {
            case .working:
                ProgressView()
                    .controlSize(.mini)
                    .frame(width: 10, height: 10)
            case .missing:
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 9))
                    .foregroundStyle(Color.orange)
            case .idle:
                Circle()
                    .fill(Color("Ready"))
                    .frame(width: 6, height: 6)
            case .stopped:
                Circle()
                    .fill(Color.secondary.opacity(0.7))
                    .frame(width: 6, height: 6)
            }
        }
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private var background: some View {
        if item.isSelected {
            ZStack(alignment: .top) {
                activeSurface
                Rectangle()
                    .fill(topEdgeColor)
                    .frame(height: TabStripLayout.topEdgeHeight)
            }
            .clipShape(activeShape)
        } else {
            switch item.kind {
            case .notebook, .editor:
                RoundedRectangle(cornerRadius: TabStripLayout.inactiveNotebookCornerRadius, style: .continuous)
                    .fill(isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.04))
            case .machine:
                Capsule()
                    .fill(Color.clear)
                    .overlay(
                        Capsule().strokeBorder(
                            Color("Ready").opacity(isDark ? 0.35 : 0.45),
                            lineWidth: 1
                        )
                    )
            case .terminal:
                RoundedRectangle(cornerRadius: TabStripLayout.inactiveTerminalCornerRadius, style: .continuous)
                    .fill(Color(red: 0x0d / 255, green: 0x10 / 255, blue: 0x20 / 255))
            }
        }
    }

    private var activeSurface: Color {
        switch item.kind {
        case .notebook, .editor:
            return Color("WindowBackground")
        case .machine:
            return isDark
                ? Color(red: 0x1a / 255, green: 0x24 / 255, blue: 0x42 / 255)
                : Color(red: 0xea / 255, green: 0xf0 / 255, blue: 0xfc / 255)
        case .terminal:
            return Color(red: 0x0d / 255, green: 0x10 / 255, blue: 0x20 / 255)
        }
    }

    private var topEdgeColor: Color {
        switch item.topEdgeTone {
        case .orange:
            return Color("AccentFill").opacity(isDark ? 0.55 : 0.65)
        case .blue:
            return Color("Ready").opacity(0.58)
        case .neutral:
            return isDark ? Color.white.opacity(0.35) : Color.primary.opacity(0.28)
        }
    }

    private var titleColor: Color {
        if item.isSelected {
            switch item.kind {
            case .notebook, .editor:
                return Color("TitleText")
            case .machine:
                return isDark
                    ? Color(red: 0xdb / 255, green: 0xe5 / 255, blue: 0xff / 255)
                    : Color(red: 0x1b / 255, green: 0x29 / 255, blue: 0x4d / 255)
            case .terminal:
                return Color(red: 0xe6 / 255, green: 0xe8 / 255, blue: 0xf0 / 255)
            }
        }
        switch item.kind {
        case .notebook, .editor:
            return isDark
                ? Color(red: 0x9a / 255, green: 0xa0 / 255, blue: 0xb8 / 255)
                : Color(red: 0x47 / 255, green: 0x4e / 255, blue: 0x69 / 255)
        case .machine:
            return isDark
                ? Color(red: 0xb9 / 255, green: 0xc8 / 255, blue: 0xf2 / 255)
                : Color(red: 0x28 / 255, green: 0x47 / 255, blue: 0x8f / 255)
        case .terminal:
            return Color(red: 0xc9 / 255, green: 0xcb / 255, blue: 0xd6 / 255)
        }
    }

    private func badgeColor(_ badge: TabLanguageBadge) -> Color {
        let base: Color = switch badge.palette {
        case .typescript, .sql:
            Color(red: 0x31 / 255, green: 0x78 / 255, blue: 0xc6 / 255)
        case .python:
            Color(red: 0x35 / 255, green: 0x72 / 255, blue: 0xa5 / 255)
        case .javascript:
            Color(red: 0x9e / 255, green: 0x7b / 255, blue: 0x00 / 255)
        case .neutral:
            Color(red: 0x5a / 255, green: 0x61 / 255, blue: 0x77 / 255)
        }
        return base.opacity(item.isSelected ? 1.0 : (isDark ? 0.62 : 0.80))
    }
}
#endif
