const FALLBACK_FONTS = [
  'Arial',
  'Arial Black',
  'Bahnschrift',
  'Calibri',
  'Cambria',
  'Candara',
  'Comic Sans MS',
  'Consolas',
  'Constantia',
  'Corbel',
  'Georgia',
  'Impact',
  'Lucida Sans Unicode',
  'Microsoft Sans Serif',
  'Palatino Linotype',
  'Segoe UI',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
];

const normalizeColor = (value = '') => {
  const trimmed = String(value || '').trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed) ? trimmed : '#ffffff';
};

export default function KhuralStyleEditorModal({
  entry,
  templateFields,
  draftStyles,
  systemFonts,
  systemFontsLoading,
  onChange,
  onClose,
  onSave,
}) {
  if (!entry) {
    return null;
  }

  const availableFonts = Array.isArray(systemFonts) && systemFonts.length ? systemFonts : FALLBACK_FONTS;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal-card modal-card--narrow" onClick={(event) => event.stopPropagation()}>
        <div className="card-head">
          <div>
            <span className="panel-kicker">Manage</span>
            <h3>Khural Text Styles</h3>
          </div>
          <div className="topbar-actions">
            <button className="ghost-button compact-button" onClick={onClose}>Cancel</button>
            <button className="primary-button compact-button" onClick={onSave}>Save</button>
          </div>
        </div>
        <div className="khural-style-editor">
          <div className="meta-card">
            <span className="meta-label">Title</span>
            <strong>{entry.name}</strong>
            <span className="output-note">Change font family, font size and color for each text block.</span>
            <span className="output-note">
              {systemFontsLoading
                ? 'Loading installed system fonts...'
                : `Available fonts: ${availableFonts.length}`}
            </span>
          </div>
          {templateFields.map((field) => {
            const style = draftStyles?.[field.name] || {};
            const fontChoices = style.fontFamily && !availableFonts.includes(style.fontFamily)
              ? [style.fontFamily, ...availableFonts]
              : availableFonts;
            return (
              <div key={field.name} className="output-settings-card khural-style-card">
                <div className="integration-head">
                  <span className="meta-label">{field.name}</span>
                  <strong>{field.label || field.name}</strong>
                </div>
                <div className="output-settings-fields khural-style-grid">
                  <label className="input-block compact">
                    <span>Font Family</span>
                    <select
                      value={style.fontFamily || ''}
                      onChange={(event) => onChange(field.name, 'fontFamily', event.target.value)}
                    >
                      <option value="">Default</option>
                      {fontChoices.map((fontName) => (
                        <option key={fontName} value={fontName}>
                          {fontName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="input-block compact">
                    <span>Font Size</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={style.fontSize || ''}
                      onChange={(event) => onChange(field.name, 'fontSize', event.target.value)}
                      placeholder="32"
                    />
                  </label>
                  <label className="input-block compact">
                    <span>Color</span>
                    <div className="khural-color-row">
                      <input
                        className="khural-color-picker"
                        type="color"
                        value={normalizeColor(style.color)}
                        onChange={(event) => onChange(field.name, 'color', event.target.value)}
                      />
                      <input
                        value={style.color || ''}
                        onChange={(event) => onChange(field.name, 'color', event.target.value)}
                        placeholder="#f7efc1"
                      />
                    </div>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
