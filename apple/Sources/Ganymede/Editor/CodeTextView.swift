import Neon
import SwiftUI

/// The system text view (`NSTextView`, `UITextView`) for code: plain text
/// in a monospaced font, no smart quotes or autocorrection, the system's
/// find, undo, input methods, dictation and accessibility, and Neon's
/// highlighting when the language is known (#122).
#if os(macOS)
struct CodeTextView: NSViewRepresentable {
    let document: EditorDocument

    func makeCoordinator() -> CodeTextCoordinator { CodeTextCoordinator(document: document) }

    func makeNSView(context: Context) -> NSScrollView {
        // TextKit 1, which Neon highlights most reliably.
        let textView = NSTextView(usingTextLayoutManager: false)
        textView.isRichText = false
        textView.importsGraphics = false
        textView.allowsUndo = true
        textView.usesFindBar = true
        textView.isIncrementalSearchingEnabled = true
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.isAutomaticTextReplacementEnabled = false
        textView.isAutomaticSpellingCorrectionEnabled = false
        textView.isContinuousSpellCheckingEnabled = false
        textView.isGrammarCheckingEnabled = false
        textView.smartInsertDeleteEnabled = false
        textView.font = Highlighting.font
        textView.textColor = Highlighting.textColor
        textView.typingAttributes = [.font: Highlighting.font, .foregroundColor: Highlighting.textColor]
        textView.textContainerInset = NSSize(width: 4, height: 6)
        textView.layoutManager?.allowsNonContiguousLayout = true

        let scrollView = NSScrollView()
        scrollView.hasVerticalScroller = true
        scrollView.borderType = .noBorder
        scrollView.drawsBackground = false
        textView.minSize = .zero
        textView.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.autoresizingMask = [.width]
        textView.textContainer?.widthTracksTextView = true
        scrollView.documentView = textView

        textView.delegate = context.coordinator
        context.coordinator.attach(textView)
        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        context.coordinator.sync()
    }
}

@MainActor
final class CodeTextCoordinator: NSObject, NSTextViewDelegate {
    let document: EditorDocument
    private weak var textView: NSTextView?
    private var highlighter: TextViewHighlighter?
    private var generation = -1

    init(document: EditorDocument) {
        self.document = document
    }

    func attach(_ textView: NSTextView) {
        self.textView = textView
        highlighter = makeHighlighter(for: textView, language: document.language)
        sync()
    }

    /// Takes the document's text after a load.
    func sync() {
        guard let textView, document.generation != generation else { return }
        generation = document.generation
        textView.string = document.text
        textView.undoManager?.removeAllActions()
    }

    func textDidChange(_ notification: Notification) {
        guard let textView else { return }
        document.edited(textView.string)
    }
}
#else
struct CodeTextView: UIViewRepresentable {
    let document: EditorDocument

    func makeCoordinator() -> CodeTextCoordinator { CodeTextCoordinator(document: document) }

    func makeUIView(context: Context) -> UITextView {
        // TextKit 1, which Neon highlights most reliably.
        let textView = UITextView(usingTextLayoutManager: false)
        textView.font = Highlighting.font
        textView.textColor = Highlighting.textColor
        textView.typingAttributes = [.font: Highlighting.font, .foregroundColor: Highlighting.textColor]
        textView.backgroundColor = .systemBackground
        textView.autocorrectionType = .no
        textView.autocapitalizationType = .none
        textView.smartQuotesType = .no
        textView.smartDashesType = .no
        textView.smartInsertDeleteType = .no
        textView.spellCheckingType = .no
        textView.isFindInteractionEnabled = true
        textView.keyboardDismissMode = .interactive
        textView.alwaysBounceVertical = true
        textView.textContainerInset = UIEdgeInsets(top: 8, left: 4, bottom: 8, right: 4)
        textView.delegate = context.coordinator
        context.coordinator.attach(textView)
        return textView
    }

    func updateUIView(_ textView: UITextView, context: Context) {
        context.coordinator.sync()
    }
}

@MainActor
final class CodeTextCoordinator: NSObject, UITextViewDelegate {
    let document: EditorDocument
    private weak var textView: UITextView?
    private var highlighter: TextViewHighlighter?
    private var generation = -1

    init(document: EditorDocument) {
        self.document = document
    }

    func attach(_ textView: UITextView) {
        self.textView = textView
        highlighter = makeHighlighter(for: textView, language: document.language)
        sync()
    }

    /// Takes the document's text after a load.
    func sync() {
        guard let textView, document.generation != generation else { return }
        generation = document.generation
        textView.text = document.text
        textView.undoManager?.removeAllActions()
    }

    func textViewDidChange(_ textView: UITextView) {
        document.edited(textView.text)
    }
}
#endif

/// Neon's highlighter for `textView`, which it keeps up to date as the
/// text changes and scrolls; nil for a language it doesn't know.
@MainActor
private func makeHighlighter(for textView: Neon.TextView, language: TextLanguage?) -> TextViewHighlighter? {
    guard let language, let root = Highlighting.configuration(for: language) else { return nil }
    let configuration = TextViewHighlighter.Configuration(
        languageConfiguration: root,
        attributeProvider: Highlighting.attributes(for:),
        languageProvider: Highlighting.injected,
        locationTransformer: { _ in nil }
    )
    return try? TextViewHighlighter(textView: textView, configuration: configuration)
}
