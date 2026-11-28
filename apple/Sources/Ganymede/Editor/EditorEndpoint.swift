import Foundation

/// An editor's file when it is a connected machine's (#855): the app's
/// server mounts each machine under `/machines/{id}/`, with the machine's
/// token behind it, so the editor's `/api/contents` reads and writes there.
/// What needs the app model: the server to ask, and the machine's name in
/// the words for a failure.
extension EditorDocument {
    /// A document for `request`'s file, through this device's server or the
    /// app's mount of its machine (`EditorRequest.endpoint(local:)`). The
    /// server is asked on every read and write, so a restarted server's new
    /// address and token are picked up.
    convenience init(_ request: EditorRequest) {
        self.init(
            request,
            local: { AppModel.shared.localServer },
            errorMessage: { error in
                var name: String?
                if let machine = request.machine { name = AppModel.shared.machineName(machine) }
                return FileSourceError.textFileMessage(error, machine: request.machine, name: name)
            }
        )
    }

    /// What the view says about a read or save that failed: a machine's in
    /// the sidebar's words, naming the machine while its remote is here
    /// (`FileSourceError.machineMessage`), so an unmounted machine isn't a
    /// bare HTTP error.
    func message(for error: Error) -> String {
        var name: String?
        if let machine { name = AppModel.shared.machineName(machine) }
        return FileSourceError.textFileMessage(error, machine: machine, name: name)
    }
}
