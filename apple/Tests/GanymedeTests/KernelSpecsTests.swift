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

    func testRejectsOtherBodies() {
        XCTAssertNil(KernelSpecs(json: Data("[]".utf8)))
        XCTAssertNil(KernelSpecs(json: Data("not json".utf8)))
    }
}
