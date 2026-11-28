#if os(macOS)
import Foundation
import Observation
import ServiceManagement

/// One running kernel shown in the Mac menu bar menu (#924).
struct MenuBarKernel: Equatable, Identifiable, Sendable {
    /// The kernel's id.
    var id: String
    /// The kernelspec name (e.g. `python3`, `cdp-node`).
    var name: String
    /// The notebook's display name (without `.ipynb`), or nil for a kernel
    /// with no attached notebook session.
    var notebook: String?
    /// The execution state reported by the server (`idle`, `busy`, `starting`, …).
    var state: String?

    /// Human-readable execution state (`Idle`, `Busy`, `Starting`, …).
    var formattedState: String? {
        guard let state, !state.isEmpty else { return nil }
        return state.prefix(1).uppercased() + state.dropFirst().lowercased()
    }

    /// Single-line description shown in the menu bar menu.
    var label: String {
        [notebook, name, formattedState]
            .compactMap { value in
                guard let value, !value.isEmpty else { return nil }
                return value
            }
            .joined(separator: " · ")
    }
}

/// Pure view-model snapshot for the Mac menu bar menu (#924): server mode,
/// MCP and Tailnet status, and running kernels, formatted into stable lines
/// so unit tests exercise every state without AppKit or live servers.
struct MenuBarSnapshot: Equatable {
    enum ServerMode: Equatable {
        case backgroundRunning
        case backgroundEnabled
        case backgroundNeedsApproval
        case embeddedRunning
        case failed(String)
        case stopped
    }

    enum TailnetStatus: Equatable {
        case off
        case starting
        case shared(String)
        case error(String)
    }

    var serverMode: ServerMode
    var mcpMode: MCPMode
    var tailnet: TailnetStatus
    var kernels: [MenuBarKernel]
    var kernelsError: String?

    /// Builds a snapshot from raw app and LaunchAgent states.
    static func make(
        backgroundStatus: SMAppService.Status,
        backgroundRunning: Bool,
        embeddedRunning: Bool,
        embeddedError: String?,
        mcpMode: MCPMode,
        tailnetShare: Bool,
        tailnetURL: URL?,
        tailnetError: String?,
        kernels: [MenuBarKernel],
        kernelsError: String? = nil
    ) -> MenuBarSnapshot {
        let serverMode: ServerMode
        if backgroundStatus == .enabled {
            serverMode = backgroundRunning ? .backgroundRunning : .backgroundEnabled
        } else if backgroundStatus == .requiresApproval {
            serverMode = .backgroundNeedsApproval
        } else if embeddedRunning {
            serverMode = .embeddedRunning
        } else if let embeddedError, !embeddedError.isEmpty {
            serverMode = .failed(embeddedError)
        } else {
            serverMode = .stopped
        }

        let tailnet: TailnetStatus
        if !tailnetShare {
            tailnet = .off
        } else if let tailnetURL {
            tailnet = .shared(tailnetURL.host ?? tailnetURL.absoluteString)
        } else if let tailnetError, !tailnetError.isEmpty {
            tailnet = .error(tailnetError)
        } else {
            tailnet = .starting
        }

        return MenuBarSnapshot(
            serverMode: serverMode,
            mcpMode: mcpMode,
            tailnet: tailnet,
            kernels: kernels,
            kernelsError: kernelsError
        )
    }

    var serverLine: String {
        switch serverMode {
        case .backgroundRunning:
            "Server: Background (running)"
        case .backgroundEnabled:
            "Server: Background (enabled)"
        case .backgroundNeedsApproval:
            "Server: Background (needs approval)"
        case .embeddedRunning:
            "Server: Embedded (running)"
        case .failed(let message):
            "Server: Error (\(message))"
        case .stopped:
            "Server: Stopped"
        }
    }

    var mcpLine: String {
        "MCP: \(mcpMode.title)"
    }

    var tailnetLine: String {
        switch tailnet {
        case .off:
            "Tailnet: Off"
        case .starting:
            "Tailnet: Sharing…"
        case .shared(let host):
            "Tailnet: Shared (\(host))"
        case .error(let message):
            "Tailnet: Error (\(message))"
        }
    }

    var kernelsHeader: String {
        kernels.isEmpty ? "Running Kernels" : "Running Kernels (\(kernels.count))"
    }

    var emptyKernelsLine: String {
        if let kernelsError, !kernelsError.isEmpty {
            return "Kernels unavailable: \(kernelsError)"
        }
        return "No running kernels"
    }

    /// Parses Jupyter `/api/sessions` and optional `/api/kernels` JSON bodies
    /// into a sorted, deduplicated list of running kernels.
    static func parseKernels(sessionsData: Data?, kernelsData: Data? = nil) -> [MenuBarKernel] {
        var byID: [String: MenuBarKernel] = [:]

        if let sessionsData,
           let sessions = try? JSONSerialization.jsonObject(with: sessionsData) as? [[String: Any]] {
            for session in sessions {
                guard let kernel = session["kernel"] as? [String: Any],
                      let id = kernel["id"] as? String, !id.isEmpty,
                      let name = kernel["name"] as? String, !name.isEmpty
                else { continue }
                let rawPath = (session["path"] as? String).flatMap { $0.isEmpty ? nil : $0 }
                    ?? (session["name"] as? String).flatMap { $0.isEmpty ? nil : $0 }
                let notebook = rawPath.map(Self.notebookTitle(from:))
                let state = (kernel["execution_state"] as? String).flatMap { $0.isEmpty ? nil : $0 }
                byID[id] = MenuBarKernel(id: id, name: name, notebook: notebook, state: state)
            }
        }

        if let kernelsData,
           let kernels = try? JSONSerialization.jsonObject(with: kernelsData) as? [[String: Any]] {
            for kernel in kernels {
                guard let id = kernel["id"] as? String, !id.isEmpty,
                      byID[id] == nil,
                      let name = kernel["name"] as? String, !name.isEmpty
                else { continue }
                let state = (kernel["execution_state"] as? String).flatMap { $0.isEmpty ? nil : $0 }
                byID[id] = MenuBarKernel(id: id, name: name, notebook: nil, state: state)
            }
        }

        return byID.values.sorted { lhs, rhs in
            let lKey = ((lhs.notebook ?? "").lowercased(), lhs.name.lowercased(), lhs.id)
            let rKey = ((rhs.notebook ?? "").lowercased(), rhs.name.lowercased(), rhs.id)
            return lKey < rKey
        }
    }

    /// Strips directory components and `.ipynb` from a session path.
    private static func notebookTitle(from path: String) -> String {
        let name = path.split(separator: "/").last.map(String.init) ?? path
        return name.hasSuffix(".ipynb") ? String(name.dropLast(6)) : name
    }
}

/// Fetches running kernels and tracks background LaunchAgent status for the
/// Mac menu bar extra (#924).
@MainActor
@Observable
final class MenuBarController {
    typealias KernelFetcher = @Sendable ([ServerEndpoint]) async throws -> [MenuBarKernel]

    private(set) var backgroundStatus: SMAppService.Status
    private(set) var kernels: [MenuBarKernel] = []
    private(set) var kernelsError: String?

    @ObservationIgnored private let service: any BackgroundServerService
    @ObservationIgnored private let fetchKernels: KernelFetcher
    @ObservationIgnored private var poller: Task<Void, Never>?
    @ObservationIgnored private var endpointsProvider: () -> [ServerEndpoint] = { [] }

    init(
        service: any BackgroundServerService = SystemBackgroundServerService(),
        fetchKernels: @escaping KernelFetcher = MenuBarController.loadKernels(from:)
    ) {
        self.service = service
        self.fetchKernels = fetchKernels
        backgroundStatus = service.status
    }

    /// Starts periodic polling so the menu bar reflects kernel and LaunchAgent
    /// changes even when no window is open.
    func start(
        interval: Duration = .seconds(5),
        endpoints: @escaping () -> [ServerEndpoint]
    ) {
        endpointsProvider = endpoints
        poller?.cancel()
        poller = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                await self.refresh(endpoints: self.endpointsProvider())
                try? await Task.sleep(for: interval)
            }
        }
    }

    func stop() {
        poller?.cancel()
        poller = nil
    }

    /// Re-reads the LaunchAgent registration status immediately.
    func refreshBackgroundStatus() {
        backgroundStatus = service.status
    }

    /// Refreshes both LaunchAgent status and running kernels from `endpoints`.
    func refresh(endpoints: [ServerEndpoint]) async {
        backgroundStatus = service.status
        guard !endpoints.isEmpty else {
            kernels = []
            kernelsError = nil
            return
        }
        do {
            kernels = try await fetchKernels(endpoints)
            kernelsError = nil
        } catch {
            if !Task.isCancelled {
                kernels = []
                kernelsError = error.localizedDescription
            }
        }
    }

    /// Refreshes using the configured endpoint provider.
    func refreshNow() {
        Task { [weak self] in
            guard let self else { return }
            await self.refresh(endpoints: self.endpointsProvider())
        }
    }

    /// Builds a formatted snapshot for the menu bar UI.
    func snapshot(
        backgroundRunning: Bool,
        embeddedRunning: Bool,
        embeddedError: String?,
        mcpMode: MCPMode,
        tailnetShare: Bool,
        tailnetURL: URL?,
        tailnetError: String?
    ) -> MenuBarSnapshot {
        MenuBarSnapshot.make(
            backgroundStatus: backgroundStatus,
            backgroundRunning: backgroundRunning,
            embeddedRunning: embeddedRunning,
            embeddedError: embeddedError,
            mcpMode: mcpMode,
            tailnetShare: tailnetShare,
            tailnetURL: tailnetURL,
            tailnetError: tailnetError,
            kernels: kernels,
            kernelsError: kernelsError
        )
    }

    /// Queries `/api/sessions` and `/api/kernels` across all active local
    /// servers, deduplicating by kernel id.
    static func loadKernels(from endpoints: [ServerEndpoint]) async throws -> [MenuBarKernel] {
        var combined: [String: MenuBarKernel] = [:]
        var lastError: Error?
        var succeeded = 0

        for endpoint in endpoints {
            do {
                let sessionsData = try await fetchData(endpoint.request("api/sessions"))
                let kernelsData = try? await fetchData(endpoint.request("api/kernels"))
                let parsed = MenuBarSnapshot.parseKernels(
                    sessionsData: sessionsData, kernelsData: kernelsData
                )
                for kernel in parsed where combined[kernel.id] == nil {
                    combined[kernel.id] = kernel
                }
                succeeded += 1
            } catch {
                lastError = error
            }
        }

        if succeeded == 0, let lastError {
            throw lastError
        }

        return combined.values.sorted { lhs, rhs in
            let lKey = ((lhs.notebook ?? "").lowercased(), lhs.name.lowercased(), lhs.id)
            let rKey = ((rhs.notebook ?? "").lowercased(), rhs.name.lowercased(), rhs.id)
            return lKey < rKey
        }
    }

    private static func fetchData(_ request: URLRequest) async throws -> Data {
        var request = request
        request.timeoutInterval = 3
        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw URLError(.badServerResponse)
        }
        return data
    }
}
#endif
