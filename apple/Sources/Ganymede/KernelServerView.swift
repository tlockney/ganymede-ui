import SwiftUI

/// Where kernels run: on this device (the Mac's kernelspecs), or on
/// another Jupyter or Ganymede server, which the in-process server proxies
/// (`gateway_url`). Saving restarts the server.
struct KernelServerView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var url = ""
    @State private var token = ""

    var body: some View {
        Form {
            Section {
                TextField("https://host:8888", text: $url)
                    .autocorrectionDisabled()
                    #if os(iOS)
                    .textContentType(.URL)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    #endif
                SecureField("Token", text: $token)
            } header: {
                Text("Kernel server")
            } footer: {
                Text(footer)
            }
            Section {
                Button("Save") {
                    model.setKernelServer(url: url, token: token)
                    dismiss()
                }
                .disabled(!valid)
                if !model.kernelServerURL.isEmpty {
                    Button("Use Kernels on This Device", role: .destructive) {
                        model.setKernelServer(url: "", token: "")
                        dismiss()
                    }
                }
            }
        }
        .formStyle(.grouped)
        .onAppear {
            url = model.kernelServerURL
            token = model.kernelServerToken
        }
    }

    private var valid: Bool {
        let trimmed = url.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return true }
        guard let parsed = URL(string: trimmed), let scheme = parsed.scheme?.lowercased() else {
            return false
        }
        return (scheme == "http" || scheme == "https") && parsed.host != nil
    }

    private var footer: String {
        #if os(iOS)
        return "Notebooks stay on this device; their kernels run on a Jupyter or Ganymede server, "
            + "such as `ganymede serve --ip 0.0.0.0` on your Mac. Running kernels are shut down when you save."
        #else
        return "Leave empty to use the kernels installed on this Mac. Otherwise notebooks stay here and "
            + "their kernels run on that server. Running kernels are shut down when you save."
        #endif
    }
}
