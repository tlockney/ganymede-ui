import Foundation
#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif

/// What the app last saw of a file, as a short string, so an answer kept
/// for a notebook (the permission ledger's, the app's "Always allow" for
/// links) can be forgotten when the file is replaced outside the app: by
/// git, Finder, a download, another editor, a sync.
///
/// The stamp is `"<size>:<mtime in nanoseconds>:<inode>"`, the same string
/// the Ganymede server makes (`file_stamp` in
/// `crates/ganymede-contents/src/fileid.rs`), which is what lets the
/// server's write reports (`ServerWriteLog`) be compared with it. A rewrite in place changes
/// the size or the mtime. A replace by rename (write a temp file, move it
/// over: how git, most editors and the server itself save) gives the path
/// a new inode, even when the size and mtime happen to match. The change
/// time is left out on purpose: `chmod`, extended attributes, Finder's
/// tags, the quarantine flag and iCloud all move it with no change to the
/// contents, and each would forget an answer for nothing. The device
/// number is left out too, since it can differ between mounts of one
/// volume.
///
/// What it can't see: a rewrite in place that keeps the size and sets the
/// mtime back (`touch -r`, `cp -p`, rsync with `-t`), and, on a file
/// system that reuses inodes, a replacement that lands on the freed inode
/// with the same size and mtime. Neither happens by accident.
public enum FileStamp {
    /// The stamp of the file at `path`, following symbolic links, or nil
    /// when it can't be read (no such file, no access).
    public static func of(_ path: String) -> String? {
        var info = stat()
        guard stat(path, &info) == 0 else { return nil }
        #if canImport(Darwin)
        let modified = info.st_mtimespec
        #else
        let modified = info.st_mtim
        #endif
        // The server's `file_stamp` takes the time since the epoch and turns
        // a time before it into 0. Wrapping, so an absurd mtime (a file
        // dated far in the future) gives some stamp instead of a trap.
        let nanoseconds = max(Int64(modified.tv_sec) &* 1_000_000_000 &+ Int64(modified.tv_nsec), 0)
        return "\(info.st_size):\(nanoseconds):\(info.st_ino)"
    }

    /// What a check of a kept answer does, given its stamp and the file's.
    public enum Verdict: Equatable {
        /// The answer holds as it is.
        case keep
        /// The answer holds and takes this stamp.
        case restamp(String)
        /// The file changed since the answer was kept: forget it.
        case drop
    }

    /// The one rule every kept answer follows (#584): `was` is the stamp
    /// the answer holds, `now` the file's (`of`), `path` the notebook.
    /// - no file (`now` nil): keep, so a move can carry the answer;
    /// - no stamp: take the file's (trust on first use, for answers kept
    ///   before stamps or while the file wasn't there);
    /// - the same stamp: keep;
    /// - a different one: keep and take it when the server's reported
    ///   writes (`log`) lead from `was` to `now`, since the server wrote
    ///   the file and the app hasn't restamped yet; otherwise drop.
    public static func verdict(was: String?, now: String?, path: String, log: ServerWriteLog?) -> Verdict {
        guard let now else { return .keep }
        guard let was else { return .restamp(now) }
        if was == now { return .keep }
        if log?.leads(path: canonical(path), from: was, to: now) == true { return .restamp(now) }
        return .drop
    }

    /// The stamp an answer takes when the server wrote its file (the
    /// write's `before` and `after`), or nil when it stays: it takes
    /// `after` when it was for `before` or has none; one at another stamp
    /// stays, since something else changed the file first and the
    /// server's write doesn't make that the app's; and nothing moves when
    /// `after` is nil (the server couldn't read the file again).
    public static func moved(was: String?, before: String?, after: String?) -> String? {
        guard let after, was == nil || was == before, was != after else { return nil }
        return after
    }

    /// `path` with every link resolved, as the server names a file
    /// (`realpath`: on macOS it keeps `/private`, where
    /// `resolvingSymlinksInPath` drops it). A path that isn't there is
    /// returned as it was given, standardized.
    public static func canonical(_ path: String) -> String {
        canonical(URL(fileURLWithPath: path))
    }

    /// As `canonical(_:)`, for a file URL.
    public static func canonical(_ url: URL) -> String {
        url.withUnsafeFileSystemRepresentation { path in
            guard let path, let real = realpath(path, nil) else { return nil }
            defer { free(real) }
            return String(cString: real)
        } ?? url.standardizedFileURL.path
    }
}
