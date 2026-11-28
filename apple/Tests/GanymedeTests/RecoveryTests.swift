#if os(iOS)
import Darwin
import Foundation
import XCTest

/// iOS Simulator verification for embedded `ServerHost` container paths and
/// room recovery copies (tlockney/ganymede#957, #960).
final class RecoveryTests: XCTestCase {
    private var root: URL!
    private var web: URL!
    private var support: URL!
    private var cookieSecret: URL!

    override func setUpWithError() throws {
        let fm = FileManager.default
        root = fm.temporaryDirectory.appendingPathComponent("RecoveryTests-\(UUID().uuidString)", isDirectory: true)
        web = root.appendingPathComponent("web", isDirectory: true)
        try fm.createDirectory(at: web, withIntermediateDirectories: true)
        try "<!doctype html><title>recovery test</title>"
            .write(to: web.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
        support = try fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        cookieSecret = support.appendingPathComponent("recovery-test-cookie-\(UUID().uuidString)")
    }

    override func tearDownWithError() throws {
        if let root { try? FileManager.default.removeItem(at: root) }
        if let cookieSecret { try? FileManager.default.removeItem(at: cookieSecret) }
    }

    private func startServer() throws -> ServerHost {
        try ServerHost(config: [
            "root_dir": root.path,
            "static_dir": web.path,
            "cookie_secret_file": cookieSecret.path,
            "port": 0,
            "quiet": true,
        ])
    }

    private func request(
        _ host: ServerHost,
        _ method: String,
        _ path: String,
        query: [URLQueryItem] = [],
        body: Any? = nil
    ) async throws -> (Int, Data) {
        var components = try XCTUnwrap(URLComponents(url: host.url, resolvingAgainstBaseURL: false))
        let token = components.queryItems?.first { $0.name == "token" }?.value ?? ""
        components.path = path
        components.queryItems = query.isEmpty ? nil : query
        var req = URLRequest(url: try XCTUnwrap(components.url))
        req.httpMethod = method
        req.setValue("token \(token)", forHTTPHeaderField: "Authorization")
        if let body {
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        return (status, data)
    }

    private func json(_ data: Data) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    /// Verifies iOS Simulator app-container paths (`$HOME/Library/Application Support`),
    /// contents API, collaboration session creation, and registered kernel execution.
    func testIOSContainerAndRoomSessionBehavior() async throws {
        let home = URL(fileURLWithPath: NSHomeDirectory(), isDirectory: true)
            .standardizedFileURL.resolvingSymlinksInPath()
        let resolvedSupport = support.standardizedFileURL.resolvingSymlinksInPath()
        XCTAssertTrue(
            resolvedSupport.path.hasPrefix(home.path + "/"),
            "Expected Application Support (\(resolvedSupport.path)) inside simulator container (\(home.path))"
        )
        XCTAssertTrue(resolvedSupport.path.hasSuffix("/Library/Application Support"), resolvedSupport.path)

        let host = try startServer()
        defer { host.stop() }

        let kernel = ExecuteAppKernel()
        try host.register(spec: [
            "name": "recovery-test-ts",
            "display_name": "Recovery Test TS",
            "language": "typescript",
        ]) { event, kernels in
            kernel.handle(event, kernels)
        }

        let (listStatus, _) = try await request(host, "GET", "/api/contents")
        XCTAssertEqual(listStatus, 200)

        let notebook: [String: Any] = [
            "type": "notebook",
            "format": "json",
            "content": [
                "cells": [
                    [
                        "id": "c1",
                        "cell_type": "code",
                        "source": "console.log('hi')",
                        "metadata": [:],
                        "outputs": [],
                        "execution_count": NSNull(),
                    ],
                ],
                "metadata": ["kernelspec": ["name": "recovery-test-ts", "display_name": "Recovery Test TS"]],
                "nbformat": 4,
                "nbformat_minor": 5,
            ],
        ]
        let (putStatus, putData) = try await request(host, "PUT", "/api/contents/container.ipynb", body: notebook)
        XCTAssertTrue((200..<300).contains(putStatus), String(decoding: putData, as: UTF8.self))

        let (getStatus, getData) = try await request(host, "GET", "/api/contents/container.ipynb", query: [
            URLQueryItem(name: "content", value: "1"),
        ])
        XCTAssertEqual(getStatus, 200)
        XCTAssertEqual(try json(getData)["type"] as? String, "notebook")

        let (collabStatus, collabData) = try await request(
            host, "PUT", "/api/collaboration/session/container.ipynb",
            body: ["format": "json", "type": "notebook"]
        )
        XCTAssertTrue((200..<300).contains(collabStatus), String(decoding: collabData, as: UTF8.self))
        let session = try json(collabData)
        XCTAssertNotNil(session["fileId"] as? String)
        XCTAssertNotNil(session["sessionId"] as? String)

        let (roomsStatus, roomsData) = try await request(host, "GET", "/api/collaboration/rooms")
        XCTAssertEqual(roomsStatus, 200, String(decoding: roomsData, as: UTF8.self))
    }

    /// Probes `GET /api/collaboration/recovery`; skips cleanly on older FFI builds
    /// without `#960`, and otherwise verifies that an unsaved room whose save fails
    /// writes a recovery copy under
    /// `<app-container>/Library/Application Support/ganymede/recovery` and serves it
    /// via `GET /api/collaboration/recovery?path=...`, `GET /api/collaboration/recovery/{id}`,
    /// and `DELETE /api/collaboration/recovery/{id}`.
    func testRecoveryCopiesInIOSAppContainerAndRoutes() async throws {
        let fm = FileManager.default
        let folder = root.appendingPathComponent("sub", isDirectory: true)
        try fm.createDirectory(at: folder, withIntermediateDirectories: true)
        let notebookFile = folder.appendingPathComponent("recover.ipynb")
        defer {
            try? fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: folder.path)
            try? fm.setAttributes([.posixPermissions: 0o644], ofItemAtPath: notebookFile.path)
        }

        let initialHost = try startServer()
        let (probeStatus, probeData) = try await request(
            initialHost, "GET", "/api/collaboration/recovery",
            query: [URLQueryItem(name: "path", value: "sub/recover.ipynb")]
        )
        let probeText = String(decoding: probeData, as: UTF8.self)
        if probeStatus == 404 {
            initialHost.stop()
            if probeText.contains("this server keeps no recovery copies") {
                XCTFail("Recovery routes exist (tlockney/ganymede#960) but no recovery directory was configured on iOS: \(probeText)")
            }
            throw XCTSkip("Room recovery routes require tlockney/ganymede#960 (>= v0.17.0); current embedded server returned 404.")
        }
        XCTAssertEqual(probeStatus, 200, probeText)

        let recoveryRoot = support.appendingPathComponent("ganymede/recovery", isDirectory: true)
        XCTAssertTrue(
            fm.fileExists(atPath: recoveryRoot.path),
            "Expected recovery directory at \(recoveryRoot.path)"
        )

        let notebook: [String: Any] = [
            "type": "notebook",
            "format": "json",
            "content": [
                "cells": [
                    [
                        "id": "c1",
                        "cell_type": "code",
                        "source": "console.log('recovered-edit')",
                        "metadata": [:],
                        "outputs": [],
                        "execution_count": NSNull(),
                    ],
                ],
                "metadata": ["kernelspec": ["name": "recovery-test-ts", "display_name": "Recovery Test TS"]],
                "nbformat": 4,
                "nbformat_minor": 5,
            ],
        ]
        let (putStatus, putData) = try await request(initialHost, "PUT", "/api/contents/sub/recover.ipynb", body: notebook)
        XCTAssertTrue((200..<300).contains(putStatus), String(decoding: putData, as: UTF8.self))

        let (indexStatus, indexData) = try await request(initialHost, "POST", "/api/fileid/index", query: [
            URLQueryItem(name: "path", value: "sub/recover.ipynb"),
        ])
        XCTAssertEqual(indexStatus, 200)
        let fileID = try XCTUnwrap(try json(indexData)["id"] as? String)

        let notebookPath = notebookFile.path
        let folderPath = folder.path
        let kernel = ExecuteAppKernel(outputText: "recovered-edit\n") {
            // Make saving fail on flush while keeping the file readable.
            try? FileManager.default.setAttributes([.posixPermissions: 0o444], ofItemAtPath: notebookPath)
            try? FileManager.default.setAttributes([.posixPermissions: 0o555], ofItemAtPath: folderPath)
        }
        try initialHost.register(spec: [
            "name": "recovery-test-ts",
            "display_name": "Recovery Test TS",
            "language": "typescript",
        ]) { event, kernels in
            kernel.handle(event, kernels)
        }

        let (sessionStatus, sessionData) = try await request(initialHost, "POST", "/api/sessions", body: [
            "path": "sub/recover.ipynb",
            "name": "recover.ipynb",
            "type": "notebook",
            "kernel": ["name": "recovery-test-ts"],
        ])
        XCTAssertEqual(sessionStatus, 201, String(decoding: sessionData, as: UTF8.self))
        let kernelID = try XCTUnwrap((try json(sessionData)["kernel"] as? [String: Any])?["id"] as? String)

        let (execStatus, execData) = try await request(initialHost, "POST", "/api/kernels/\(kernelID)/execute", body: [
            "document_id": "json:notebook:\(fileID)",
            "cells": [["cell_id": "c1"]],
            "wait": 10,
        ])
        XCTAssertEqual(execStatus, 200, String(decoding: execData, as: UTF8.self))
        XCTAssertEqual(try json(execData)["finished"] as? Bool, true)

        // Stopping flushes the dirty room; saving fails and keeps a recovery copy.
        initialHost.stop()

        try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: folder.path)
        try fm.setAttributes([.posixPermissions: 0o644], ofItemAtPath: notebookFile.path)

        let restartedHost = try startServer()
        defer { restartedHost.stop() }

        let (listStatus, listData) = try await request(
            restartedHost, "GET", "/api/collaboration/recovery",
            query: [URLQueryItem(name: "path", value: "sub/recover.ipynb")]
        )
        XCTAssertEqual(listStatus, 200, String(decoding: listData, as: UTF8.self))
        let copies = try XCTUnwrap(try json(listData)["copies"] as? [[String: Any]])
        XCTAssertEqual(copies.count, 1, "Expected one recovery copy: \(copies)")
        let copy = try XCTUnwrap(copies.first)
        let copyID = try XCTUnwrap(copy["id"] as? String)
        XCTAssertEqual(copy["path"] as? String, "sub/recover.ipynb")
        XCTAssertEqual(copy["reason"] as? String, "save_failed")
        XCTAssertNil(copy["file"], "Recovery route must not leak absolute container paths")

        let (getStatus, getData) = try await request(restartedHost, "GET", "/api/collaboration/recovery/\(copyID)")
        XCTAssertEqual(getStatus, 200, String(decoding: getData, as: UTF8.self))
        let copyDetail = try json(getData)
        XCTAssertEqual(copyDetail["path"] as? String, "sub/recover.ipynb")
        XCTAssertNil(copyDetail["file"])
        let content = try XCTUnwrap(copyDetail["content"] as? [String: Any])
        let cells = try XCTUnwrap(content["cells"] as? [[String: Any]])
        let outputs = try XCTUnwrap(cells.first?["outputs"] as? [[String: Any]])
        let outputText = outputs.compactMap { output -> String? in
            if let text = output["text"] as? String { return text }
            if let lines = output["text"] as? [String] { return lines.joined() }
            return nil
        }.joined()
        XCTAssertTrue(outputText.contains("recovered-edit"), "Expected saved room edit in recovery copy: \(outputs)")

        let (deleteStatus, _) = try await request(restartedHost, "DELETE", "/api/collaboration/recovery/\(copyID)")
        XCTAssertEqual(deleteStatus, 204)

        let (afterDeleteStatus, afterDeleteData) = try await request(
            restartedHost, "GET", "/api/collaboration/recovery",
            query: [URLQueryItem(name: "path", value: "sub/recover.ipynb")]
        )
        XCTAssertEqual(afterDeleteStatus, 200)
        XCTAssertEqual((try json(afterDeleteData)["copies"] as? [[String: Any]])?.isEmpty, true)
    }
}

/// Minimal registered kernel supporting `kernel_info_request`, `execute_request`,
/// and `shutdown_request` for iOS room-recovery tests.
private final class ExecuteAppKernel: @unchecked Sendable {
    private let lock = NSLock()
    private var runs: [String: Int] = [:]
    private let queue = DispatchQueue(label: "recovery-test-kernel")
    private let outputText: String
    private let beforeExecuteOutput: @Sendable () -> Void

    init(outputText: String = "ok\n", beforeExecuteOutput: @escaping @Sendable () -> Void = {}) {
        self.outputText = outputText
        self.beforeExecuteOutput = beforeExecuteOutput
    }

    func handle(_ event: KernelEvent, _ kernels: RegisteredKernels) {
        switch event {
        case .start(let kernel, let run, _):
            lock.withLock { runs[kernel] = run }
        case .stop(let kernel):
            lock.withLock { runs[kernel] = nil }
        case .send(let kernel, let channel, let message):
            guard let request = try? JSONSerialization.jsonObject(with: Data(message.utf8)) as? [String: Any],
                  let header = request["header"] as? [String: Any],
                  let type = header["msg_type"] as? String,
                  let run = lock.withLock({ runs[kernel] })
            else { return }
            let outputText = self.outputText
            let beforeExecuteOutput = self.beforeExecuteOutput
            queue.async {
                kernels.deliver(kernel, run: run, channel: "iopub", message: Self.message("status", ["execution_state": "busy"], parent: header))
                switch type {
                case "kernel_info_request":
                    kernels.deliver(kernel, run: run, channel: channel, message: Self.message("kernel_info_reply", [
                        "status": "ok",
                        "protocol_version": "5.3",
                        "implementation": "recovery-test",
                        "implementation_version": "1",
                        "banner": "",
                        "language_info": ["name": "typescript", "version": "5", "file_extension": ".ts"],
                    ], parent: header))
                case "execute_request":
                    beforeExecuteOutput()
                    let code = (request["content"] as? [String: Any])?["code"] as? String ?? ""
                    kernels.deliver(kernel, run: run, channel: "iopub", message: Self.message("execute_input", [
                        "code": code,
                        "execution_count": 1,
                    ], parent: header))
                    kernels.deliver(kernel, run: run, channel: "iopub", message: Self.message("stream", [
                        "name": "stdout",
                        "text": outputText,
                    ], parent: header))
                    kernels.deliver(kernel, run: run, channel: channel, message: Self.message("execute_reply", [
                        "status": "ok",
                        "execution_count": 1,
                    ], parent: header))
                case "shutdown_request":
                    kernels.deliver(kernel, run: run, channel: channel, message: Self.message("shutdown_reply", [
                        "status": "ok",
                        "restart": false,
                    ], parent: header))
                default:
                    break
                }
                kernels.deliver(kernel, run: run, channel: "iopub", message: Self.message("status", ["execution_state": "idle"], parent: header))
            }
        }
    }

    private static func message(_ type: String, _ content: [String: Any], parent: [String: Any]) -> String {
        let payload: [String: Any] = [
            "header": [
                "msg_id": UUID().uuidString,
                "msg_type": type,
                "session": "recovery-test",
                "username": "",
                "date": "2026-11-28T00:00:00Z",
                "version": "5.3",
            ],
            "parent_header": parent,
            "metadata": [String: Any](),
            "content": content,
        ]
        let data = try! JSONSerialization.data(withJSONObject: payload)
        return String(decoding: data, as: UTF8.self)
    }
}
#endif
