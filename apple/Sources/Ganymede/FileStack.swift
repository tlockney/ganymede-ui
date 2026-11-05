import Foundation

/// The text files over the notebook in the iPad's detail area (#251), by
/// server path, the one on screen last. One file is on screen at a time;
/// a file opened again comes to the top rather than twice.
enum FileStack {
    static func opening(_ path: String, in stack: [String]) -> [String] {
        guard stack.last != path else { return stack }
        return stack.filter { $0 != path } + [path]
    }

    static func closing(_ path: String, in stack: [String]) -> [String] {
        stack.filter { $0 != path }
    }
}
