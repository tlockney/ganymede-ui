import Foundation

/// What an editor window opens: a text file on the app's own server, by
/// its path there, or a connected machine's through the app's mount
/// (#855). Opening a file that is already open brings its window to the
/// front, since the values are equal; the same path on this device and on
/// a machine are two files, and two windows.
struct EditorRequest: Codable, Hashable, Identifiable {
    var path: String
    /// The machine whose file this is; nil for this device's. A request
    /// saved by an older build has only `path`, so decodes as this
    /// device's.
    var machine: String? = nil

    var id: String { machine.map { "\($0):\(path)" } ?? path }

    /// The file's path for `OpenTextFiles`, which a folder switch of this
    /// device waits on: a machine's file has none, since that switch
    /// restarts this device's server, not the machine's (#855).
    var thisDevicePath: String? { machine == nil ? path : nil }
}

// MARK: - Where the file is read (#855)

extension EditorRequest {
    /// The request for `path` in `place`'s window (#855).
    init(path: String, place: Place) {
        self.init(path: path, machine: place.machineID)
    }

    /// The server this request's file is on (#855): this device's, or the
    /// app's mount of the machine. Nil without a server, for a machine id
    /// that isn't valid (never this device's server instead), and for a
    /// machine path with an empty, `.` or `..` segment.
    func endpoint(local: ServerEndpoint?) -> ServerEndpoint? {
        guard let machine else { return local }
        // A request decoded from another build can name an id `Place`
        // would refuse, and the mount would then be asked for a path that
        // isn't a machine's.
        guard Place.isValidMachineID(machine), !Self.climbsOut(path) else { return nil }
        return local?.mounted(machine: machine)
    }

    /// Whether a machine's `path` has a segment that leaves its root:
    /// `appendingPathComponent` keeps `..` as it is.
    private static func climbsOut(_ path: String) -> Bool {
        let relative = path.hasPrefix("/") ? path.dropFirst() : path[...]
        return relative.split(separator: "/", omittingEmptySubsequences: false)
            .contains { $0.isEmpty || $0 == "." || $0 == ".." }
    }
}
