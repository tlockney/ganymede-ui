## 2026-11-20, V8 benchmark: check address space before starting V8 (#755)

Run Benchmark crashed the iPhone app (iPhone18,4, iOS 27.2.1, TestFlight
0.14.1). The crash report has `brk #0` in V8's `base::OS::Abort` on the
`ganymede-v8-bench` thread, and no V8 reservation in the memory map (only
JavaScriptCore's 2 GB). When V8 starts it reserves Oilpan's caged heap: 4
GB aligned to 4 GB, first tried as 8 GB aligned to 4 GB, about 12 GB of
contiguous address space for a moment. (The pinned rusty_v8 library has no
pointer compression cage, and jitless V8 no code range.) An iOS app gets
less address space than that without the
`com.apple.developer.kernel.extended-virtual-addressing` entitlement, and V8
aborts the process when the reservation fails. The Mac has no such limit.

`EngineBenchmark.v8AddressSpaceProblem` now reserves 12 GB (`PROT_NONE`,
nothing committed) and frees it, once, before the first run starts V8. If
that fails, the run skips V8 with the reason as its error report
(`Engines.v8Blocked`, which every `Engines` must pass), the results list
shows it, and the WebKit half runs as before. `EngineBenchmarkRunTests`
covers a blocked V8, the size the check reserves and the reason it gives,
the check passing on the Mac and the simulator, and an impossible
reservation reported as a problem. That `.live` passes the real check
can't be told apart on the Mac, where it passes; a comment there says so.
The blocked path on a device is a by-hand check on #755. docs/apps.md
says what a device without the address space shows.

Thomas turned on Extended Virtual Address Space for the App ID and
replaced `IOS_PROVISIONING_PROFILE`, so Ganymede-iOS now has the
entitlement (apple/project.yml), and release-ios.sh fails early when the
app's profile lacks it, as it does for the App Group. docs/releasing.md's
setup steps name the capability. With the entitlement in the same build,
#755's by-hand check of the blocked path is skipped; what's left is the
re-run on the iPhone, results on ganymede#646.
