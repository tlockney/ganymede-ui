## 2026-11-01, SSH terminals on iPad and iPhone (#121)

The iOS app opens shells on remotes over SSH, or on a remote server's Jupyter terminals, from a terminal button in the toolbar. On iPad each terminal is its own scene beside the notebook (the app now supports multiple scenes); on iPhone it is a full-screen cover.

Notes:

- SSH is Apple's [swift-nio-ssh](https://github.com/apple/swift-nio-ssh), not Citadel. Citadel's latest release (0.12.1) depends on a fork of swift-nio-ssh owned by a different GitHub account from Citadel's author, and needs iOS 17. Using swift-nio-ssh directly costs the session glue (a pseudo-terminal request, a shell request, window-change requests, the exit status) and the key handling, and keeps iOS 16.
- Keys: one ed25519 key per device, in the keychain. It is generated in the app, or imported from an unencrypted OpenSSH private key. OpenSSH's key format is short enough to parse by hand (`SSHKeyStore.parseOpenSSH`). RSA and passphrase-protected keys are refused with a message; swift-nio-ssh doesn't do RSA user keys.
- Host keys are trusted on first use and stored per remote in UserDefaults (they are public). A changed key fails the connection with both SHA256 fingerprints, in ssh-keygen's format, and the remote's editor has Forget Host Key.
- The auth and host-key delegates run on the event loop, and the connection error that reaches the app is just a closed channel. They record the reason in a lock-protected box, so the terminal can say "the server did not accept the app's key" instead.
- Output and the exit status go to the main queue with `DispatchQueue.main.async`, which keeps chunks in order, rather than one `Task` per chunk.
- iOS drops sockets about 30 seconds after the app is backgrounded. The terminal shows why the session ended, with Reconnect, which starts a new session in a fresh terminal view.
- The SSH user is required on iOS, since there is no ssh-config or local user name to fall back on.
- No test runs a real SSH session: CI has no sshd. The key format, key storage, host-key trust and fingerprints are unit-tested.
- swift-nio-ssh 0.15.1 doesn't close the connection when a host key or sign-in is refused. A failed host-key check only reaches `errorCaught`, and a client that gives up on sign-in sends nothing. Without a close, the terminal stays blank until sshd's LoginGraceTime (120 s). The delegates now close the connection themselves, a handler closes it on any error, and the handshake has a 30-second limit.
- Don't close the session channel on the server's EOF: OpenSSH can send EOF before `exit-status`, so wait for its close.
- The SSH key's keychain item is `…ThisDeviceOnly`, so backups and device moves don't copy it, and each device's key can be revoked on its own.
