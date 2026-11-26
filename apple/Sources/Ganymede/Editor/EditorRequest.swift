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
