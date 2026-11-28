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
            Text("Adds Developer settings: tests for crash reports.")
        }
    }
}

/// Settings > Developer (#698): the crash report tests, on Mac and iOS.
/// The engine benchmark it also held went with V8 (#765).
struct DeveloperSettings: View {
    var reports: CrashReports = .shared

    var body: some View {
        Form {
            CrashReportTestsSection(reports: reports)
        }
        .formStyle(.grouped)
        .navigationTitle("Developer")
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
