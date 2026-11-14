import Foundation

/// How the iPad/iPhone SSH client signs in (#630, ganymede#816): what it
/// offers, in order, and how a server's banner shows in the terminal.
/// Apart from swift-nio-ssh, so the Mac tests cover it too.
enum SSHSignIn {
    enum Offer: Equatable {
        /// No credentials. Tailscale SSH signs a tailnet device in this
        /// way, by its tailnet identity; other servers refuse it and list
        /// what they take, as with OpenSSH's own client.
        case none
        /// The app's key.
        case key
    }

    /// What to offer next, given what was offered already and whether the
    /// server takes keys; nil when there is nothing left to try.
    static func next(offered: [Offer], keysAccepted: Bool) -> Offer? {
        if !offered.contains(.none) { return Offer.none }
        if !offered.contains(.key), keysAccepted { return .key }
        return nil
    }

    /// How long to wait for the server to finish signing in: longer once
    /// it has sent a banner, which in Tailscale SSH's check mode asks the
    /// person to approve the sign-in in a browser first.
    static func timeLimit(bannerShown: Bool) -> Int {
        bannerShown ? 300 : 30
    }

    /// A banner as terminal output: without control characters, which
    /// could move the cursor or change the terminal, with lines ending in
    /// CRLF, and with http(s) links made tappable (OSC 8).
    static func banner(_ message: String) -> [UInt8] {
        let lines = message
            .replacingOccurrences(of: "\r\n", with: "\n")
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line in
                String(String.UnicodeScalarView(line.unicodeScalars.filter { scalar in
                    scalar == "\t" || !(scalar.value < 0x20 || (0x7F...0x9F).contains(scalar.value))
                }))
            }
        var text = lines.map(linked).joined(separator: "\r\n")
        if !text.hasSuffix("\r\n") { text += "\r\n" }
        return Array(text.utf8)
    }

    /// `line` with each http(s) link wrapped in an OSC 8 hyperlink.
    private static func linked(_ line: String) -> String {
        var out = ""
        var rest = line[...]
        while let match = rest.firstMatch(of: link) {
            var url = match.output[...]
            // Punctuation that ends a sentence isn't part of the link.
            while let last = url.last, ".,;:!?)'\"".contains(last) { url = url.dropLast() }
            out += rest[..<match.range.lowerBound]
            out += "\u{1B}]8;;\(url)\u{1B}\\\(url)\u{1B}]8;;\u{1B}\\"
            rest = rest[url.endIndex...]
        }
        return out + rest
    }

    private static let link = try! Regex<Substring>("https?://[^\\s]+")
}
