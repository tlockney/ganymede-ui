import XCTest

/// Settings › Kernels lists the server's kernelspecs (#206).
final class KernelSpecsTests: XCTestCase {
    func testReadsTheServersKernels() throws {
        let body = Data("""
        {"default": "cdp-node", "kernelspecs": {
          "cdp-node": {"name": "cdp-node", "spec": {"display_name": "TypeScript (cdp-kernel, node)", "language": "typescript"}},
          "python3": {"name": "python3", "spec": {"display_name": "Python 3", "language": "python"}},
          "bare": {"spec": {}}
        }}
        """.utf8)
        let specs = try XCTUnwrap(KernelSpecs(json: body))
        XCTAssertEqual(specs.defaultName, "cdp-node")
        XCTAssertEqual(specs.specs.map(\.displayName), ["bare", "Python 3", "TypeScript (cdp-kernel, node)"])
        XCTAssertEqual(specs.specs.first?.language, nil)
        XCTAssertEqual(specs.specs.last?.language, "typescript")
    }

    func testReadsKernelDetails() throws {
        let body = Data("""
        {"default": "k", "kernelspecs": {
          "k": {"name": "k", "resource_dir": "/usr/share/jupyter/kernels/k",
            "spec": {"display_name": "K", "language": "python", "interrupt_mode": "message",
              "kernel_protocol_version": "5.3",
              "argv": ["python3", "-m", "k", "-f", "{connection_file}"],
              "env": {"B": "2", "A": "one"},
              "metadata": {"debugger": true, "count": 3, "ratio": 1.5, "note": "hi",
                "nested": {"b": [1, "x"], "a": null, "path": "/a/b"}}},
            "resources": {"logo-32x32": "/kernelspecs/k/logo-32x32.png"}}
        }}
        """.utf8)
        let spec = try XCTUnwrap(KernelSpecs(json: body)?.specs.first)
        XCTAssertEqual(spec.resourceDir, "/usr/share/jupyter/kernels/k")
        XCTAssertEqual(spec.interruptMode, "message")
        XCTAssertEqual(spec.protocolVersion, "5.3")
        XCTAssertEqual(spec.argv, ["python3", "-m", "k", "-f", "{connection_file}"])
        XCTAssertEqual(spec.env, [.init(key: "A", value: "one"), .init(key: "B", value: "2")])
        XCTAssertEqual(spec.metadata.map(\.key), ["count", "debugger", "nested", "note", "ratio"])
        let values = Dictionary(uniqueKeysWithValues: spec.metadata.map { ($0.key, $0.value) })
        XCTAssertEqual(values["debugger"], "true")
        XCTAssertEqual(values["count"], "3")
        XCTAssertEqual(values["ratio"], "1.5")
        XCTAssertEqual(values["note"], "hi")
        XCTAssertEqual(values["nested"], #"{"a":null,"b":[1,"x"],"path":"/a/b"}"#)
        XCTAssertTrue(spec.hasDetails)
    }

    func testDetailsAreOptional() throws {
        let body = Data("""
        {"kernelspecs": {"bare": {"spec": {}}, "odd": {"name": "odd", "spec": {"argv": "no", "env": [1], "metadata": null}}}}
        """.utf8)
        let specs = try XCTUnwrap(KernelSpecs(json: body)).specs
        XCTAssertEqual(specs.count, 2)
        for spec in specs {
            XCTAssertNil(spec.resourceDir)
            XCTAssertNil(spec.interruptMode)
            XCTAssertNil(spec.protocolVersion)
            XCTAssertEqual(spec.argv, [])
            XCTAssertEqual(spec.env, [])
            XCTAssertEqual(spec.metadata, [])
            XCTAssertFalse(spec.hasDetails)
        }
    }

    func testEmptyStringsAreAbsent() throws {
        let body = Data("""
        {"kernelspecs": {"k": {"name": "k", "resource_dir": "",
          "spec": {"display_name": "K", "language": "", "interrupt_mode": "",
            "kernel_protocol_version": ""}}}}
        """.utf8)
        let spec = try XCTUnwrap(KernelSpecs(json: body)?.specs.first)
        XCTAssertNil(spec.protocolVersion)
        XCTAssertNil(spec.interruptMode)
        XCTAssertNil(spec.language)
        XCTAssertNil(spec.resourceDir)
        XCTAssertFalse(spec.hasDetails)
    }

    func testReadsWhereKernelsRun() throws {
        let body = Data("""
        {"default": "k", "kernelspecs": {
          "k": {"name": "k", "gateway": true, "spec": {"display_name": "K"}},
          "python3": {"name": "python3", "spec": {"display_name": "Python 3"}}
        }, "gateway": {"name": "workmbp", "reachable": false, "error": "gateway: error sending request"}}
        """.utf8)
        let specs = try XCTUnwrap(KernelSpecs(json: body))
        XCTAssertEqual(specs.specs.map(\.name), ["k", "python3"])
        XCTAssertEqual(specs.specs.map(\.gateway), [true, false], "a server older than #832 sends none")
        XCTAssertEqual(specs.remote, .init(name: "workmbp", reachable: false, error: "gateway: error sending request"))
        XCTAssertEqual(specs.notAnswering(), "workmbp isn’t answering: gateway: error sending request")
        XCTAssertEqual(specs.notAnswering(name: "work bench"), "work bench isn’t answering: gateway: error sending request")
    }

    func testNoRemoteLineWhenNoneIsSentOrItAnswers() throws {
        for body in [
            #"{"kernelspecs": {}}"#,
            #"{"kernelspecs": {}, "gateway": {"name": "workmbp", "reachable": true}}"#,
            #"{"kernelspecs": {}, "gateway": {"name": "workmbp", "reachable": false, "error": ""}}"#,
            #"{"kernelspecs": {}, "gateway": {"reachable": false}}"#,
            #"{"kernelspecs": {}, "gateway": "workmbp"}"#,
        ] {
            let specs = try XCTUnwrap(KernelSpecs(json: Data(body.utf8)))
            XCTAssertNil(specs.notAnswering(), body)
        }
    }

    /// An answer from the server of the remote chosen before a switch is not
    /// the new remote's (#854). A is chosen and asleep; the person switches
    /// to B while A's start is still queued; A's start runs, so the server
    /// is A's again and answers, then B's start runs. Settings must not say
    /// "Laptop isn't answering" with A's error, nor label A's kernels
    /// "· Laptop".
    func testSettingsReadsAnAnswerAsTheRemoteTheServerWasStartedFor() throws {
        let body = #"{"kernelspecs": {}, "gateway": {"name": "a-host", "reachable": false, "error": "asleep"}}"#
        let fromA = try XCTUnwrap(KernelSpecs(json: Data(body.utf8)))
        let bBody = #"{"kernelspecs": {}, "gateway": {"name": "b-host", "reachable": false, "error": "off"}}"#
        let fromB = try XCTUnwrap(KernelSpecs(json: Data(bBody.utf8)))
        let a = Remote(name: "Studio", serverURL: "http://a-host:8888")
        let b = Remote(name: "Laptop", serverURL: "http://b-host:8888")
        var served = ServedKernels()

        // Starts for A and then B are asked for; each takes its ticket then.
        let startA = served.ticket(for: a)
        let startB = served.ticket(for: b)
        XCTAssertNil(Remote.notAnswering(in: fromA, chosen: b, served: served), "no server up yet")
        // A's queued start runs: its server listens while B is chosen.
        served.listening(startA)
        XCTAssertNil(Remote.notAnswering(in: fromA, chosen: b, served: served), "A's answer while B is chosen")
        XCTAssertEqual(Remote.kernelsLabel(in: fromA, chosen: b, served: served), "a-host",
                       "the server's own name for A, not B's")
        XCTAssertEqual(Remote.notAnswering(in: fromA, chosen: a, served: served), "Studio isn’t answering: asleep",
                       "had A still been chosen")
        // B's start begins, then its server listens.
        served.clear()
        XCTAssertNil(Remote.notAnswering(in: fromA, chosen: b, served: served))
        served.listening(startB)
        XCTAssertEqual(Remote.notAnswering(in: fromB, chosen: b, served: served), "Laptop isn’t answering: off")
        XCTAssertEqual(Remote.kernelsLabel(in: fromB, chosen: b, served: served), "Laptop")
        // Kernels on this device: no remote is chosen.
        XCTAssertNil(Remote.notAnswering(in: fromB, chosen: nil, served: served))
        // An answer that names no remote has no label.
        let local = try XCTUnwrap(KernelSpecs(json: Data(#"{"kernelspecs": {}}"#.utf8)))
        XCTAssertNil(Remote.kernelsLabel(in: local, chosen: b, served: served))
    }

    /// Editing the chosen remote's URL restarts the server: a start for the
    /// old URL still queued serves the old server, whose answer isn't the
    /// edited remote's (#854).
    func testAnEditedURLIsAnotherServer() throws {
        let body = #"{"kernelspecs": {}, "gateway": {"name": "old", "reachable": false, "error": "asleep"}}"#
        let fromOld = try XCTUnwrap(KernelSpecs(json: Data(body.utf8)))
        var remote = Remote(name: "Studio", serverURL: "http://old:8888")
        var served = ServedKernels()
        let startOld = served.ticket(for: remote)
        remote.serverURL = "http://new:8888"
        served.listening(startOld)
        XCTAssertNil(Remote.notAnswering(in: fromOld, chosen: remote, served: served))
        served.listening(served.ticket(for: remote))
        XCTAssertEqual(Remote.notAnswering(in: fromOld, chosen: remote, served: served),
                       "Studio isn’t answering: asleep")
        XCTAssertNil(served.ticket(for: nil), "kernels on this device take no ticket")
    }

    /// Editing the chosen remote's token restarts the server too: the old
    /// token's server, from a start still queued, isn't the edited one
    /// (#854).
    func testAnEditedTokenIsAnotherServer() throws {
        let body = #"{"kernelspecs": {}, "gateway": {"name": "studio", "reachable": false, "error": "403"}}"#
        let fromOld = try XCTUnwrap(KernelSpecs(json: Data(body.utf8)))
        let remote = Remote(name: "Studio", serverURL: "http://studio:8888")
        var served = ServedKernels()
        let startOld = served.ticket(for: remote)
        served.edited()
        served.listening(startOld)
        XCTAssertNil(Remote.notAnswering(in: fromOld, chosen: remote, served: served))
        XCTAssertEqual(Remote.kernelsLabel(in: fromOld, chosen: remote, served: served), "studio",
                       "the server's own name, not the app's")
        served.listening(served.ticket(for: remote))
        XCTAssertEqual(Remote.notAnswering(in: fromOld, chosen: remote, served: served), "Studio isn’t answering: 403")
    }

    func testShellCommandQuotesWhatNeedsIt() {
        XCTAssertEqual(KernelSpecs.shellCommand(["python3", "-m", "k", "-f", "{connection_file}"]),
                       "python3 -m k -f {connection_file}")
        XCTAssertEqual(KernelSpecs.shellCommand(["/Users/me/My Tools/node", "a'b", "", "x;y", "$HOME"]),
                       "'/Users/me/My Tools/node' 'a'\\''b' '' 'x;y' '$HOME'")
        XCTAssertEqual(KernelSpecs.shellCommand([]), "")
    }

    func testRejectsOtherBodies() {
        XCTAssertNil(KernelSpecs(json: Data("[]".utf8)))
        XCTAssertNil(KernelSpecs(json: Data("not json".utf8)))
    }
}
