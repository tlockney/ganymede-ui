#if os(macOS)
import AppIntents
import Foundation
import UniformTypeIdentifiers
import XCTest

/// Direct `.perform()` tests for `NotebookIntents` (#302, #303, #472 on #399)
/// using `IntentServer.environment` with `NotebookActionsTests.FakeServer`,
/// `URLRunPermissions`, and a real in-process `ServerHost`.
@MainActor
final class NotebookIntentsTests: XCTestCase {
    private var root: URL!
    private var fake: NotebookActionsTests.FakeServer!
    private var opened: [URL] = []
    private var suiteName: String!
    private var defaults: UserDefaults!
    private var permissions: URLRunPermissions!
    private var promptHandler: ((URL, String?, String?) -> Bool)!
    private var promptCount = 0
    private var savedEnvironment: IntentServer.Environment!

    override func setUpWithError() throws {
        savedEnvironment = IntentServer.environment
        NotebookFinder.clearCache()

        let fm = FileManager.default
        root = fm.temporaryDirectory.appendingPathComponent("NotebookIntentsTests-\(UUID().uuidString)", isDirectory: true)
        try fm.createDirectory(at: root, withIntermediateDirectories: true)

        fake = NotebookActionsTests.FakeServer()
        opened = []
        promptCount = 0
        suiteName = "NotebookIntentsTests-\(UUID().uuidString)"
        defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        permissions = URLRunPermissions(defaults: defaults, log: nil)
        promptHandler = { _, _, _ in true }

        installFakeEnvironment()
    }

    override func tearDownWithError() throws {
        IntentServer.environment = savedEnvironment
        NotebookFinder.clearCache()
        if let suiteName {
            defaults?.removePersistentDomain(forName: suiteName)
        }
        if let root {
            try? FileManager.default.removeItem(at: root)
        }
    }

    private func installFakeEnvironment() {
        let serverRoot = root!
        let fakeServer = fake!
        let actions = NotebookActions(
            server: ServerEndpoint(base: URL(string: "http://127.0.0.1:1/")!, token: "secret"),
            send: { fakeServer.respond($0) }
        )
        IntentServer.environment = IntentServer.Environment(
            actions: { actions },
            serverRootFolder: { serverRoot },
            searchRoot: { serverRoot },
            recentNotebooks: { [] },
            open: { [weak self] url in self?.opened.append(url) },
            confirmRun: { [weak self] url, cell, params in
                guard let self else { throw AppURLError.cancelled }
                let withParams = params != nil
                if self.permissions.allows(url, sendingTo: AppURL.shortcutsDestination, withParameters: withParams) {
                    return
                }
                self.promptCount += 1
                guard self.promptHandler(url, cell, params) else {
                    throw AppURLError.cancelled
                }
                self.permissions.allow(url, sendingTo: AppURL.shortcutsDestination, withParameters: withParams)
            }
        )
    }

    private func notebookURL(_ name: String) -> URL {
        root.appendingPathComponent(name, isDirectory: false)
    }

    private func writeNotebookFile(_ name: String) throws -> URL {
        let url = notebookURL(name)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try #"{"cells":[],"metadata":{},"nbformat":4,"nbformat_minor":5}"#
            .write(to: url, atomically: true, encoding: .utf8)
        return url
    }

    private func stubSessionAndNotebook(path: String, kernelID: String = "k1", cells: [[String: Any]] = []) {
        fake.on("GET /api/contents/\(path)", [
            "type": "notebook",
            "path": path,
            "content": [
                "cells": cells,
                "metadata": ["kernelspec": ["name": "python3", "display_name": "Python 3"]],
                "nbformat": 4,
                "nbformat_minor": 5,
            ],
        ])
        fake.on("GET /api/sessions", [Any]())
        fake.on("POST /api/sessions", status: 201, ["id": "s1", "kernel": ["id": kernelID]])
        fake.on("POST /api/fileid/index", ["id": "f1", "path": path])
        fake.on("POST /api/kernels/\(kernelID)/restart", ["id": kernelID])
    }

    private static func body(_ request: URLRequest) -> [String: Any] {
        request.httpBody.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
    }

    // MARK: RunNotebookIntent

    func testRunNotebookIntentReturnsOutputsOnSuccess() async throws {
        let nbURL = try writeNotebookFile("report.ipynb")
        let png = Data([0x89, 0x50, 0x4E, 0x47])
        stubSessionAndNotebook(path: "report.ipynb", cells: [
            ["cell_type": "code", "id": "c1", "source": "print('ok')", "metadata": [:], "outputs": [], "execution_count": NSNull()],
        ])
        fake.on("POST /api/kernels/k1/execute", [
            "finished": true,
            "cells": [
                [
                    "cell_type": "code",
                    "id": "c1",
                    "source": "print('ok')",
                    "metadata": [:],
                    "execution_count": 1,
                    "outputs": [
                        ["output_type": "stream", "name": "stdout", "text": "hello\n"],
                        [
                            "output_type": "execute_result",
                            "execution_count": 1,
                            "metadata": [:],
                            "data": ["text/plain": "42", "application/json": ["answer": 42]],
                        ],
                        [
                            "output_type": "display_data",
                            "metadata": [:],
                            "data": ["image/png": png.base64EncodedString(), "text/plain": "<Plot>"],
                        ],
                    ],
                ],
            ],
        ])

        let intent = RunNotebookIntent()
        intent.notebook = NotebookEntity(url: nbURL)
        intent.restart = true
        intent.timeout = 45
        let result = try await intent.perform()
        let entities = try XCTUnwrap(result.value)

        XCTAssertEqual(entities.count, 3)
        XCTAssertEqual(entities[0].cell, "c1")
        XCTAssertEqual(entities[0].kind, "stream")
        XCTAssertEqual(entities[0].text, "hello\n")
        XCTAssertEqual(entities[1].kind, "result")
        XCTAssertEqual(entities[1].text, "42")
        XCTAssertTrue(entities[1].json?.contains("\"answer\" : 42") == true)
        XCTAssertEqual(entities[2].kind, "display")
        XCTAssertEqual(entities[2].text, "<Plot>")
        XCTAssertEqual(entities[2].image?.data, png)
        XCTAssertEqual(entities[2].image?.filename, "c1-3.png")

        XCTAssertEqual(fake.calls("POST /api/kernels/k1/restart").count, 1)
        let executeBody = Self.body(try XCTUnwrap(fake.calls("POST /api/kernels/k1/execute").first))
        XCTAssertEqual(executeBody["wait"] as? Int, 45)
    }

    func testRunNotebookIntentThrowsCellFailedError() async throws {
        let nbURL = try writeNotebookFile("failing.ipynb")
        stubSessionAndNotebook(path: "failing.ipynb", cells: [
            ["cell_type": "code", "id": "bad", "source": "1/0", "metadata": [:], "outputs": [], "execution_count": NSNull()],
        ])
        fake.on("POST /api/kernels/k1/execute", [
            "finished": true,
            "cells": [
                [
                    "cell_type": "code",
                    "id": "bad",
                    "source": "1/0",
                    "metadata": [:],
                    "execution_count": 1,
                    "outputs": [
                        ["output_type": "error", "ename": "ZeroDivisionError", "evalue": "division by zero", "traceback": []],
                    ],
                ],
            ],
        ])

        let intent = RunNotebookIntent()
        intent.notebook = NotebookEntity(url: nbURL)
        intent.restart = false
        intent.timeout = 10
        do {
            _ = try await intent.perform()
            XCTFail("Expected cellFailed error")
        } catch {
            XCTAssertEqual(error as? NotebookActionError, .cellFailed(cell: "bad", name: "ZeroDivisionError", value: "division by zero"))
        }
    }

    func testRunNotebookIntentRespectsPermissionConfirmationAndRejection() async throws {
        let nbURL = try writeNotebookFile("guarded.ipynb")
        stubSessionAndNotebook(path: "guarded.ipynb", cells: [
            ["cell_type": "code", "id": "c1", "source": "1", "metadata": [:], "outputs": [], "execution_count": NSNull()],
        ])
        fake.on("POST /api/kernels/k1/execute", [
            "finished": true,
            "cells": [["cell_type": "code", "id": "c1", "source": "1", "metadata": [:], "outputs": [], "execution_count": 1]],
        ])

        // Rejection stops before touching the server.
        promptHandler = { _, _, _ in false }
        let denied = RunNotebookIntent()
        denied.notebook = NotebookEntity(url: nbURL)
        denied.restart = false
        denied.timeout = 10
        do {
            _ = try await denied.perform()
            XCTFail("Expected AppURLError.cancelled")
        } catch {
            XCTAssertEqual(error as? AppURLError, .cancelled)
        }
        XCTAssertTrue(fake.requests.isEmpty, "Rejected run must not contact the server")
        XCTAssertEqual(promptCount, 1)

        // Approval runs and remembers "Always allow" for subsequent non-parameter runs.
        promptHandler = { _, _, _ in true }
        let allowed = RunNotebookIntent()
        allowed.notebook = NotebookEntity(url: nbURL)
        allowed.restart = false
        allowed.timeout = 10
        _ = try await allowed.perform()
        XCTAssertEqual(promptCount, 2)
        XCTAssertEqual(fake.calls("POST /api/kernels/k1/execute").count, 1)

        // Second run uses stored permission without prompting again.
        _ = try await allowed.perform()
        XCTAssertEqual(promptCount, 2)
        XCTAssertEqual(fake.calls("POST /api/kernels/k1/execute").count, 2)
    }

    // MARK: NewNotebookIntent

    func testNewNotebookIntentCreatesEmptyAndTemplateNotebooks() async throws {
        let folder = root.appendingPathComponent("notes", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let templateURL = try writeNotebookFile("templates/base.ipynb")

        fake.on("GET /api/contents/notes/Daily.ipynb", status: 404, ["message": "not found"])
        fake.on("PUT /api/contents/notes/Daily.ipynb", status: 201, ["type": "notebook", "path": "notes/Daily.ipynb"])

        let emptyIntent = NewNotebookIntent()
        emptyIntent.folder = IntentFile(fileURL: folder)
        emptyIntent.name = "Daily"
        emptyIntent.open = true
        let emptyResult = try await emptyIntent.perform()
        let created = try XCTUnwrap(emptyResult.value)
        XCTAssertEqual(created.url.standardizedFileURL.path, folder.appendingPathComponent("Daily.ipynb").standardizedFileURL.path)
        XCTAssertEqual(opened.map(\.path), [created.url.path])

        // Template creation with open = false does not open a window.
        fake.on("GET /api/contents/notes/FromTemplate.ipynb", status: 404, ["message": "not found"])
        fake.on("GET /api/contents/templates/base.ipynb", [
            "type": "notebook",
            "path": "templates/base.ipynb",
            "content": [
                "cells": [["cell_type": "code", "id": "t1", "source": "x = 1", "metadata": [:], "outputs": []]],
                "metadata": [:],
                "nbformat": 4,
                "nbformat_minor": 5,
            ],
        ])
        fake.on("PUT /api/contents/notes/FromTemplate.ipynb", status: 201, ["type": "notebook", "path": "notes/FromTemplate.ipynb"])

        let templateIntent = NewNotebookIntent()
        templateIntent.folder = IntentFile(fileURL: folder)
        templateIntent.name = "FromTemplate"
        templateIntent.template = NotebookEntity(url: templateURL)
        templateIntent.open = false
        let templateResult = try await templateIntent.perform()
        XCTAssertEqual(templateResult.value?.url.lastPathComponent, "FromTemplate.ipynb")
        XCTAssertEqual(opened.count, 1, "open = false must not call IntentServer.open")

        let putBody = Self.body(try XCTUnwrap(fake.calls("PUT /api/contents/notes/FromTemplate.ipynb").first))
        let cells = (putBody["content"] as? [String: Any])?["cells"] as? [[String: Any]]
        XCTAssertEqual(cells?.first?["source"] as? String, "x = 1")
    }

    func testNewListAndReadIntentsAgainstRealServerHost() async throws {
        let web = root.appendingPathComponent("web", isDirectory: true)
        let notes = root.appendingPathComponent("notes", isDirectory: true)
        try FileManager.default.createDirectory(at: web, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: notes, withIntermediateDirectories: true)
        try "<!doctype html>".write(to: web.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)

        let host = try ServerHost(config: [
            "root_dir": root.path,
            "static_dir": web.path,
            "cookie_secret_file": root.appendingPathComponent("cookie_secret").path,
            "port": 0,
            "quiet": true,
        ])
        defer { host.stop() }
        let endpoint = try XCTUnwrap(ServerEndpoint(serverURL: host.url))
        let realActions = NotebookActions(server: endpoint)
        IntentServer.environment.actions = { realActions }

        let create = NewNotebookIntent()
        create.folder = IntentFile(fileURL: notes)
        create.name = "RealSmoke"
        create.open = false
        let createResult = try await create.perform()
        let createdEntity = try XCTUnwrap(createResult.value)
        XCTAssertEqual(createdEntity.url.lastPathComponent, "RealSmoke.ipynb")

        let list = ListNotebooksIntent()
        list.folder = IntentFile(fileURL: notes)
        let listResult = try await list.perform()
        let listed = try XCTUnwrap(listResult.value)
        XCTAssertEqual(listed.map(\.id), [createdEntity.id])

        let read = ReadOutputsIntent()
        read.notebook = createdEntity
        let readResult = try await read.perform()
        let outputs = try XCTUnwrap(readResult.value)
        XCTAssertTrue(outputs.isEmpty)
    }

    // MARK: KernelControlIntent

    func testKernelControlIntentRestartAndInterrupt() async throws {
        let nbURL = try writeNotebookFile("kernel.ipynb")
        stubSessionAndNotebook(path: "kernel.ipynb", kernelID: "k-live")

        let restart = KernelControlIntent()
        restart.action = .restart
        restart.notebook = NotebookEntity(url: nbURL)
        let restartReply = try await restart.perform()
        XCTAssertEqual(restartReply.value, "Restarted the kernel of kernel.ipynb")
        XCTAssertEqual(fake.calls("POST /api/kernels/k-live/restart").count, 1)

        // Interrupt fails cleanly when no session is running.
        fake.on("GET /api/sessions", [Any]())
        let interrupt = KernelControlIntent()
        interrupt.action = .interrupt
        interrupt.notebook = NotebookEntity(url: nbURL)
        do {
            _ = try await interrupt.perform()
            XCTFail("Expected noKernel error")
        } catch {
            XCTAssertEqual(error as? NotebookActionError, .noKernel("kernel.ipynb"))
        }

        // Interrupt succeeds when a session exists.
        fake.on("GET /api/sessions", [["id": "s1", "path": "kernel.ipynb", "kernel": ["id": "k-live"]]])
        fake.on("POST /api/kernels/k-live/interrupt", status: 204, nil)
        let interruptReply = try await interrupt.perform()
        XCTAssertEqual(interruptReply.value, "Interrupted the kernel of kernel.ipynb")
        XCTAssertEqual(fake.calls("POST /api/kernels/k-live/interrupt").count, 1)
    }

    // MARK: RunNotebookWithParametersIntent

    func testRunNotebookWithParametersIntentReturnsJSONAndChecksSeparatePermission() async throws {
        let nbURL = try writeNotebookFile("params.ipynb")
        fake.on("POST /api/notebooks/run") { request in
            let body = Self.body(request)
            XCTAssertEqual(body["path"] as? String, "params.ipynb")
            XCTAssertEqual((body["params"] as? [String: Any])?["day"] as? String, "2026-11-28")
            XCTAssertEqual(body["timeout"] as? Int, 25)
            return (200, ["status": "ok", "results": ["rows": 12, "alpha": true]])
        }

        // Even if non-parameter run is already allowed, parameterized run asks independently.
        permissions.allow(nbURL, sendingTo: AppURL.shortcutsDestination, withParameters: false)
        promptHandler = { _, _, params in params != nil ? false : true }

        let deniedParams = RunNotebookWithParametersIntent()
        deniedParams.notebook = NotebookEntity(url: nbURL)
        deniedParams.params = #"{"day":"2026-11-28"}"#
        deniedParams.timeout = 25
        do {
            _ = try await deniedParams.perform()
            XCTFail("Expected AppURLError.cancelled")
        } catch {
            XCTAssertEqual(error as? AppURLError, .cancelled)
        }
        XCTAssertTrue(fake.calls("POST /api/notebooks/run").isEmpty)

        // Approved parameterized run returns sorted JSON results.
        promptHandler = { _, _, _ in true }
        let okResult = try await deniedParams.perform()
        XCTAssertEqual(okResult.value, #"{"alpha":true,"rows":12}"#)

        // A failed parameterized run throws runFailed.
        fake.on("POST /api/notebooks/run", [
            "status": "error",
            "results": [:],
            "error": "ValueError: bad param",
        ])
        do {
            _ = try await deniedParams.perform()
            XCTFail("Expected runFailed error")
        } catch {
            XCTAssertEqual(error as? NotebookActionError, .runFailed("ValueError: bad param"))
        }
    }
}
#endif
