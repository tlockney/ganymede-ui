#if os(iOS)
import SwiftUI

/// The iPhone's single floating glass bottom bar (#915):
/// - In Notebook mode: Outline button, `< 3 / 14 >` cell stepper (with current
///   section subtitle when headings exist), and one orange `Run` pill with its
///   run menu — plus an inline Interrupt button whenever the kernel is busy.
/// - In Journal mode: compact section navigation bar (`Section 2 of 6 · <title>`)
///   opening the Outline sheet cleanly without blocking the web composer.
struct PhoneBottomBar: View {
    var page: PageModel
    let onOpenOutline: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    private var barState: PhoneBottomBarState {
        PhoneBottomBarState.make(state: page.state)
    }

    var body: some View {
        switch barState.mode {
        case .hidden:
            EmptyView()
        case .notebook:
            notebookBar
                .padding(.horizontal, 12)
                .padding(.top, 6)
                .padding(.bottom, 6)
        case .journal:
            journalBar
                .padding(.horizontal, 12)
                .padding(.top, 6)
                .padding(.bottom, 6)
        }
    }

    // MARK: Notebook Mode

    private var notebookBar: some View {
        HStack(spacing: 6) {
            Button(action: onOpenOutline) {
                Image(systemName: "list.bullet.indent")
                    .font(.body.weight(.medium))
                    .foregroundStyle(Color("TitleText"))
                    .frame(width: 38, height: 36)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Outline")
            .accessibilityHint("Opens notebook sections and quick actions")

            stepperGroup

            Spacer(minLength: 4)

            if barState.showsInterrupt {
                interruptButton
            }

            runPill
        }
        .padding(.leading, 6)
        .padding(.trailing, 6)
        .padding(.vertical, 5)
        .modifier(PhoneGlassCapsule(colorScheme: colorScheme))
    }

    private var stepperGroup: some View {
        HStack(spacing: 2) {
            Button {
                if let arg = PhoneBottomBarState.goToCellArgument(for: barState.previousCellIndex) {
                    page.run("go-to-cell", arg: arg)
                }
            } label: {
                Image(systemName: "chevron.left")
                    .font(.footnote.weight(.semibold))
                    .frame(width: 30, height: 36)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .foregroundStyle(barState.canStepPrevious ? AnyShapeStyle(Color("TitleText")) : AnyShapeStyle(SidebarCaption().opacity(0.45)))
            .disabled(!barState.canStepPrevious)
            .accessibilityLabel("Previous cell")

            Button(action: onOpenOutline) {
                VStack(spacing: 0) {
                    Text(barState.stepperLabel ?? "–")
                        .font(.subheadline.monospacedDigit().weight(.medium))
                        .foregroundStyle(Color("TitleText"))
                        .lineLimit(1)
                    if let section = barState.currentSectionTitle {
                        Text(section)
                            .font(.caption2)
                            .foregroundStyle(SidebarCaption())
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }
                }
                .frame(minWidth: 46, maxWidth: 130, minHeight: 34)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(barState.stepperAccessibilityLabel)
            .accessibilityValue(barState.currentSectionTitle ?? "")
            .accessibilityHint("Opens the notebook outline")

            Button {
                if let arg = PhoneBottomBarState.goToCellArgument(for: barState.nextCellIndex) {
                    page.run("go-to-cell", arg: arg)
                }
            } label: {
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .frame(width: 30, height: 36)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .foregroundStyle(barState.canStepNext ? AnyShapeStyle(Color("TitleText")) : AnyShapeStyle(SidebarCaption().opacity(0.45)))
            .disabled(!barState.canStepNext)
            .accessibilityLabel("Next cell")
        }
    }

    private var interruptButton: some View {
        Button {
            page.run("interrupt")
        } label: {
            Image(systemName: "stop.fill")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Color("TitleText"))
                .frame(width: 34, height: 34)
                .background(
                    Circle()
                        .fill(colorScheme == .dark ? Color.white.opacity(0.14) : Color.black.opacity(0.08))
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Interrupt")
        .accessibilityHint("Stops the running kernel")
    }

    private var runPill: some View {
        Menu {
            RunMenuItems(page: page)
        } label: {
            Label("Run", systemImage: "play.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color("OnAccent"))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(Color("AccentFill"), in: Capsule())
        } primaryAction: {
            if barState.canRun {
                page.run("run")
            }
        }
        .disabled(!barState.canOpenRunMenu)
        .accessibilityLabel("Run Cell")
        .accessibilityHint("Tap to run the selected cell, or hold for more run actions")
    }

    // MARK: Journal Mode

    private var journalBar: some View {
        HStack(spacing: 8) {
            Button(action: onOpenOutline) {
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(barState.journalSectionEyebrow)
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(SidebarCaption())
                            .lineLimit(1)
                        Text(barState.journalSectionTitle)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color("TitleText"))
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }
                    Spacer(minLength: 4)
                    Image(systemName: "chevron.up")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(SidebarCaption())
                        .accessibilityHidden(true)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(barState.journalBarAccessibilityLabel)
            .accessibilityHint("Opens the notebook outline")

            if barState.showsInterrupt {
                interruptButton
                    .padding(.trailing, 6)
            }
        }
        .modifier(PhoneGlassCapsule(colorScheme: colorScheme))
    }
}

/// Floating glass capsule chrome for the iPhone bottom bar (#915).
private struct PhoneGlassCapsule: ViewModifier {
    var colorScheme: ColorScheme

    func body(content: Content) -> some View {
        content
            .background(.ultraThinMaterial, in: Capsule())
            .overlay(
                Capsule()
                    .strokeBorder(
                        colorScheme == .dark ? Color.white.opacity(0.16) : Color.black.opacity(0.10),
                        lineWidth: 0.75
                    )
            )
            .shadow(
                color: Color.black.opacity(colorScheme == .dark ? 0.35 : 0.12),
                radius: 12, x: 0, y: 4
            )
    }
}
#endif
