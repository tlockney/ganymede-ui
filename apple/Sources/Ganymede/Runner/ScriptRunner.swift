import DeviceBridge
import Foundation
import JavaScriptCore

// Runs a script or a notebook's code cells headless, in a JavaScriptCore
// context with no web view (ganymede-device phase 4, #69; a spike, off by
// default: nothing in the app calls it yet). The context gets the engine
// bundle (src/runner, `npm run build:runner`, copied to Resources/runner),
// which installs the polyfills and `device`, strips TypeScript and runs
// the code; this side supplies timers, console, `fetch` over URLSession,
// and the device link. A run is cut off after `timeLimit`.
//
// Limits of the spike: no imports, no `URL` or `Blob`, no heap cap (JSC has
// no public API for one), and a time limit that stops waiting on the run
// but can't interrupt a loop that never yields.

/// What to run.
struct ScriptSource: Equatable {
    /// "typescript" or "javascript".
    var language = "typescript"
    /// A script's source, or a notebook's code cells in order.
    var sources: [String]

    /// A `.ts` or `.js` file's text.
    static func script(_ text: String, language: String = "typescript") -> ScriptSource {
        ScriptSource(language: language, sources: [text])
    }

    /// A notebook's code cells, from its `.ipynb` JSON; its kernel's
    /// language picks TypeScript or JavaScript.
    static func notebook(_ data: Data) throws -> ScriptSource {
        guard let notebook = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let cells = notebook["cells"] as? [[String: Any]]
        else { throw ScriptRunner.Failure("the notebook isn't valid .ipynb JSON") }
        let metadata = notebook["metadata"] as? [String: Any]
        let language = ((metadata?["language_info"] as? [String: Any])?["name"] as? String)?.lowercased()
        let sources = cells.filter { $0["cell_type"] as? String == "code" }.map { cell -> String in
            if let lines = cell["source"] as? [String] { return lines.joined() }
            return cell["source"] as? String ?? ""
        }
        return ScriptSource(language: language == "javascript" ? "javascript" : "typescript", sources: sources)
    }
}

/// How a run ended.
struct ScriptResult: Equatable {
    /// The script's return value as text, if it returned one.
    var value: String?
    /// What it handed back with `device.output(...)`, the last call's.
    var output: RunOutput?
    /// Its console lines, `level: text`.
    var log: [String] = []
    /// Why it failed, if it did.
    var error: String?
}

@MainActor
final class ScriptRunner {
    struct Failure: Error, CustomStringConvertible {
        let description: String
        init(_ description: String) { self.description = description }
    }

    private let bridge: DeviceBridge
    private let notebook: String
    private let input: RunInput
    private let timeLimit: TimeInterval
    private let engineSource: String

    /// `notebook` is the path that keys the ledger, folders and secrets,
    /// as `setNotebook` does for a kernel; `engine` is the bundle's text.
    init(bridge: DeviceBridge, notebook: String, input: RunInput = RunInput(), timeLimit: TimeInterval = 30, engine: String) {
        self.bridge = bridge
        self.notebook = notebook
        self.input = input
        self.timeLimit = timeLimit
        engineSource = engine
    }

    /// The engine bundle the app ships, from Resources/runner/engine.js.
    static func bundledEngine(in bundle: Bundle = .main) -> String? {
        guard let url = bundle.url(forResource: "engine", withExtension: "js", subdirectory: "runner") else { return nil }
        return try? String(contentsOf: url, encoding: .utf8)
    }

    func run(_ source: ScriptSource) async -> ScriptResult {
        var result = ScriptResult()
        guard let context = JSContext() else {
            result.error = "JavaScriptCore didn't start"
            return result
        }
        let device = bridge.engineDevice(headless: true)
        bridge.setNotebook(notebook, for: device.owner)
        device.attachRun(input) { result.output = $0 }
        var timers: [Int: Timer] = [:]
        // Set once `run` returns: a script still holding a timer or a
        // fetch can't start new ones, and late callbacks don't call in.
        var stopped = false
        // The run's own session: no cookies or cache shared with the app
        // or another run, and cancelling it ends a download in flight.
        let session = URLSession(configuration: .ephemeral)
        defer {
            stopped = true
            session.invalidateAndCancel()
            timers.values.forEach { $0.invalidate() }
            device.release()
            bridge.setNotebook(nil, for: device.owner)
        }

        context.exceptionHandler = { _, exception in
            result.log.append("error: \(exception?.toString() ?? "an exception")")
        }
        let log: @convention(block) (String, String) -> Void = { level, text in
            MainActor.assumeIsolated { result.log.append("\(level): \(text)") }
        }
        // Weak: the block is stored in the context, so a strong capture
        // would keep the context, and its VM, alive for good.
        let setTimer: @convention(block) (Int, Double) -> Void = { [weak context] id, ms in
            MainActor.assumeIsolated {
                timers[id]?.invalidate()
                guard !stopped else { return }
                timers[id] = Timer.scheduledTimer(withTimeInterval: ms / 1000, repeats: false) { _ in
                    MainActor.assumeIsolated {
                        timers[id] = nil
                        guard !stopped else { return }
                        context?.objectForKeyedSubscript("__ganymedeFire")?.call(withArguments: [id])
                    }
                }
            }
        }
        let clearTimer: @convention(block) (Int) -> Void = { id in
            MainActor.assumeIsolated {
                timers[id]?.invalidate()
                timers[id] = nil
            }
        }
        let fetch: @convention(block) (String) -> JSValue = { request in
            let context = JSContext.current()!
            return JSValue(newPromiseIn: context) { resolve, _ in
                nonisolated(unsafe) let resolve = resolve
                Task { @MainActor in
                    guard !stopped else { return }
                    let reply = await Self.fetch(request, session: session)
                    guard !stopped else { return }
                    resolve?.call(withArguments: [reply])
                }
            }
        }
        context.setObject(log, forKeyedSubscript: "__ganymedeLog" as NSString)
        context.setObject(setTimer, forKeyedSubscript: "__ganymedeSetTimer" as NSString)
        context.setObject(clearTimer, forKeyedSubscript: "__ganymedeClearTimer" as NSString)
        context.setObject(fetch, forKeyedSubscript: "__ganymedeFetch" as NSString)
        device.install(in: context)
        context.evaluateScript(engineSource)
        guard let runFunction = context.objectForKeyedSubscript("__ganymedeRun"), !runFunction.isUndefined else {
            result.error = "the engine bundle didn't load"
            return result
        }

        let job: [String: Any] = ["language": source.language, "sources": source.sources]
        let jobText = String(data: (try? JSONSerialization.data(withJSONObject: job)) ?? Data(), encoding: .utf8) ?? "{}"
        let reply = await withCheckedContinuation { (done: CheckedContinuation<String?, Never>) in
            var finished = false
            var limit: Timer?
            let finish: (String?) -> Void = { text in
                guard !finished else { return }
                finished = true
                limit?.invalidate()
                done.resume(returning: text)
            }
            let settle: @convention(block) (String) -> Void = { text in MainActor.assumeIsolated { finish(text) } }
            limit = Timer.scheduledTimer(withTimeInterval: timeLimit, repeats: false) { _ in
                MainActor.assumeIsolated { finish(nil) }
            }
            let promise = runFunction.call(withArguments: [jobText])
            promise?.invokeMethod("then", withArguments: [JSValue(object: settle, in: context) as Any])
        }
        guard let reply else {
            result.error = "the run took longer than \(String(format: "%g", timeLimit)) seconds and was stopped"
            return result
        }
        guard let answer = (try? JSONSerialization.jsonObject(with: Data(reply.utf8))) as? [String: Any] else {
            result.error = "the engine's reply isn't JSON"
            return result
        }
        if answer["ok"] as? Bool == true {
            result.value = answer["value"] as? String
        } else {
            result.error = answer["error"] as? String ?? "the run failed"
        }
        return result
    }

    /// One `fetch`: the request as JSON text in, the response as JSON text
    /// out, body as base64. Only http and https. The 16 MiB cap applies
    /// after the download (#437 notes it).
    nonisolated static func fetch(_ request: String, session: URLSession) async -> String {
        func reply(_ object: [String: Any]) -> String {
            String(data: (try? JSONSerialization.data(withJSONObject: object)) ?? Data(), encoding: .utf8) ?? "{}"
        }
        guard let fields = (try? JSONSerialization.jsonObject(with: Data(request.utf8))) as? [String: Any],
              let link = fields["url"] as? String, let url = URL(string: link),
              url.scheme == "http" || url.scheme == "https"
        else { return reply(["error": "fetch takes an http or https URL"]) }
        var call = URLRequest(url: url, timeoutInterval: 20)
        call.httpMethod = fields["method"] as? String ?? "GET"
        for (name, value) in fields["headers"] as? [String: String] ?? [:] {
            call.setValue(value, forHTTPHeaderField: name)
        }
        if let body = fields["body"] as? String { call.httpBody = Data(base64Encoded: body) }
        do {
            let (data, response) = try await session.data(for: call)
            guard data.count <= DeviceBridge.maxBinaryBytes else { return reply(["error": "the response is over 16 MiB"]) }
            let http = response as? HTTPURLResponse
            var headers: [String: String] = [:]
            for (name, value) in http?.allHeaderFields ?? [:] {
                headers["\(name)"] = "\(value)"
            }
            return reply([
                "status": http?.statusCode ?? 200,
                "statusText": HTTPURLResponse.localizedString(forStatusCode: http?.statusCode ?? 200),
                "url": response.url?.absoluteString ?? link,
                "headers": headers,
                "body": data.base64EncodedString(),
            ])
        } catch {
            return reply(["error": error.localizedDescription])
        }
    }
}
