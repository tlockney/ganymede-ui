import Foundation

/// A kernel's log as the server keeps it (`GET /api/kernels/{id}/log`,
/// ganymede#366): the kernel process's stdout and stderr outside its cell
/// output, and the server's lines about the process. The bottom panel's
/// Kernel Log tab follows it (#248).
struct KernelLog: Equatable {
    struct Line: Equatable, Identifiable {
        var seq: Int
        var time: String
        /// `stdout`, `stderr` or `host`.
        var source: String
        var text: String
        var id: Int { seq }
    }

    /// One answer from the server.
    struct Page: Equatable {
        var lines: [Line]
        var lastSeq: Int
        /// `no_process` for a kernel the server runs no process for (on a
        /// gateway, or in-process): it has no log.
        var reason: String?

        /// From the route's JSON body; nil when it isn't one.
        init?(json data: Data) {
            guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let lines = object["lines"] as? [[String: Any]],
                  let lastSeq = object["last_seq"] as? Int
            else { return nil }
            self.lines = lines.compactMap { line in
                guard let seq = line["seq"] as? Int, let text = line["text"] as? String else { return nil }
                return Line(
                    seq: seq,
                    time: line["time"] as? String ?? "",
                    source: line["source"] as? String ?? "host",
                    text: text
                )
            }
            self.lastSeq = lastSeq
            reason = object["reason"] as? String
        }
    }

    enum Status: Equatable {
        case following
        /// The server runs no process for this kernel, so it has no log.
        case noProcess
        /// The server has no log route (404): `jupyter_server`, or a
        /// Ganymede older than the route.
        case unsupported
    }

    /// Lines kept, as many as the server keeps.
    static let limit = 1000

    private(set) var lines: [Line] = []
    /// The `seq` of the last line read: the next request's `after`.
    private(set) var after = 0
    private(set) var status = Status.following

    /// Adds a page's new lines, keeping the last `limit`. Returns whether
    /// the server has more past them, to ask again at once.
    @discardableResult
    mutating func append(_ page: Page) -> Bool {
        if page.reason == "no_process" {
            status = .noProcess
            return false
        }
        status = .following
        let new = page.lines.filter { $0.seq > after }
        lines.append(contentsOf: new)
        if lines.count > Self.limit { lines.removeFirst(lines.count - Self.limit) }
        after = max(after, new.last?.seq ?? after)
        return !new.isEmpty && after < page.lastSeq
    }

    mutating func markUnsupported() {
        status = .unsupported
    }

    /// The request for the lines after `after` of `kernel`'s log.
    static func request(kernel: String, after: Int, on server: ServerEndpoint) -> URLRequest {
        let route = server.url("api/kernels/\(kernel)/log")
        var parts = URLComponents(url: route, resolvingAgainstBaseURL: false)
        parts?.queryItems = [
            URLQueryItem(name: "after", value: String(after)),
            URLQueryItem(name: "lines", value: String(limit)),
        ]
        var request = URLRequest(url: parts?.url ?? route)
        request.setValue("token \(server.token)", forHTTPHeaderField: "Authorization")
        return request
    }
}
