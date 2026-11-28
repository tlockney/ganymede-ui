#if os(iOS)
import SwiftUI

/// The iPhone Outline sheet (#915): header with `"Outline"`, `Run all ▾` menu,
/// and notebook progress summary; numbered heading rows with accessible ran,
/// current, and not-run dots; and `+ Code` / `+ Text` quick-insert buttons.
struct PhoneOutlineSheet: View {
    var page: PageModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    private var sheetState: PhoneOutlineSheetState {
        PhoneOutlineSheetState.make(state: page.state)
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
                .overlay(Color.primary.opacity(colorScheme == .dark ? 0.12 : 0.08))
            sectionsList
            Divider()
                .overlay(Color.primary.opacity(colorScheme == .dark ? 0.12 : 0.08))
            footer
        }
        .background(Color("WindowBackground").ignoresSafeArea())
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    // MARK: Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .center, spacing: 12) {
                Text("Outline")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(Color("TitleText"))
                Spacer()
                Menu {
                    RunMenuItems(page: page)
                } label: {
                    HStack(spacing: 4) {
                        Text("Run all")
                            .font(.subheadline.weight(.medium))
                        Image(systemName: "chevron.down")
                            .font(.caption2.weight(.semibold))
                    }
                    .foregroundStyle(Color("TitleText"))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(
                        Capsule()
                            .fill(colorScheme == .dark ? Color.white.opacity(0.10) : Color.black.opacity(0.06))
                    )
                }
                .disabled(!sheetState.canRunMenu)
                .accessibilityLabel("Run all menu")
            }

            if let summary = sheetState.summaryText {
                Text(summary)
                    .font(.caption)
                    .foregroundStyle(SidebarCaption())
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 18)
        .padding(.bottom, 12)
    }

    // MARK: Sections

    private var sectionsList: some View {
        ScrollView {
            if sheetState.isEmpty {
                VStack(spacing: 8) {
                    Text(sheetState.emptyMessage)
                        .font(.subheadline)
                        .foregroundStyle(SidebarCaption())
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 24)
                .padding(.vertical, 36)
            } else {
                LazyVStack(spacing: 4) {
                    ForEach(sheetState.rows) { row in
                        sectionRow(row)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
            }
        }
    }

    private func sectionRow(_ row: PhoneOutlineSheetState.Row) -> some View {
        let isCurrent = row.status == .current
        return Button {
            page.run("go-to-cell", arg: row.goToCellArgument)
            dismiss()
        } label: {
            HStack(spacing: 12) {
                Text("\(row.number)")
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(isCurrent ? AnyShapeStyle(Color("AccentFill")) : AnyShapeStyle(SidebarCaption()))
                    .frame(minWidth: 20, alignment: .trailing)

                Text(row.text)
                    .font(.subheadline.weight(isCurrent ? .semibold : .regular))
                    .foregroundStyle(isCurrent ? Color("TitleText") : Color.primary)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
                    .padding(.leading, CGFloat(row.indentLevel) * 12)

                Spacer(minLength: 8)

                statusDot(for: row.status)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 11)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(
                        isCurrent
                            ? Color("AccentFill").opacity(colorScheme == .dark ? 0.18 : 0.12)
                            : Color.clear
                    )
            )
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(row.rowAccessibilityLabel)
        .accessibilityAddTraits(isCurrent ? .isSelected : [])
    }

    private func statusDot(for status: PageState.SectionStatus) -> some View {
        let fill: AnyShapeStyle = switch status {
        case .ran: AnyShapeStyle(Color("Ready"))
        case .current: AnyShapeStyle(Color("AccentFill"))
        case .notRun: AnyShapeStyle(SidebarCaption())
        }
        return Circle()
            .fill(fill)
            .frame(width: 8, height: 8)
            .accessibilityLabel(status.accessibilityLabel)
    }

    // MARK: Footer

    private var footer: some View {
        HStack(spacing: 12) {
            Button {
                page.run("insert-code")
                dismiss()
            } label: {
                Label("Code", systemImage: "plus")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(
                        sheetState.canInsertCells ? AnyShapeStyle(Color("TitleText")) : AnyShapeStyle(SidebarCaption())
                    )
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 11)
                    .background(
                        Capsule()
                            .fill(colorScheme == .dark ? Color.white.opacity(0.09) : Color.black.opacity(0.06))
                    )
            }
            .buttonStyle(.plain)
            .disabled(!sheetState.canInsertCells)
            .accessibilityLabel("Insert Code Cell")

            Button {
                page.run("insert-markdown")
                dismiss()
            } label: {
                Label("Text", systemImage: "plus")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(
                        sheetState.canInsertCells ? AnyShapeStyle(Color("TitleText")) : AnyShapeStyle(SidebarCaption())
                    )
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 11)
                    .background(
                        Capsule()
                            .fill(colorScheme == .dark ? Color.white.opacity(0.09) : Color.black.opacity(0.06))
                    )
            }
            .buttonStyle(.plain)
            .disabled(!sheetState.canInsertCells)
            .accessibilityLabel("Insert Markdown Cell")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}
#endif
