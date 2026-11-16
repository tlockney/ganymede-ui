## 2026-11-16, docs freshness: switching-backends known gap (#643)

The weekly docs check found README's Known gaps still saying that
switching backends leaves the old backend's kernels running with no way
to reach them. #62 was fixed in October, and architecture.md says a
server's kernels show under Running when the app connects to that
server again, while in-page kernels are shut down first. The gap is
removed.
