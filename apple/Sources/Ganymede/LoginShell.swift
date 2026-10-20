#if os(macOS)
import Foundation

/// An app opened from the Finder gets launchd's PATH (/usr/bin:/bin:...),
/// so kernelspecs whose argv names `node`, `deno` or `python3` would not
/// start. Take PATH from the user's login shell instead, as a terminal
/// would have it, before the server launches any kernel.
///
/// A login shell can be slow (a long profile, a network home folder), so
/// this runs off the main thread; `AppModel` waits for it before it starts
/// the server.
enum LoginShell {
    static func adoptPath() {
        dispatchPrecondition(condition: .notOnQueue(.main))
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
        let exited = DispatchSemaphore(value: 0)
        process.terminationHandler = { _ in exited.signal() }
        do {
            try process.run()
        } catch {
            return nil
        }
        // A slow or stuck profile must not keep the server from starting.
        if exited.wait(timeout: .now() + 5) == .timedOut {
            process.terminate()
            return nil
        }
        let data = output.fileHandleForReading.readDataToEndOfFile()
        let path = String(decoding: data, as: UTF8.self)
        return path.isEmpty || process.terminationStatus != 0 ? nil : path
    }
}
#endif
