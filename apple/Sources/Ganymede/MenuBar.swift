#if os(macOS)
import Foundation
import Observation
import ServiceManagement

/// One running kernel shown in the Mac menu bar menu (#924, #953).
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
    /// The server hosting this kernel, used for Interrupt / Restart / Shut Down (#953).
    var endpoint: ServerEndpoint? = nil

    /// Human-readable execution state (`Idle`, `Busy`, `Starting`, …).
    var formattedState: String? {
        guard let state, !state.isEmpty else { return nil }
        return state.prefix(1).uppercased() + state.dropFirst().lowercased()
    }

    /// Short title used in error messages (notebook if attached, else kernelspec name).
    var displayTitle: String {
        if let notebook, !notebook.isEmpty { return notebook }
        return name
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

/// Control actions for a running kernel in the Mac menu bar (#953).
enum MenuBarKernelAction: Equatable, Sendable {
    case interrupt
    case restart
    case shutDown

    struct RequestError: LocalizedError, Equatable {
        let message: String
        var errorDescription: String? { message }
    }

    var httpMethod: String {
        switch self {
        case .interrupt, .restart: "POST"
        case .shutDown: "DELETE"
        }
    }

    var failurePrefix: String {
        switch self {
        case .interrupt: "Couldn’t interrupt"
        case .restart: "Couldn’t restart"
        case .shutDown: "Couldn’t shut down"
        }
    }

    /// Builds the authenticated HTTP request for `action` on `kernelID`.
    static func request(
        for action: MenuBarKernelAction, kernelID: String, on endpoint: ServerEndpoint
    ) throws -> URLRequest {
        guard !kernelID.isEmpty, !kernelID.contains("/"), kernelID != ".", kernelID != ".." else {
            throw RequestError(message: "Invalid kernel identifier.")
        }
        let encoded = kernelID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? kernelID
        let path: String
        switch action {
        case .interrupt:
            path = "api/kernels/\(encoded)/interrupt"
        case .restart:
            path = "api/kernels/\(encoded)/restart"
        case .shutDown:
            path = "api/kernels/\(encoded)"
        }
        return endpoint.request(path, method: action.httpMethod)
    }
}

/// One execution returned by `GET /api/executions` (tlockney/ganymede#1006, #953).
struct MenuBarExecution: Equatable, Identifiable, Sendable, Decodable {
    enum Status: String, Equatable, Sendable, Decodable {
        case running
        case ok
        case error
        case aborted

        var label: String {
            switch self {
            case .running: "Running"
            case .ok: "OK"
            case .error: "Error"
            case .aborted: "Aborted"
            }
        }
    }

    var executionID: String
    var kernelID: String
    var notebook: String?
    var cellID: String?
    var runBy: String?
    var startedAt: String
    var finishedAt: String?
    var status: Status

    var id: String { executionID }

    enum CodingKeys: String, CodingKey {
        case executionID = "execution_id"
        case kernelID = "kernel_id"
        case notebook
        case cellID = "cell_id"
        case runBy = "run_by"
        case startedAt = "started_at"
        case finishedAt = "finished_at"
        case status
    }

    /// Subject shown first in the menu bar row: notebook title without
    /// `.ipynb`, else `cell_id`, else shortened kernel id.
    var subject: String {
        if let notebook, !notebook.isEmpty {
            return MenuBarSnapshot.notebookTitle(from: notebook)
        }
        if let cellID, !cellID.isEmpty {
            return cellID
        }
        return String(kernelID.prefix(8))
    }

    /// Short timing string: elapsed duration for finished runs (e.g. `210ms`,
    /// `1.2s`, `2m 5s`), or live elapsed time for running executions.
    func timing(now: Date = Date()) -> String? {
        guard let start = Self.parseISO8601(startedAt) else { return nil }
        if let finishedAt, let finish = Self.parseISO8601(finishedAt) {
            return Self.formatDuration(max(0, finish.timeIntervalSince(start)))
        }
        if status == .running {
            let elapsed = max(0, now.timeIntervalSince(start))
            return elapsed >= 1 ? Self.formatDuration(elapsed) : nil
        }
        return nil
    }

    /// Concise single-line label for the menu bar's Recent Executions section.
    func label(now: Date = Date()) -> String {
        let actor = runBy.flatMap { $0.isEmpty ? nil : $0 }
        return [subject, status.label, actor, timing(now: now)]
            .compactMap { $0 }
            .joined(separator: " · ")
    }

    /// Builds `GET /api/executions?limit=<limit>` with the endpoint's auth header.
    static func request(on endpoint: ServerEndpoint, limit: Int = 10) -> URLRequest {
        var request = endpoint.request("api/executions", method: "GET")
        if let url = request.url, var components = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            components.queryItems = [URLQueryItem(name: "limit", value: String(limit))]
            request.url = components.url ?? url
        }
        return request
    }

    /// Decodes the JSON array returned by `GET /api/executions`.
    static func parse(json data: Data) throws -> [MenuBarExecution] {
        try JSONDecoder().decode([MenuBarExecution].self, from: data)
    }

    /// Parses RFC 3339 / ISO-8601 timestamps with or without fractional seconds.
    static func parseISO8601(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: value) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: value)
    }

    /// Formats a non-negative duration concisely (`210ms`, `1.2s`, `2m 5s`).
    static func formatDuration(_ seconds: TimeInterval) -> String {
        if seconds < 1 {
            let ms = Int((seconds * 1000).rounded())
            return "\(ms)ms"
        }
        if seconds < 60 {
            let tenths = (seconds * 10).rounded() / 10
            if tenths.truncatingRemainder(dividingBy: 1) == 0 {
                return "\(Int(tenths))s"
            }
            return String(format: "%.1fs", tenths)
        }
        let total = Int(seconds.rounded())
        let minutes = total / 60
        let remainder = total % 60
        if minutes < 60 {
            return remainder == 0 ? "\(minutes)m" : "\(minutes)m \(remainder)s"
        }
        let hours = minutes / 60
        let remMinutes = minutes % 60
        return remMinutes == 0 ? "\(hours)h" : "\(hours)h \(remMinutes)m"
    }
}

/// Outcome of fetching `GET /api/executions` across active servers (#953).
enum MenuBarExecutionsResult: Equatable, Sendable {
    /// Every queried server returned 404 (predates tlockney/ganymede#1006).
    case unsupported
    /// At least one server supports `/api/executions`.
    case loaded([MenuBarExecution])
}

/// Pure view-model snapshot for the Mac menu bar menu (#924, #953): server
/// mode, MCP and Tailnet status, running kernels, action errors, and recent
/// executions, formatted into stable lines for unit testing.
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
        case backgroundManaged
        case error(String)
    }

    var serverMode: ServerMode
    var mcpMode: MCPMode
    var tailnet: TailnetStatus
    var kernels: [MenuBarKernel]
    var kernelsError: String?
    var actionError: String?
    /// Recent executions when supported by the server; nil hides the section (404 fallback).
    var executions: [MenuBarExecution]?
    var executionsError: String?

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
        kernelsError: String? = nil,
        actionError: String? = nil,
        executions: [MenuBarExecution]? = nil,
        executionsError: String? = nil
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
        if BackgroundServerRouting.backgroundOwnsTailnet(backgroundStatus) {
            tailnet = .backgroundManaged
        } else if !tailnetShare {
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
            kernelsError: kernelsError,
            actionError: actionError,
            executions: executions,
            executionsError: executionsError
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
        case .backgroundManaged:
            "Tailnet: Background server (ganymede.toml)"
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

    /// Whether the Recent Executions section should appear in the menu bar.
    /// Hidden when the server returned 404 (unsupported) and there is no error.
    var showRecentExecutions: Bool {
        executions != nil || (executionsError?.isEmpty == false)
    }

    var emptyExecutionsLine: String {
        if let executionsError, !executionsError.isEmpty {
            return "Executions unavailable: \(executionsError)"
        }
        return "No recent executions"
    }

    /// Parses Jupyter `/api/sessions` and optional `/api/kernels` JSON bodies
    /// into a sorted, deduplicated list of running kernels.
    static func parseKernels(
        sessionsData: Data?, kernelsData: Data? = nil, endpoint: ServerEndpoint? = nil
    ) -> [MenuBarKernel] {
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
                byID[id] = MenuBarKernel(
                    id: id, name: name, notebook: notebook, state: state, endpoint: endpoint
                )
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
                byID[id] = MenuBarKernel(
                    id: id, name: name, notebook: nil, state: state, endpoint: endpoint
                )
            }
        }

        return byID.values.sorted { lhs, rhs in
            let lKey = ((lhs.notebook ?? "").lowercased(), lhs.name.lowercased(), lhs.id)
            let rKey = ((rhs.notebook ?? "").lowercased(), rhs.name.lowercased(), rhs.id)
            return lKey < rKey
        }
    }

    /// Strips directory components and `.ipynb` from a session path.
    static func notebookTitle(from path: String) -> String {
        let name = path.split(separator: "/").last.map(String.init) ?? path
        return name.hasSuffix(".ipynb") ? String(name.dropLast(6)) : name
    }
}

/// Fetches running kernels and recent executions, runs kernel control actions,
/// and tracks background LaunchAgent status for the Mac menu bar extra (#924, #953).
@MainActor
@Observable
final class MenuBarController {
    typealias KernelFetcher = @Sendable ([ServerEndpoint]) async throws -> [MenuBarKernel]
    typealias ExecutionFetcher = @Sendable ([ServerEndpoint]) async throws -> MenuBarExecutionsResult
    typealias ActionPerformer = @Sendable (URLRequest) async throws -> Void
    typealias HTTPTransport = @Sendable (URLRequest) async throws -> (Data, Int)

    struct HTTPFailure: LocalizedError, Equatable {
        let statusCode: Int
        let message: String?

        var errorDescription: String? {
            if let message, !message.isEmpty {
                return "HTTP \(statusCode): \(message)"
            }
            return "HTTP \(statusCode)"
        }
    }

    static let defaultExecutionsLimit = 10

    private(set) var backgroundStatus: SMAppService.Status
    private(set) var kernels: [MenuBarKernel] = []
    private(set) var kernelsError: String?
    private(set) var actionError: String?
    private(set) var executions: [MenuBarExecution]?
    private(set) var executionsError: String?

    @ObservationIgnored private let service: any BackgroundServerService
    @ObservationIgnored private let fetchKernels: KernelFetcher
    @ObservationIgnored private let fetchExecutions: ExecutionFetcher
    @ObservationIgnored private let performAction: ActionPerformer
    @ObservationIgnored private var poller: Task<Void, Never>?
    @ObservationIgnored private var endpointsProvider: () -> [ServerEndpoint] = { [] }

    init(
        service: any BackgroundServerService = SystemBackgroundServerService(),
        fetchKernels: @escaping KernelFetcher = MenuBarController.loadKernels(from:),
        fetchExecutions: @escaping ExecutionFetcher = { endpoints in
            try await MenuBarController.loadExecutions(
                from: endpoints, limit: MenuBarController.defaultExecutionsLimit
            )
        },
        performAction: @escaping ActionPerformer = MenuBarController.sendAction(_:)
    ) {
        self.service = service
        self.fetchKernels = fetchKernels
        self.fetchExecutions = fetchExecutions
        self.performAction = performAction
        backgroundStatus = service.status
    }

    /// Starts periodic polling so the menu bar reflects kernel, execution,
    /// and LaunchAgent changes even when no window is open.
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

    /// Refreshes LaunchAgent status, running kernels, and recent executions
    /// from `endpoints`.
    func refresh(endpoints: [ServerEndpoint]) async {
        backgroundStatus = service.status
        guard !endpoints.isEmpty else {
            kernels = []
            kernelsError = nil
            executions = nil
            executionsError = nil
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
        do {
            switch try await fetchExecutions(endpoints) {
            case .unsupported:
                executions = nil
                executionsError = nil
            case .loaded(let records):
                executions = records
                executionsError = nil
            }
        } catch {
            if !Task.isCancelled {
                executions = nil
                executionsError = error.localizedDescription
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

    /// Sends Interrupt, Restart, or Shut Down for `kernel`, refreshes state
    /// immediately on success, and surfaces any error in `actionError` without
    /// dropping it (#953).
    func perform(_ action: MenuBarKernelAction, on kernel: MenuBarKernel) async {
        guard let endpoint = kernel.endpoint ?? endpointsProvider().first else {
            actionError = "\(action.failurePrefix) \(kernel.displayTitle): no active server."
            return
        }
        do {
            let request = try MenuBarKernelAction.request(
                for: action, kernelID: kernel.id, on: endpoint
            )
            try await performAction(request)
            actionError = nil
            await refresh(endpoints: endpointsProvider().isEmpty ? [endpoint] : endpointsProvider())
        } catch {
            actionError = "\(action.failurePrefix) \(kernel.displayTitle): \(error.localizedDescription)"
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
            kernelsError: kernelsError,
            actionError: actionError,
            executions: executions,
            executionsError: executionsError
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
                    sessionsData: sessionsData, kernelsData: kernelsData, endpoint: endpoint
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

    /// Queries `GET /api/executions?limit=<limit>` across active servers (#953).
    /// Returns `.unsupported` when servers return HTTP 404 (predating #1006).
    static func loadExecutions(
        from endpoints: [ServerEndpoint],
        limit: Int = defaultExecutionsLimit,
        transport: HTTPTransport = MenuBarController.performHTTP(_:)
    ) async throws -> MenuBarExecutionsResult {
        var combined: [String: MenuBarExecution] = [:]
        var lastError: Error?
        var succeeded = 0
        var unsupportedCount = 0

        for endpoint in endpoints {
            do {
                let request = MenuBarExecution.request(on: endpoint, limit: limit)
                let (data, status) = try await transport(request)
                if status == 404 {
                    unsupportedCount += 1
                    continue
                }
                guard (200..<300).contains(status) else {
                    throw HTTPFailure(statusCode: status, message: errorMessage(in: data))
                }
                let records = try MenuBarExecution.parse(json: data)
                for record in records where combined[record.executionID] == nil {
                    combined[record.executionID] = record
                }
                succeeded += 1
            } catch {
                lastError = error
            }
        }

        if succeeded > 0 {
            let sorted = combined.values.sorted { lhs, rhs in
                if lhs.startedAt != rhs.startedAt {
                    return lhs.startedAt > rhs.startedAt
                }
                return lhs.executionID > rhs.executionID
            }
            return .loaded(Array(sorted.prefix(limit)))
        }
        if unsupportedCount > 0 && lastError == nil {
            return .unsupported
        }
        if let lastError {
            throw lastError
        }
        return .unsupported
    }

    /// Sends a kernel control HTTP request (`interrupt`, `restart`, `shutDown`),
    /// throwing `HTTPFailure` on non-2xx responses.
    static func sendAction(_ request: URLRequest) async throws {
        var request = request
        request.timeoutInterval = 5
        let (data, status) = try await performHTTP(request)
        guard (200..<300).contains(status) else {
            throw HTTPFailure(statusCode: status, message: errorMessage(in: data))
        }
    }

    private static func performHTTP(_ request: URLRequest) async throws -> (Data, Int) {
        var request = request
        if request.timeoutInterval <= 0 || request.timeoutInterval == 60 {
            request.timeoutInterval = 3
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        return (data, http.statusCode)
    }

    private static func fetchData(_ request: URLRequest) async throws -> Data {
        let (data, status) = try await performHTTP(request)
        guard (200..<300).contains(status) else {
            throw HTTPFailure(statusCode: status, message: errorMessage(in: data))
        }
        return data
    }

    private static func errorMessage(in data: Data) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let message = object["message"] as? String, !message.isEmpty
        else { return nil }
        return message
    }
}
#endif
