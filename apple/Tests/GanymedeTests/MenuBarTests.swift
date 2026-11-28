#if os(macOS)
import Foundation
import ServiceManagement
import XCTest

/// Unit tests for the Mac menu bar extra's view-model formatting, kernel
/// parsing, and controller refresh logic (#924).
final class MenuBarTests: XCTestCase {
    private struct FakeError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    private final class FakeService: BackgroundServerService, @unchecked Sendable {
        var status: SMAppService.Status = .notRegistered
        func register() throws {}
        func unregister() throws {}
        func openLoginItemsSettings() {}
    }

    // MARK: Server mode formatting

    func testServerStatusFormatsBackgroundAndEmbeddedStates() {
        let backgroundRunning = MenuBarSnapshot.make(
            backgroundStatus: .enabled,
            backgroundRunning: true,
            embeddedRunning: true,
            embeddedError: nil,
            mcpMode: .off,
            tailnetShare: false,
            tailnetURL: nil,
            tailnetError: nil,
            kernels: []
        )
        XCTAssertEqual(backgroundRunning.serverMode, .backgroundRunning)
        XCTAssertEqual(backgroundRunning.serverLine, "Server: Background (running)")

        let backgroundEnabled = MenuBarSnapshot.make(
            backgroundStatus: .enabled,
            backgroundRunning: false,
            embeddedRunning: true,
            embeddedError: nil,
            mcpMode: .off,
            tailnetShare: false,
            tailnetURL: nil,
            tailnetError: nil,
            kernels: []
        )
        XCTAssertEqual(backgroundEnabled.serverMode, .backgroundEnabled)
        XCTAssertEqual(backgroundEnabled.serverLine, "Server: Background (enabled)")

        let needsApproval = MenuBarSnapshot.make(
            backgroundStatus: .requiresApproval,
            backgroundRunning: false,
            embeddedRunning: true,
            embeddedError: nil,
            mcpMode: .off,
            tailnetShare: false,
            tailnetURL: nil,
            tailnetError: nil,
            kernels: []
        )
        XCTAssertEqual(needsApproval.serverMode, .backgroundNeedsApproval)
        XCTAssertEqual(needsApproval.serverLine, "Server: Background (needs approval)")

        let embedded = MenuBarSnapshot.make(
            backgroundStatus: .notRegistered,
            backgroundRunning: false,
            embeddedRunning: true,
            embeddedError: nil,
            mcpMode: .off,
            tailnetShare: false,
            tailnetURL: nil,
            tailnetError: nil,
            kernels: []
        )
        XCTAssertEqual(embedded.serverMode, .embeddedRunning)
        XCTAssertEqual(embedded.serverLine, "Server: Embedded (running)")

        let failed = MenuBarSnapshot.make(
            backgroundStatus: .notRegistered,
            backgroundRunning: false,
            embeddedRunning: false,
            embeddedError: "port in use",
            mcpMode: .off,
            tailnetShare: false,
            tailnetURL: nil,
            tailnetError: nil,
            kernels: []
        )
        XCTAssertEqual(failed.serverMode, .failed("port in use"))
        XCTAssertEqual(failed.serverLine, "Server: Error (port in use)")

        let stopped = MenuBarSnapshot.make(
            backgroundStatus: .notRegistered,
            backgroundRunning: false,
            embeddedRunning: false,
            embeddedError: nil,
            mcpMode: .off,
            tailnetShare: false,
            tailnetURL: nil,
            tailnetError: nil,
            kernels: []
        )
        XCTAssertEqual(stopped.serverMode, .stopped)
        XCTAssertEqual(stopped.serverLine, "Server: Stopped")
    }

    // MARK: MCP and Tailnet formatting

    func testMCPStatusFormatsEveryMode() {
        let cases: [(MCPMode, String)] = [
            (.off, "MCP: Off"),
            (.readOnly, "MCP: Read only"),
            (.editOnly, "MCP: Edit, don’t run"),
            (.full, "MCP: Edit and run"),
        ]
        for (mode, expected) in cases {
            let snapshot = MenuBarSnapshot.make(
                backgroundStatus: .notRegistered,
                backgroundRunning: false,
                embeddedRunning: true,
                embeddedError: nil,
                mcpMode: mode,
                tailnetShare: false,
                tailnetURL: nil,
                tailnetError: nil,
                kernels: []
            )
            XCTAssertEqual(snapshot.mcpLine, expected)
        }
    }

    func testTailnetStatusFormatsOffStartingSharedAndError() {
        let off = MenuBarSnapshot.make(
            backgroundStatus: .notRegistered,
            backgroundRunning: false,
            embeddedRunning: true,
            embeddedError: nil,
            mcpMode: .off,
            tailnetShare: false,
            tailnetURL: URL(string: "https://box.tail1234.ts.net/"),
            tailnetError: "ignored when off",
            kernels: []
        )
        XCTAssertEqual(off.tailnet, .off)
        XCTAssertEqual(off.tailnetLine, "Tailnet: Off")

        let starting = MenuBarSnapshot.make(
            backgroundStatus: .notRegistered,
            backgroundRunning: false,
            embeddedRunning: true,
            embeddedError: nil,
            mcpMode: .off,
            tailnetShare: true,
            tailnetURL: nil,
            tailnetError: nil,
            kernels: []
        )
        XCTAssertEqual(starting.tailnet, .starting)
        XCTAssertEqual(starting.tailnetLine, "Tailnet: Sharing…")

        let shared = MenuBarSnapshot.make(
            backgroundStatus: .notRegistered,
            backgroundRunning: false,
            embeddedRunning: true,
            embeddedError: nil,
            mcpMode: .off,
            tailnetShare: true,
            tailnetURL: URL(string: "https://box.tail1234.ts.net/"),
            tailnetError: nil,
            kernels: []
        )
        XCTAssertEqual(shared.tailnet, .shared("box.tail1234.ts.net"))
        XCTAssertEqual(shared.tailnetLine, "Tailnet: Shared (box.tail1234.ts.net)")

        let failed = MenuBarSnapshot.make(
            backgroundStatus: .notRegistered,
            backgroundRunning: false,
            embeddedRunning: true,
            embeddedError: nil,
            mcpMode: .off,
            tailnetShare: true,
            tailnetURL: nil,
            tailnetError: "tailscale not signed in",
            kernels: []
        )
        XCTAssertEqual(failed.tailnet, .error("tailscale not signed in"))
        XCTAssertEqual(failed.tailnetLine, "Tailnet: Error (tailscale not signed in)")

        // When the background server is enabled, it owns tailnet serving via ganymede.toml (#954).
        let backgroundManaged = MenuBarSnapshot.make(
            backgroundStatus: .enabled,
            backgroundRunning: true,
            embeddedRunning: true,
            embeddedError: nil,
            mcpMode: .off,
            tailnetShare: true,
            tailnetURL: nil,
            tailnetError: nil,
            kernels: []
        )
        XCTAssertEqual(backgroundManaged.tailnet, .backgroundManaged)
        XCTAssertEqual(backgroundManaged.tailnetLine, "Tailnet: Background server (ganymede.toml)")
    }

    // MARK: Running kernels formatting & parsing

    func testRunningKernelsFormattingForEmptyPopulatedAndErrorStates() {
        let empty = MenuBarSnapshot.make(
            backgroundStatus: .notRegistered,
            backgroundRunning: false,
            embeddedRunning: true,
            embeddedError: nil,
            mcpMode: .off,
            tailnetShare: false,
            tailnetURL: nil,
            tailnetError: nil,
            kernels: []
        )
        XCTAssertEqual(empty.kernelsHeader, "Running Kernels")
        XCTAssertEqual(empty.emptyKernelsLine, "No running kernels")

        let errored = MenuBarSnapshot.make(
            backgroundStatus: .notRegistered,
            backgroundRunning: false,
            embeddedRunning: true,
            embeddedError: nil,
            mcpMode: .off,
            tailnetShare: false,
            tailnetURL: nil,
            tailnetError: nil,
            kernels: [],
            kernelsError: "connection refused"
        )
        XCTAssertEqual(errored.emptyKernelsLine, "Kernels unavailable: connection refused")

        let kernels = [
            MenuBarKernel(id: "k1", name: "python3", notebook: "orbits", state: "busy"),
            MenuBarKernel(id: "k2", name: "cdp-node", notebook: nil, state: "idle"),
            MenuBarKernel(id: "k3", name: "julia", notebook: "scratch", state: nil),
        ]
        let populated = MenuBarSnapshot.make(
            backgroundStatus: .notRegistered,
            backgroundRunning: false,
            embeddedRunning: true,
            embeddedError: nil,
            mcpMode: .off,
            tailnetShare: false,
            tailnetURL: nil,
            tailnetError: nil,
            kernels: kernels
        )
        XCTAssertEqual(populated.kernelsHeader, "Running Kernels (3)")
        XCTAssertEqual(kernels[0].label, "orbits · python3 · Busy")
        XCTAssertEqual(kernels[1].label, "cdp-node · Idle")
        XCTAssertEqual(kernels[2].label, "scratch · julia")
    }

    func testParseKernelsCombinesSessionsAndStandaloneKernels() throws {
        let sessionsJSON = """
        [
          {
            "id": "s1",
            "path": "notes/Galilean moons.ipynb",
            "name": "Galilean moons.ipynb",
            "kernel": {
              "id": "k1",
              "name": "cdp-node",
              "execution_state": "idle"
            }
          },
          {
            "id": "s2",
            "path": "analysis.ipynb",
            "kernel": {
              "id": "k2",
              "name": "python3",
              "execution_state": "busy"
            }
          }
        ]
        """
        let kernelsJSON = """
        [
          { "id": "k1", "name": "cdp-node", "execution_state": "idle" },
          { "id": "k3", "name": "python3", "execution_state": "starting" }
        ]
        """
        let parsed = MenuBarSnapshot.parseKernels(
            sessionsData: Data(sessionsJSON.utf8),
            kernelsData: Data(kernelsJSON.utf8)
        )
        XCTAssertEqual(parsed, [
            MenuBarKernel(id: "k3", name: "python3", notebook: nil, state: "starting"),
            MenuBarKernel(id: "k2", name: "python3", notebook: "analysis", state: "busy"),
            MenuBarKernel(id: "k1", name: "cdp-node", notebook: "Galilean moons", state: "idle"),
        ])
        XCTAssertEqual(MenuBarSnapshot.parseKernels(sessionsData: Data("not json".utf8)), [])
    }

    // MARK: Controller refresh

    @MainActor
    func testControllerRefreshesKernelsAndBackgroundStatus() async {
        let service = FakeService()
        service.status = .notRegistered
        let sample = [
            MenuBarKernel(id: "k1", name: "python3", notebook: "demo", state: "idle"),
        ]
        let endpoint = ServerEndpoint(base: URL(string: "http://127.0.0.1:8888/")!, token: "tok")

        let controller = MenuBarController(
            service: service,
            fetchKernels: { endpoints in
                XCTAssertEqual(endpoints, [endpoint])
                return sample
            },
            fetchExecutions: { _ in .unsupported }
        )
        await controller.refresh(endpoints: [endpoint])
        XCTAssertEqual(controller.kernels, sample)
        XCTAssertNil(controller.kernelsError)
        XCTAssertEqual(controller.backgroundStatus, .notRegistered)

        // Updating background status is reflected immediately.
        service.status = .enabled
        controller.refreshBackgroundStatus()
        XCTAssertEqual(controller.backgroundStatus, .enabled)

        // No endpoints clears the list without calling the fetcher.
        await controller.refresh(endpoints: [])
        XCTAssertEqual(controller.kernels, [])
        XCTAssertNil(controller.kernelsError)
    }

    private final class ToggleFetcher: @unchecked Sendable {
        var shouldFail = false
        let sample = [
            MenuBarKernel(id: "k1", name: "python3", notebook: "demo", state: "idle"),
        ]
        func fetch(_ endpoints: [ServerEndpoint]) async throws -> [MenuBarKernel] {
            if shouldFail { throw FakeError(message: "server unreachable") }
            return sample
        }
    }

    @MainActor
    func testControllerSurfacesKernelFetchError() async {
        let service = FakeService()
        let endpoint = ServerEndpoint(base: URL(string: "http://127.0.0.1:8888/")!, token: "tok")
        let fetcher = ToggleFetcher()
        let controller = MenuBarController(
            service: service,
            fetchKernels: { endpoints in
                try await fetcher.fetch(endpoints)
            },
            fetchExecutions: { _ in .unsupported }
        )

        await controller.refresh(endpoints: [endpoint])
        XCTAssertEqual(controller.kernels, fetcher.sample)
        XCTAssertNil(controller.kernelsError)

        // A later failure clears stale kernels so the error line shows.
        fetcher.shouldFail = true
        await controller.refresh(endpoints: [endpoint])
        XCTAssertEqual(controller.kernels, [])
        XCTAssertEqual(controller.kernelsError, "server unreachable")
    }

    // MARK: Kernel control actions (#953)

    func testKernelActionRequestsUseExpectedMethodPathAndAuth() throws {
        let endpoint = ServerEndpoint(base: URL(string: "http://127.0.0.1:8888/")!, token: "secret-tok")

        let interrupt = try MenuBarKernelAction.request(for: .interrupt, kernelID: "k-123", on: endpoint)
        XCTAssertEqual(interrupt.httpMethod, "POST")
        XCTAssertEqual(interrupt.url?.absoluteString, "http://127.0.0.1:8888/api/kernels/k-123/interrupt")
        XCTAssertEqual(interrupt.value(forHTTPHeaderField: "Authorization"), "token secret-tok")

        let restart = try MenuBarKernelAction.request(for: .restart, kernelID: "k-123", on: endpoint)
        XCTAssertEqual(restart.httpMethod, "POST")
        XCTAssertEqual(restart.url?.absoluteString, "http://127.0.0.1:8888/api/kernels/k-123/restart")
        XCTAssertEqual(restart.value(forHTTPHeaderField: "Authorization"), "token secret-tok")

        let shutDown = try MenuBarKernelAction.request(for: .shutDown, kernelID: "k-123", on: endpoint)
        XCTAssertEqual(shutDown.httpMethod, "DELETE")
        XCTAssertEqual(shutDown.url?.absoluteString, "http://127.0.0.1:8888/api/kernels/k-123")
        XCTAssertEqual(shutDown.value(forHTTPHeaderField: "Authorization"), "token secret-tok")

        XCTAssertThrowsError(try MenuBarKernelAction.request(for: .interrupt, kernelID: "", on: endpoint))
        XCTAssertThrowsError(try MenuBarKernelAction.request(for: .shutDown, kernelID: "../bad", on: endpoint))
    }

    private final class ActionRecorder: @unchecked Sendable {
        private let lock = NSLock()
        private var recorded: [URLRequest] = []
        var nextError: Error?

        func record(_ request: URLRequest) throws {
            lock.lock()
            defer { lock.unlock() }
            recorded.append(request)
            if let nextError { throw nextError }
        }

        var requests: [URLRequest] {
            lock.lock()
            defer { lock.unlock() }
            return recorded
        }
    }

    private final class RefreshCounter: @unchecked Sendable {
        private let lock = NSLock()
        private var count = 0
        func increment() {
            lock.lock()
            defer { lock.unlock() }
            count += 1
        }
        var value: Int {
            lock.lock()
            defer { lock.unlock() }
            return count
        }
    }

    @MainActor
    func testControllerPerformsKernelActionsRefreshesAndSurfacesErrors() async {
        let service = FakeService()
        let endpoint = ServerEndpoint(base: URL(string: "http://127.0.0.1:8888/")!, token: "tok-1")
        let kernel = MenuBarKernel(
            id: "kern-42", name: "python3", notebook: "orbits", state: "busy", endpoint: endpoint
        )
        let recorder = ActionRecorder()
        let refreshes = RefreshCounter()

        let controller = MenuBarController(
            service: service,
            fetchKernels: { _ in
                refreshes.increment()
                return []
            },
            fetchExecutions: { _ in .unsupported },
            performAction: { request in
                try recorder.record(request)
            }
        )

        // All three actions send the expected request and refresh immediately.
        await controller.perform(.interrupt, on: kernel)
        await controller.perform(.restart, on: kernel)
        await controller.perform(.shutDown, on: kernel)

        XCTAssertNil(controller.actionError)
        XCTAssertEqual(refreshes.value, 3)
        XCTAssertEqual(recorder.requests.map(\.httpMethod), ["POST", "POST", "DELETE"])
        XCTAssertEqual(
            recorder.requests.map { $0.url?.path },
            ["/api/kernels/kern-42/interrupt", "/api/kernels/kern-42/restart", "/api/kernels/kern-42"]
        )
        XCTAssertTrue(recorder.requests.allSatisfy {
            $0.value(forHTTPHeaderField: "Authorization") == "token tok-1"
        })

        // Errors are surfaced cleanly and never dropped.
        recorder.nextError = MenuBarController.HTTPFailure(statusCode: 500, message: "kernel gone")
        await controller.perform(.restart, on: kernel)
        XCTAssertEqual(controller.actionError, "Couldn’t restart orbits: HTTP 500: kernel gone")
        XCTAssertEqual(refreshes.value, 3)

        // A later successful action clears the error.
        recorder.nextError = nil
        await controller.perform(.shutDown, on: kernel)
        XCTAssertNil(controller.actionError)
        XCTAssertEqual(refreshes.value, 4)

        // Missing server endpoint surfaces an error instead of silently doing nothing.
        let detached = MenuBarKernel(id: "kern-99", name: "python3", notebook: nil, state: "idle")
        await controller.perform(.interrupt, on: detached)
        XCTAssertEqual(controller.actionError, "Couldn’t interrupt python3: no active server.")
    }

    // MARK: Recent executions decoding, formatting, and 404 fallback (#953)

    func testExecutionDecodingFormattingAndRequestURL() throws {
        let endpoint = ServerEndpoint(base: URL(string: "http://127.0.0.1:8888/")!, token: "tok-exec")
        let request = MenuBarExecution.request(on: endpoint, limit: 10)
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertEqual(request.url?.absoluteString, "http://127.0.0.1:8888/api/executions?limit=10")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "token tok-exec")

        let json = """
        [
          {
            "execution_id": "req-4",
            "kernel_id": "5b140482-3d46-486f-8a0c-637e047675f2",
            "notebook": "reports/package-stats.ipynb",
            "cell_id": "cell-2",
            "run_by": "mcp-client",
            "started_at": "2026-11-28T17:10:04.120411Z",
            "finished_at": null,
            "status": "running"
          },
          {
            "execution_id": "req-3",
            "kernel_id": "5b140482-3d46-486f-8a0c-637e047675f2",
            "notebook": "reports/package-stats.ipynb",
            "cell_id": "cell-1",
            "run_by": "demo",
            "started_at": "2026-11-28T17:10:01.005000Z",
            "finished_at": "2026-11-28T17:10:01.215000Z",
            "status": "ok"
          },
          {
            "execution_id": "req-2",
            "kernel_id": "abcd1234-0000-0000-0000-000000000000",
            "notebook": null,
            "cell_id": null,
            "run_by": null,
            "started_at": "2026-11-28T17:09:00Z",
            "finished_at": "2026-11-28T17:09:01.5Z",
            "status": "error"
          },
          {
            "execution_id": "req-1",
            "kernel_id": "abcd1234-0000-0000-0000-000000000000",
            "notebook": "scratch.ipynb",
            "cell_id": "c9",
            "run_by": null,
            "started_at": "2026-11-28T17:05:00Z",
            "finished_at": "2026-11-28T17:07:05Z",
            "status": "aborted"
          }
        ]
        """
        let decoded = try MenuBarExecution.parse(json: Data(json.utf8))
        XCTAssertEqual(decoded.count, 4)
        let now = try XCTUnwrap(MenuBarExecution.parseISO8601("2026-11-28T17:10:08.120411Z"))
        XCTAssertEqual(decoded[0].label(now: now), "package-stats · Running · mcp-client · 4s")
        XCTAssertEqual(decoded[1].label(now: now), "package-stats · OK · demo · 210ms")
        XCTAssertEqual(decoded[2].label(now: now), "abcd1234 · Error · 1.5s")
        XCTAssertEqual(decoded[3].label(now: now), "scratch · Aborted · 2m 5s")
    }

    @MainActor
    func testLoadExecutionsHandles404AsUnsupportedAnd200AsLoaded() async throws {
        let endpoint = ServerEndpoint(base: URL(string: "http://127.0.0.1:8888/")!, token: "tok")

        // 404 from an older server -> .unsupported without throwing.
        let older = try await MenuBarController.loadExecutions(from: [endpoint], limit: 10) { _ in
            (Data(), 404)
        }
        XCTAssertEqual(older, .unsupported)

        // Controller omits the Recent Executions section on 404 with no error.
        let service = FakeService()
        let controller = MenuBarController(
            service: service,
            fetchKernels: { _ in [] },
            fetchExecutions: { _ in .unsupported }
        )
        await controller.refresh(endpoints: [endpoint])
        XCTAssertNil(controller.executions)
        XCTAssertNil(controller.executionsError)
        let hiddenSnapshot = controller.snapshot(
            backgroundRunning: false, embeddedRunning: true, embeddedError: nil,
            mcpMode: .off, tailnetShare: false, tailnetURL: nil, tailnetError: nil
        )
        XCTAssertFalse(hiddenSnapshot.showRecentExecutions)

        // 200 with records -> .loaded sorted newest-first and shown in snapshot.
        let body = """
        [
          {
            "execution_id": "e1",
            "kernel_id": "k1",
            "notebook": "a.ipynb",
            "cell_id": "c1",
            "run_by": "alice",
            "started_at": "2026-11-28T17:10:01Z",
            "finished_at": "2026-11-28T17:10:02Z",
            "status": "ok"
          },
          {
            "execution_id": "e2",
            "kernel_id": "k1",
            "notebook": "b.ipynb",
            "cell_id": "c2",
            "run_by": null,
            "started_at": "2026-11-28T17:10:05Z",
            "finished_at": null,
            "status": "running"
          }
        ]
        """
        let loaded = try await MenuBarController.loadExecutions(from: [endpoint], limit: 10) { _ in
            (Data(body.utf8), 200)
        }
        guard case .loaded(let records) = loaded else {
            return XCTFail("expected .loaded, got \(loaded)")
        }
        XCTAssertEqual(records.map(\.executionID), ["e2", "e1"])

        let activeController = MenuBarController(
            service: service,
            fetchKernels: { _ in [] },
            fetchExecutions: { _ in loaded }
        )
        await activeController.refresh(endpoints: [endpoint])
        let shownSnapshot = activeController.snapshot(
            backgroundRunning: false, embeddedRunning: true, embeddedError: nil,
            mcpMode: .off, tailnetShare: false, tailnetURL: nil, tailnetError: nil
        )
        XCTAssertTrue(shownSnapshot.showRecentExecutions)
        XCTAssertEqual(shownSnapshot.executions?.map(\.executionID), ["e2", "e1"])

        // Non-404 HTTP error throws instead of silently hiding.
        do {
            _ = try await MenuBarController.loadExecutions(from: [endpoint], limit: 10) { _ in
                (Data(#"{"message":"internal error"}"#.utf8), 500)
            }
            XCTFail("expected HTTP 500 to throw")
        } catch let failure as MenuBarController.HTTPFailure {
            XCTAssertEqual(failure, .init(statusCode: 500, message: "internal error"))
        }
    }
}
#endif
