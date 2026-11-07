import {
  type CodeFontSetting,
  DEFAULT_SIZE,
  FONTS,
  MAX_SIZE,
  MIN_SIZE,
  SYSTEM_FONT,
  catalogFont,
  familyList,
  featureSettings,
  fontFaces,
} from '../lib/code-font';

/** What the preview shows: ligatures, look-alike letters and digits. */
export const SAMPLE = 'fn(x) => x != 0 && x <= 10 // 0O 1lI |> www ->';

type Props = {
  value: CodeFontSetting;
  onChange(next: CodeFontSetting): void;
};

/**
 * The browser's code font settings (#354): face, size, ligatures and the
 * face's stylistic alternates, with a preview. The Apple apps show their
 * own, in their Settings.
 */
export function CodeFontSection({ value, onChange }: Props) {
  const font = catalogFont(value.font);
  const update = (patch: Partial<CodeFontSetting>) => onChange({ ...value, ...patch });
  const toggle = (tag: string, on: boolean) =>
    update({
      features: on ? [...value.features, tag] : value.features.filter(t => t !== tag),
    });

  return (
    <section>
      <h3>Code font</h3>
      {/* The preview's face, so it shows before the setting is saved. */}
      <style>{fontFaces(value, import.meta.env.BASE_URL)}</style>
      <div className="form-rows">
        <label>
          <span>Font</span>
          <select value={value.font} onChange={e => update({ font: e.target.value, features: [] })}>
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
        {font && font.features.length > 0 && (
          <details className="code-font-features">
            <summary>
              Alternates{value.features.length > 0 ? ` (${value.features.length} on)` : ''}
            </summary>
            {font.features.map(f => (
              <label key={f.tag} className="check-row">
                <input
                  type="checkbox"
                  checked={value.features.includes(f.tag)}
                  onChange={e => toggle(f.tag, e.target.checked)}
                />
                <span>
                  <code>{f.tag}</code> {f.label}
                </span>
              </label>
            ))}
          </details>
        )}
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
  );
}
