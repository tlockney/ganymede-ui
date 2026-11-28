import Foundation
import SwiftUI
#if os(macOS)
import AppKit
#endif

/// An sRGB colour used to check sidebar foreground contrast against its
/// translucent tint (#878, #896) without launching a window.
struct SidebarRGB: Equatable, Sendable {
    let red: Double
    let green: Double
    let blue: Double
    let alpha: Double

    init(red: Double, green: Double, blue: Double, alpha: Double = 1) {
        self.red = red
        self.green = green
        self.blue = blue
        self.alpha = alpha
    }

    var color: Color {
        Color(.sRGB, red: red, green: green, blue: blue, opacity: alpha)
    }

    /// This translucent foreground composited over an opaque `backdrop`.
    func composited(over backdrop: SidebarRGB) -> SidebarRGB {
        SidebarRGB(
            red: red * alpha + backdrop.red * (1 - alpha),
            green: green * alpha + backdrop.green * (1 - alpha),
            blue: blue * alpha + backdrop.blue * (1 - alpha)
        )
    }

    /// Relative luminance in sRGB per WCAG 2.1.
    var relativeLuminance: Double {
        0.2126 * Self.linearize(red)
            + 0.7152 * Self.linearize(green)
            + 0.0722 * Self.linearize(blue)
    }

    /// Contrast ratio (>= 1) against `background`.
    func contrastRatio(against background: SidebarRGB) -> Double {
        let l1 = relativeLuminance
        let l2 = background.relativeLuminance
        return (max(l1, l2) + 0.05) / (min(l1, l2) + 0.05)
    }

    private static func linearize(_ channel: Double) -> Double {
        channel <= 0.04045 ? channel / 12.92 : pow((channel + 0.055) / 1.055, 2.4)
    }
}

/// The Mac sidebar's tint, brand ink and caption colours (#896, #878), matching
/// `SidebarTint.colorset` so tests can verify WCAG AA contrast (>= 4.5:1) in
/// both appearances.
enum SidebarPalette {
    /// Warm cream tint in light mode (#F3EFE6 at 75%), replacing the grey
    /// 14% navy wash while keeping glass refraction behind the panel.
    static let lightTint = SidebarRGB(red: 0.952941, green: 0.937255, blue: 0.901961, alpha: 0.750)
    /// Navy tint in dark mode (#2B3A67 at 55%), matching `SidebarTint`.
    static let darkTint = SidebarRGB(red: 0.168627, green: 0.227451, blue: 0.403922, alpha: 0.550)

    /// Navy ink (#1B2036) for light-mode sidebar headings, tabs and labels.
    static let lightInk = SidebarRGB(red: 0.105882, green: 0.125490, blue: 0.211765)
    /// Moon cream (#F4E9D8) for the wordmark on the dark navy glass.
    static let darkBrand = SidebarRGB(red: 0.956863, green: 0.913725, blue: 0.847059)

    /// Navy-slate (#3E4663) for light-mode captions, clearing >= 4.5:1 even
    /// over dark desktop content behind the translucent light glass.
    static let lightCaption = SidebarRGB(red: 0.243137, green: 0.274510, blue: 0.388235)
    /// Cool slate (#B8BDD1) for dark-mode captions on navy glass and Inspector.
    static let darkCaption = SidebarRGB(red: 0.721569, green: 0.741176, blue: 0.819608)
}

/// Shared secondary-caption style across the sidebar's lists, empty states,
/// tab capsule and project foot (#878), replacing scattered `.secondary` calls
/// that fell below 4.5:1 in light mode.
struct SidebarCaption: ShapeStyle {
    func resolve(in environment: EnvironmentValues) -> Color {
        environment.colorScheme == .dark
            ? SidebarPalette.darkCaption.color
            : SidebarPalette.lightCaption.color
    }
}

/// Brand wordmark ink ("Ganymede") in the sidebar header (#896): deep navy in
/// light mode and moon cream in dark mode.
struct SidebarBrand: ShapeStyle {
    func resolve(in environment: EnvironmentValues) -> Color {
        environment.colorScheme == .dark
            ? SidebarPalette.darkBrand.color
            : SidebarPalette.lightInk.color
    }
}

/// Primary ink for non-selected sidebar chrome outside `List` selection
/// highlights (#896): deep navy in light mode, system primary in dark mode.
struct SidebarInk: ShapeStyle {
    func resolve(in environment: EnvironmentValues) -> AnyShapeStyle {
        environment.colorScheme == .dark
            ? AnyShapeStyle(Color.primary)
            : AnyShapeStyle(SidebarPalette.lightInk.color)
    }
}

#if os(macOS)
/// Tints the enclosing `NSGlassEffectView` created by `NavigationSplitView`
/// (#896) rather than painting an unclipped SwiftUI `.background(...)` over
/// `contentView`, so macOS 26 keeps its floating rounded inset corners and
/// macOS 27 keeps its top scroll pocket unobstructed.
struct SidebarGlassTint: NSViewRepresentable {
    func makeNSView(context: Context) -> TintHostView {
        TintHostView()
    }

    func updateNSView(_ view: TintHostView, context: Context) {
        view.applyTintIfNeeded()
    }

    final class TintHostView: NSView {
        private weak var tintedGlass: NSGlassEffectView?
        private var lastAppearance: NSAppearance.Name?

        override func viewDidMoveToSuperview() {
            super.viewDidMoveToSuperview()
            applyTintSoon()
        }

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            applyTintSoon()
        }

        override func viewDidChangeEffectiveAppearance() {
            super.viewDidChangeEffectiveAppearance()
            applyTint(force: true)
        }

        func applyTintIfNeeded() {
            applyTint(force: false)
        }

        private func applyTintSoon() {
            applyTint(force: false)
            DispatchQueue.main.async { [weak self] in
                self?.applyTint(force: false)
            }
        }

        private func applyTint(force: Bool) {
            guard let glass = enclosingGlassEffectView() else { return }
            let match = effectiveAppearance.bestMatch(from: [.darkAqua, .aqua])
            guard force || glass !== tintedGlass || match != lastAppearance else { return }
            glass.tintColor = resolvedTint(for: match)
            tintedGlass = glass
            lastAppearance = match
        }

        private func resolvedTint(for match: NSAppearance.Name?) -> NSColor {
            if let catalog = NSColor(named: "SidebarTint") {
                var resolved: NSColor?
                effectiveAppearance.performAsCurrentDrawingAppearance {
                    resolved = catalog.usingColorSpace(.sRGB)
                }
                if let resolved { return resolved }
            }
            let fallback = match == .darkAqua ? SidebarPalette.darkTint : SidebarPalette.lightTint
            return NSColor(
                srgbRed: fallback.red,
                green: fallback.green,
                blue: fallback.blue,
                alpha: fallback.alpha
            )
        }

        private func enclosingGlassEffectView() -> NSGlassEffectView? {
            var current = superview
            while let view = current {
                if let glass = view as? NSGlassEffectView { return glass }
                current = view.superview
            }
            return nil
        }
    }
}
#endif
