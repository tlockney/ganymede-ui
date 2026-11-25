import Foundation
import SwiftUI

/// The keys the Files sidebar acts on itself (#787); Up and Down are the
/// list's own.
enum SidebarKey: Equatable {
    case `return`, right, left

    /// The key a press stands for, or nil for another key or one pressed
    /// with ⌘, ⌥, ⌃ or ⇧. Caps Lock, and the numeric-keypad and function
    /// flags the arrow keys carry, don't count.
    init?(key: KeyEquivalent, modifiers: EventModifiers) {
        guard modifiers.isDisjoint(with: [.command, .option, .control, .shift]) else { return nil }
        if key == .return {
            self = .return
        } else if key == .rightArrow {
            self = .right
        } else if key == .leftArrow {
            self = .left
        } else {
            return nil
        }
    }
}

extension FolderEntry {
    /// Whether this is `removed` or inside it, for a selection kept
    /// across a rename or delete: compared by path with a `/` boundary, so
    /// "moons2" is not inside "moons".
    func isAtOrInside(_ removed: FolderEntry) -> Bool {
        FolderEntry.path(serverPath, isAt: removed.serverPath)
    }
}

/// What a key does to the selected row of the Files sidebar (#787).
enum SidebarKeyAction: Equatable {
    /// Open the file.
    case open
    /// Expand a collapsed folder or collapse an expanded one.
    case toggle
    /// Expand a folder (to a definite value: never a toggle, so the
    /// list's own Right arrow can't undo it).
    case expand
    /// Collapse a folder.
    case collapse
    /// Select the folder holding the row, as Left does in Finder (#791).
    case selectParent

    /// What `key` does to `selected`, or nil when the sidebar leaves the
    /// key alone (the view then returns `.ignored`): no selection, a key
    /// that changes nothing here (Return on a file this place can't open,
    /// Right on a file or an expanded folder, Left on a file or a
    /// collapsed folder at the top level). `canOpen` is
    /// `FolderEntry.canOpen(in:)`; `hasParent` is whether the row is inside
    /// a folder of the tree, not at its top (`SidebarTree.parent(of:root:)`).
    static func action(
        for key: SidebarKey, selected: FolderEntry?, isExpanded: Bool, canOpen: Bool = true,
        hasParent: Bool = false
    ) -> SidebarKeyAction? {
        guard let selected else { return nil }
        switch key {
        case .return:
            if selected.isDirectory { return .toggle }
            return canOpen ? .open : nil
        case .right:
            return selected.isDirectory && !isExpanded ? .expand : nil
        case .left:
            if selected.isDirectory && isExpanded { return .collapse }
            return hasParent ? .selectParent : nil
        }
    }
}

/// The rows the Files sidebar has listed, by the folder holding them
/// (#791): which folder row is a row's parent, for Left, and whether a
/// selected row is still listed after a reload. Each folder's contents
/// record their listing under the URL they were given, which is the
/// folder row's own `url`, so a parent found here is equal to its row's
/// tag, not rebuilt from a path.
struct SidebarTree {
    /// Each listed folder's rows, by the folder's URL.
    private var listings: [URL: [FolderEntry]] = [:]
    /// The folder each listed row is in.
    private var folders: [FolderEntry: URL] = [:]

    /// What `folder` listed last; nil before it was listed.
    func entries(in folder: URL) -> [FolderEntry]? {
        listings[folder]
    }

    /// `folder` now lists `entries`: the rows it listed before and doesn't
    /// now are no longer in it.
    mutating func record(_ entries: [FolderEntry], in folder: URL) {
        for old in listings[folder] ?? [] where folders[old] == folder {
            folders[old] = nil
        }
        listings[folder] = entries
        for entry in entries {
            folders[entry] = folder
        }
    }

    /// The folder row holding `entry`, or nil for a row at the top (in
    /// `root`), one not listed, or one whose folder row is no longer listed.
    func parent(of entry: FolderEntry, root: URL) -> FolderEntry? {
        guard let folder = folders[entry], folder != root else { return nil }
        let parent = FolderEntry(url: folder, isDirectory: true)
        return folders[parent] == nil ? nil : parent
    }

    /// Whether `entry` is still listed under `root`: its folder, and each
    /// folder above it up to `root`, lists the one below. A row a reload
    /// dropped (a file deleted outside the app), or one inside a folder a
    /// reload dropped, is not.
    func lists(_ entry: FolderEntry, root: URL) -> Bool {
        var current = entry
        var seen: Set<URL> = []
        while let folder = folders[current] {
            if folder == root { return true }
            // Never round a loop, however the URLs came to make one.
            guard seen.insert(folder).inserted else { return false }
            current = FolderEntry(url: folder, isDirectory: true)
        }
        return false
    }
}
