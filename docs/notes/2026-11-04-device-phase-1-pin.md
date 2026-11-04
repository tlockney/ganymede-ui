## 2026-11-04, device API: info, haptics, openURL and clipboard images in the app (tlockney/ganymede-device#20)

- The app moves to ganymede-device `f978944`, which has tlockney/ganymede-device#28
  (`info()` state, haptics, `openURL`) and #29 (binary values over the
  bridge, clipboard images). Three pins move together: `apple/project.yml`
  and `apple/Package.resolved` for the Swift `DeviceBridge`, and
  `package-lock.json` for the TypeScript package the kernel web view loads.
- The lock entry was edited by hand: this container's npm 10.9 rewrites
  every optional package's `libc` field when it touches the lock. A git
  dependency's `integrity` is dropped with the old commit, since npm
  computes it from the packed tarball; `npm ci` fills it in.
- `KernelHostTests` checks the Mac's `hello`: the six methods every bridge
  answers, without haptics, which a Mac lacks.
