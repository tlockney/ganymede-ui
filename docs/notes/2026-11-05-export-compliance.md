## 2026-11-05, export compliance in the Info.plist (#322)

Each build uploaded to App Store Connect stopped at "Missing Compliance"
until someone answered the encryption questions by hand. The Mac and iOS
app Info.plists now set `ITSAppUsesNonExemptEncryption` to `NO`.

What the apps ship: HTTPS through system APIs (web view, Sentry), SSH on
the Mac through `/usr/bin/ssh`, SSH on iOS through swift-nio-ssh on
CryptoKit, Ed25519 keys through CryptoKit, and TLS to a remote Jupyter
server in the Rust core through rustls with ring. All standard
algorithms; none custom. The rustls/ring TLS is the one piece not done by
the OS.
