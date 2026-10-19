#if os(macOS)
import Foundation

/// An app opened from the Finder gets launchd's PATH (/usr/bin:/bin:...),
/// so kernelspecs whose argv names `node`, `deno` or `python3` would not
/// start. Take PATH from the user's login shell instead, as a terminal
/// would have it, before the server launches any kernel.
enum LoginShell {
    static func adoptPath() {
        let env = ProcessInfo.processInfo.environment
        let shell = env["SHELL"] ?? "/bin/zsh"
        var paths = loginPath(shell: shell)?.split(separator: ":").map(String.init) ?? []
        // Package managers' usual places, in case the shell set nothing.
        for extra in ["/opt/homebrew/bin", "/usr/local/bin"] where !paths.contains(extra) {
            paths.append(extra)
        }
        for current in (env["PATH"] ?? "").split(separator: ":").map(String.init)
        where !paths.contains(current) {
            paths.append(current)
        }
        setenv("PATH", paths.joined(separator: ":"), 1)
    }

    private static func loginPath(shell: String) -> String? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: shell)
        process.arguments = ["-l", "-c", "printf %s \"$PATH\""]
        let output = Pipe()
        process.standardOutput = output
        process.standardError = FileHandle.nullDevice
        process.standardInput = FileHandle.nullDevice
        do {
            try process.run()
        } catch {
            return nil
        }
        // A slow or stuck profile must not keep the app from starting.
        let deadline = Date().addingTimeInterval(5)
        while process.isRunning && Date() < deadline {
            Thread.sleep(forTimeInterval: 0.05)
        }
        if process.isRunning {
            process.terminate()
            return nil
        }
        let data = output.fileHandleForReading.readDataToEndOfFile()
        let path = String(decoding: data, as: UTF8.self)
        return path.isEmpty || process.terminationStatus != 0 ? nil : path
    }
}
#endif
