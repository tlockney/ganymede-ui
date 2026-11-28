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

        let controller = MenuBarController(service: service) { endpoints in
            XCTAssertEqual(endpoints, [endpoint])
            return sample
        }
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
        let controller = MenuBarController(service: service) { endpoints in
            try await fetcher.fetch(endpoints)
        }

        await controller.refresh(endpoints: [endpoint])
        XCTAssertEqual(controller.kernels, fetcher.sample)
        XCTAssertNil(controller.kernelsError)

        // A later failure clears stale kernels so the error line shows.
        fetcher.shouldFail = true
        await controller.refresh(endpoints: [endpoint])
        XCTAssertEqual(controller.kernels, [])
        XCTAssertEqual(controller.kernelsError, "server unreachable")
    }
}
#endif
