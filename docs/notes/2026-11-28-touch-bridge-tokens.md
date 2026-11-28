## 2026-11-28, Touch bridge and iOS palette tokens (#913)

Foundation for Step 7 of the visual redesign (`#844`), preparing the web bridge, Swift `PageState` helpers, iOS asset catalog, and narrow-viewport cell cards for the iPad (`#914`) and iPhone (`#915`) work:

- **Web bridge (`src/lib/outline.ts`, `src/lib/native.ts`, `src/components/NotebookPane.tsx`, `src/components/JournalView.tsx`, `src/App.tsx`):**
  - Extended `OutlineCell` with optional `executionCount?: number | null` and `OutlineItem` with optional `ran?: boolean`. For each heading's section (cells after the heading up to the next heading or end of notebook), `outlineOf` sets `ran: true` when the section has at least one code cell with an execution count and every one has run, `ran: false` when any code cell is unrun, and omits `ran` when no code cells have execution counts.
  - Added `activeCell: number | null`, `cellCount: number`, and `ranCellCount: number` to `PageState` and `NotebookController`, subscribing to each cell's `stateChanged` signal (`executionCount`) so run counts and outline status update immediately when cells execute or outputs are cleared.
  - Added an optional `onActiveCellChange` callback on `JournalView` (throttled via `requestAnimationFrame` on scroll) so Journal mode reports the current reading cell index in `PageState.activeCell`.
- **Swift `PageState` (`apple/Sources/Ganymede/PageState.swift`):**
  - Added backward-compatible decoding for `Heading.ran`, `activeCell`, `cellCount`, and `ranCellCount`.
  - Added `SectionStatus` (with VoiceOver `accessibilityLabel` values), `currentHeadingIndex`, `currentHeading`, `sectionStatus(at:)`, `cellStepperLabel`, `previousCellIndex`, `nextCellIndex`, and `outlineSummary`, covered by unit tests in `apple/Tests/GanymedeTests/PageStateTests.swift` on both macOS and iOS.
- **iOS asset colorsets (`apple/Resources/iOS/Assets.xcassets/`):**
  - Added `SidebarTint.colorset`, `TitleText.colorset`, and `WindowBackground.colorset` matching macOS so iPad and iPhone share the icon palette; extended `src/styles/contrast.test.ts` to check iOS parity and AA contrast.
- **Mobile card CSS polish (`src/styles/app.css`, `src/styles/jupyter.css`):**
  - At `<= 600px` in `.touch-ui`, cleared `--jp-notebook-padding` to remove JupyterLab's double horizontal viewport margin, styled the active code cell meta row as a compact card header strip with symmetric inner card padding and zero horizontal overflow, and stacked `.journal-cell` gutters above the card body at `<= 600px` so narrow phone and Split View columns keep full-width cards and figures.
