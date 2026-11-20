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
(`Engines.v8Blocked`, which every `Engines` must pass, so `.live` can't
drop it unnoticed), the results list shows it, and the WebKit half runs as
before. `EngineBenchmarkRunTests` covers a blocked V8, the check passing on
the Mac and the simulator, and an impossible reservation reported as a
problem. docs/apps.md says what a device without the address space shows.

Still to do on #755: the entitlement on Ganymede-iOS, once the App ID has
the capability and the App Store profile is regenerated, then a re-run on
the iPhone.
