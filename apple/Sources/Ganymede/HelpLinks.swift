import SwiftUI

/// The website and docs pages the apps link to (#409): the Mac's and
/// iPad's Help menu and the iPad and iPhone Settings screen.
enum HelpLink: CaseIterable {
    case website, docs, apps

    static let site = URL(string: "https://ganymede-server.com")!

    var title: String {
        switch self {
        case .website: "Ganymede Website"
        case .docs: "Ganymede Documentation"
        case .apps: "Apps Guide"
        }
    }

    var systemImage: String {
        switch self {
        case .website: "globe"
        case .docs: "book"
        case .apps: "questionmark.circle"
        }
    }

    var url: URL {
        switch self {
        case .website: Self.site
        case .docs: Self.site.appending(path: "docs/")
        case .apps: Self.site.appending(path: "docs/ganymede-ui/apps")
        }
    }

    /// The privacy page, for the crash reports question.
    static let privacy = site.appending(path: "docs/privacy")
}

/// The links as menu items, for a Help menu. Buttons rather than `Link`,
/// which the iPadOS menu bar may not show as an item.
struct HelpLinkCommands: View {
    @Environment(\.openURL) private var openURL

    var body: some View {
        ForEach(HelpLink.allCases, id: \.self) { link in
            Button(link.title) { openURL(link.url) }
        }
    }
}
