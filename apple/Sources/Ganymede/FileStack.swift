import Foundation

/// The text files over the notebook in the iPad's detail area (#251), by
/// the file, the one on screen last. One file is on screen at a time; a
/// file opened again comes to the top rather than twice. What a file is
/// is the stack's: a server path, or an `EditorRequest`, which tells this
/// device's file from a machine's of the same path (#855).
enum FileStack {
    static func opening<File: Equatable>(_ file: File, in stack: [File]) -> [File] {
        guard stack.last != file else { return stack }
        return stack.filter { $0 != file } + [file]
    }

    static func closing<File: Equatable>(_ file: File, in stack: [File]) -> [File] {
        stack.filter { $0 != file }
    }
}
