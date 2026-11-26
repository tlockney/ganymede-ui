import Foundation

/// An editor's file, when it is a connected machine's (#855): the app's
/// server mounts each machine under `/machines/{id}/`, with the machine's
/// token behind it, so the editor's `/api/contents` reads and writes there.
/// What needs the app model: the endpoint, and the machine's name in the
/// words for a failure.
extension EditorDocument {
    /// Where the document reads and writes its file, asked each time so a
    /// restarted server's new address and token are picked up: this
    /// device's server, or the machine's mount on it. A machine whose id
    /// isn't one gets no endpoint, never this device's server, which would
    /// open a path of this Mac's instead.
    static func endpoint(machine: String?) -> @MainActor () -> ServerEndpoint? {
        guard let machine else { return { AppModel.shared.localServer } }
        return { AppModel.shared.localServer?.mounted(machine: machine) }
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
