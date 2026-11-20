import SwiftUI

/// General's switch for the Developer settings (#698), on the Mac's General
/// tab and the iPad and iPhone's Settings screen. Off by default; the
/// Developer tab, or row, shows only while it's on.
struct ShowDeveloperSettingsSection: View {
    @AppStorage(SettingsTab.developerKey) private var shown = false

    var body: some View {
        Section {
            Toggle("Show Developer Settings", isOn: $shown)
        } footer: {
            Text("Adds Developer settings: an engine benchmark and tests for crash reports.")
        }
    }
}

/// Settings > Developer (#698): an engine benchmark and the crash report
/// tests, on Mac and iOS.
struct DeveloperSettings: View {
    var benchmark: EngineBenchmark = .shared
    var reports: CrashReports = .shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Form {
            EngineBenchmarkSection(benchmark: benchmark)
            if benchmark.hasResults {
                EngineBenchmarkResults(benchmark: benchmark)
            }
            CrashReportTestsSection(reports: reports)
        }
        .formStyle(.grouped)
        .navigationTitle("Developer")
        // WebKit throttles a page that isn't shown: the results say so.
        .onDisappear { benchmark.screenLeft() }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { benchmark.screenLeft() }
        }
    }
}

/// The benchmark's button and progress.
private struct EngineBenchmarkSection: View {
    var benchmark: EngineBenchmark

    var body: some View {
        Section {
            Button("Run Benchmark") {
                Task { await benchmark.run() }
            }
            .disabled(benchmark.running)
            if benchmark.running {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text(benchmark.step)
                        .foregroundStyle(.secondary)
                }
            }
            if let page = benchmark.page {
                BenchWorkerView(page: page)
                    .frame(height: 120)
            }
            if let failure = benchmark.failure {
                Text(failure)
                    .foregroundStyle(.red)
            }
            if benchmark.leftScreen {
                Text("This screen or the app left the front during the run, so WebKit's numbers may be low. Run it again.")
                    .foregroundStyle(.orange)
            }
        } header: {
            Text("Engine Benchmark")
        } footer: {
            Text("Runs the workloads of the V8 spike on jitless V8 and on WebKit Workers, the engine of today's in-app kernel. "
                + "It takes under a minute: keep this screen open, with the app in front, until it's done. "
                + "V8 initializes once per process, so for steady numbers quit and relaunch the app between runs.")
        }
    }
}

/// Per workload, cold and steady times in ms for each engine, the device,
/// and Share and Copy for the results file.
private struct EngineBenchmarkResults: View {
    var benchmark: EngineBenchmark

    var body: some View {
        Section {
            LabeledContent("V8 (jitless)", value: benchmark.v8Available ? "Included" : "Not in this build")
            ForEach(benchmark.rows) { row in
                LabeledContent(row.name) {
                    VStack(alignment: .trailing, spacing: 2) {
                        if let v8 = row.v8 {
                            Text("V8 \(v8.text)")
                        }
                        if let webkit = row.webkit {
                            Text("WebKit \(webkit.text)")
                        }
                    }
                    .font(.callout.monospacedDigit())
                }
            }
            ForEach(benchmark.problems, id: \.self) { problem in
                Text(problem)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .textSelection(.enabled)
            }
            if !benchmark.device.isEmpty {
                LabeledContent("Device", value: benchmark.device)
                LabeledContent("OS", value: benchmark.os)
            }
            if let footprint = benchmark.footprint {
                LabeledContent("App peak footprint", value: "\(EngineBench.mb(footprint.peak)) MB")
            }
            if !benchmark.running {
                if let file = benchmark.resultsFile {
                    ShareLink("Share Results", item: file)
                }
                if let text = benchmark.resultsText {
                    Button("Copy Results") { copyToPasteboard(text) }
                }
            }
        } header: {
            Text("Results")
        } footer: {
            Text("Cold start to the first result, then the median of the later runs, in ms (cold / steady). "
                + "The footprint is the app's, as the system counts it; WebKit's Workers run in another process, which the app can't read. "
                + "Share writes results-<time>.json, which node bench/report.mjs in ganymede's spikes/v8-engine reads.")
        }
    }
}

/// The crash report tests (they were in General's crash report section):
/// each sends what a real failure would. They need crash reports on.
struct CrashReportTestsSection: View {
    var reports: CrashReports

    var body: some View {
        Section {
            ForEach(CrashReports.Test.allCases) { test in
                Button(test.rawValue, role: test.crashes ? .destructive : nil) {
                    reports.run(test)
                }
                .disabled(!reports.enabled)
            }
            if !reports.enabled {
                #if os(macOS)
                Text("Turn on Send crash reports in General to use these.")
                    .foregroundStyle(.secondary)
                #else
                Text("Turn on Send crash reports in Settings to use these.")
                    .foregroundStyle(.secondary)
                #endif
            }
        } header: {
            Text("Crash Report Tests")
        } footer: {
            Text("The crash buttons end the app; the report is sent the next time it launches.")
        }
    }
}
