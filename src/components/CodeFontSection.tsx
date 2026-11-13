import {
  type CodeFontSetting,
  DEFAULT_SIZE,
  FONTS,
  MARKDOWN_FONTS,
  MAX_SIZE,
  MIN_SIZE,
  type MarkdownFont,
  STANDARD_STYLE,
  SYSTEM_FONT,
  catalogFont,
  familyList,
  featureSettings,
  fontFaces,
  markdownFamily,
} from '../lib/code-font';

/** What the preview shows: ligatures, look-alike letters and digits, and what the styles change. */
export const SAMPLE = 'fn(x) => x != 0 && @param <= 10 // 0O 1lI |> ->';

/** The Markdown font's preview. */
export const MARKDOWN_SAMPLE = 'Notebooks read like documents.';

type Props = {
  value: CodeFontSetting;
  onChange(next: CodeFontSetting): void;
};

/**
 * The browser's font settings: the code font's face, size, ligatures and
 * style (#354, #565), with a preview, and the Markdown font (#565). The
 * Apple apps show their own, in their Settings.
 */
export function CodeFontSection({ value, onChange }: Props) {
  const font = catalogFont(value.font);
  const update = (patch: Partial<CodeFontSetting>) => onChange({ ...value, ...patch });

  return (
    <>
      <section>
        <h3>Code font</h3>
        {/* The preview's face, so it shows before the setting is saved. */}
        <style>{fontFaces(value, import.meta.env.BASE_URL)}</style>
        <div className="form-rows">
          <label>
            <span>Font</span>
            <select
              value={value.font}
              onChange={e => update({ font: e.target.value, style: STANDARD_STYLE })}
            >
              <option value={SYSTEM_FONT}>System monospace</option>
              {FONTS.map(f => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Size</span>
            <input
              type="number"
              min={MIN_SIZE}
              max={MAX_SIZE}
              step={0.5}
              placeholder={String(DEFAULT_SIZE)}
              value={value.size ?? ''}
              onChange={e => {
                const n = e.target.valueAsNumber;
                update({ size: Number.isFinite(n) ? n : null });
              }}
            />
          </label>
          {font && font.styles.length > 0 && (
            <label>
              <span>Style</span>
              <select value={value.style} onChange={e => update({ style: e.target.value })}>
                <option value={STANDARD_STYLE}>Standard</option>
                {font.styles.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {font?.ligatures && (
            <label className="check-row">
              <input
                type="checkbox"
                checked={value.ligatures}
                onChange={e => update({ ligatures: e.target.checked })}
              />
              <span>Ligatures</span>
            </label>
          )}
          <p
            className="code-font-preview"
            data-testid="code-font-preview"
            style={{
              fontFamily: familyList(value) ?? 'var(--font-mono)',
              fontSize: `${value.size ?? DEFAULT_SIZE}px`,
              fontFeatureSettings: featureSettings(value),
            }}
          >
            {SAMPLE}
          </p>
          {font && (
            <p className="hint">
              {font.source}, under the SIL Open Font License.{' '}
              <a
                href={`${import.meta.env.BASE_URL}fonts/licenses/${font.id}.txt`}
                target="_blank"
                rel="noreferrer"
              >
                License
              </a>
            </p>
          )}
        </div>
      </section>
      <section>
        <h3>Markdown font</h3>
        <div className="form-rows">
          <label>
            <span>Font</span>
            <select
              aria-label="Markdown font"
              value={value.markdown}
              onChange={e => update({ markdown: e.target.value as MarkdownFont })}
            >
              {MARKDOWN_FONTS.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <p
            className="markdown-font-preview"
            data-testid="markdown-font-preview"
            style={{
              fontFamily: markdownFamily(value),
              fontFeatureSettings: value.markdown === 'mono' ? featureSettings(value) : 'normal',
            }}
          >
            {MARKDOWN_SAMPLE}
          </p>
        </div>
      </section>
    </>
  );
}
