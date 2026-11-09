// Release-time helper for the Mac app's update signing key (#411). The
// key is SPARKLE_ED_PRIVATE_KEY: the base64 32-byte EdDSA seed that
// Sparkle's `generate_keys -x` exports.
//
//   swift sparkle-key.swift public-key
//       prints the public key, for the app's SUPublicEDKey
//   swift sparkle-key.swift verify <file> <signature>
//       checks a signature from `sign_update` against that public key, so
//       the key built into the app is the one that signed the update
import CryptoKit
import Foundation

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("sparkle-key: \(message)\n".utf8))
    exit(1)
}

let secret = (ProcessInfo.processInfo.environment["SPARKLE_ED_PRIVATE_KEY"] ?? "")
    .trimmingCharacters(in: .whitespacesAndNewlines)
guard !secret.isEmpty else { fail("SPARKLE_ED_PRIVATE_KEY is not set") }
guard let seed = Data(base64Encoded: secret), seed.count == 32 else {
    fail("SPARKLE_ED_PRIVATE_KEY is not a base64 32-byte key; export it with generate_keys -x")
}
let key: Curve25519.Signing.PrivateKey
do {
    key = try Curve25519.Signing.PrivateKey(rawRepresentation: seed)
} catch {
    fail("SPARKLE_ED_PRIVATE_KEY: \(error)")
}
let args = CommandLine.arguments.dropFirst()

switch args.first {
case "public-key":
    print(key.publicKey.rawRepresentation.base64EncodedString())
case "verify" where args.count == 3:
    let path = args[args.startIndex + 1]
    let signature = args[args.startIndex + 2]
    guard let data = FileManager.default.contents(atPath: path) else { fail("can't read \(path)") }
    guard let bytes = Data(base64Encoded: signature) else { fail("the signature is not base64") }
    guard key.publicKey.isValidSignature(bytes, for: data) else {
        fail("\(path): the signature doesn't match the public key")
    }
default:
    fail("usage: sparkle-key.swift public-key | verify <file> <signature>")
}
