## 2026-11-12, Mac MCP token and info file follow-ups (#535)

A review of #525's last commit, after the merge, found that turning MCP
off ignored a keychain error, so a revoked token could come back. Turning
MCP on after Off now always makes a new token, so Off revokes even when
the keychain refuses the delete, and the error is shown. Reset Token
checks what is still saved after a failure, so its message says whether
the old token returns at the next launch.

The server info file is written to a hidden 0600 file and renamed into
place, as ganymede's `server_info.rs` does, so `ganymede mcp` never reads
it half written. Files a crashed run left are cleared at every launch,
not only when MCP starts. Keychain messages now add to each other instead
of replacing one another, under an alert titled "Keychain".

`ganymedeCommand()` still scans PATH on each Settings render: a few
`stat` calls, so not worth a cache that could go stale.
