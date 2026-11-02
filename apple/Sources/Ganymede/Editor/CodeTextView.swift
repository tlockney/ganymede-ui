import Neon
import SwiftUI

/// The system text view (`NSTextView`, `UITextView`) for code: plain text
/// in a monospaced font, no smart quotes or autocorrection, the system's
/// find, undo, input methods, dictation and accessibility, and Neon's
/// highlighting when the language is known (#122). It adds line numbers,
/// auto-indent and bracket pairing (`CodeEditing`).
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
        let ruler = LineNumberRuler(textView: textView, scrollView: scrollView)
        scrollView.verticalRulerView = ruler
        scrollView.hasVerticalRuler = true
        scrollView.rulersVisible = true

        textView.delegate = context.coordinator
        context.coordinator.attach(textView, ruler: ruler)
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
    private weak var ruler: LineNumberRuler?
    private var highlighter: TextViewHighlighter?
    private var generation = -1
    /// An edit of ours is being applied, so the delegate lets it through.
    private var applying = false

    init(document: EditorDocument) {
        self.document = document
    }

    func attach(_ textView: NSTextView, ruler: LineNumberRuler) {
        self.textView = textView
        self.ruler = ruler
        highlighter = makeHighlighter(for: textView, language: document.language)
        sync()
    }

    /// Takes the document's text after a load.
    func sync() {
        guard let textView, document.generation != generation else { return }
        generation = document.generation
        textView.string = document.text
        textView.undoManager?.removeAllActions()
        ruler?.lineCount = CodeEditing.lineCount(textView.string as NSString)
    }

    func textDidChange(_ notification: Notification) {
        guard let textView else { return }
        document.edited(textView.string)
        ruler?.lineCount = CodeEditing.lineCount(textView.string as NSString)
    }

    /// Typing: Return indents, brackets and quotes pair.
    func textView(_ textView: NSTextView, shouldChangeTextIn range: NSRange, replacementString text: String?) -> Bool {
        guard !applying, let text, !textView.hasMarkedText(), textView.selectedRanges.count == 1,
              textView.undoManager?.isUndoing != true, textView.undoManager?.isRedoing != true,
              let edit = CodeEditing.typing(
                text, in: textView.string as NSString, selection: range, language: document.language)
        else { return true }
        apply(edit, to: textView)
        return false
    }

    /// Backspace between a pair deletes both.
    func textView(_ textView: NSTextView, doCommandBy selector: Selector) -> Bool {
        guard selector == #selector(NSResponder.deleteBackward(_:)), !textView.hasMarkedText(),
              textView.selectedRanges.count == 1,
              let edit = CodeEditing.deleteBackward(in: textView.string as NSString, selection: textView.selectedRange())
        else { return false }
        apply(edit, to: textView)
        return true
    }

    /// Makes the edit as one undoable change, as typing would.
    private func apply(_ edit: CodeEdit, to textView: NSTextView) {
        if edit.range.length > 0 || !edit.text.isEmpty {
            applying = true
            defer { applying = false }
            guard textView.shouldChangeText(in: edit.range, replacementString: edit.text) else { return }
            textView.textStorage?.replaceCharacters(
                in: edit.range, with: NSAttributedString(string: edit.text, attributes: textView.typingAttributes))
            textView.didChangeText()
        }
        textView.setSelectedRange(edit.selection)
        textView.scrollRangeToVisible(edit.selection)
    }
}
#else
struct CodeTextView: UIViewRepresentable {
    let document: EditorDocument

    func makeCoordinator() -> CodeTextCoordinator { CodeTextCoordinator(document: document) }

    func makeUIView(context: Context) -> CodeUITextView {
        // TextKit 1, which Neon highlights most reliably.
        let textView = CodeUITextView(usingTextLayoutManager: false)
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

    func updateUIView(_ textView: CodeUITextView, context: Context) {
        context.coordinator.sync()
    }
}

@MainActor
final class CodeTextCoordinator: NSObject, UITextViewDelegate {
    let document: EditorDocument
    private weak var textView: CodeUITextView?
    private var highlighter: TextViewHighlighter?
    private var generation = -1
    /// An edit of ours is being applied, so the delegate lets it through.
    private var applying = false

    init(document: EditorDocument) {
        self.document = document
    }

    func attach(_ textView: CodeUITextView) {
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
        textView.lineCount = CodeEditing.lineCount(document.text as NSString)
    }

    func textViewDidChange(_ textView: UITextView) {
        document.edited(textView.text)
        self.textView?.lineCount = CodeEditing.lineCount((textView.text ?? "") as NSString)
    }

    /// Typing: Return indents, brackets and quotes pair, and backspace
    /// between a pair deletes both.
    func textView(_ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
        guard !applying, textView.markedTextRange == nil,
              textView.undoManager?.isUndoing != true, textView.undoManager?.isRedoing != true
        else { return true }
        let string = (textView.text ?? "") as NSString
        let selection = textView.selectedRange
        let edit: CodeEdit?
        if text.isEmpty, range.length == 1, selection.length == 0, NSMaxRange(range) == selection.location {
            edit = CodeEditing.deleteBackward(in: string, selection: selection)
        } else {
            edit = CodeEditing.typing(text, in: string, selection: range, language: document.language)
        }
        guard let edit else { return true }
        apply(edit, to: textView)
        return false
    }

    /// Makes the edit through `UITextInput`, so it can be undone.
    private func apply(_ edit: CodeEdit, to textView: UITextView) {
        if edit.range.length > 0 || !edit.text.isEmpty,
           let start = textView.position(from: textView.beginningOfDocument, offset: edit.range.location),
           let end = textView.position(from: start, offset: edit.range.length),
           let range = textView.textRange(from: start, to: end)
        {
            applying = true
            textView.replace(range, withText: edit.text)
            applying = false
        }
        textView.selectedRange = edit.selection
        textView.scrollRangeToVisible(edit.selection)
        textViewDidChange(textView)
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
