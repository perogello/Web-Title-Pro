// Post-update "what's new" dialog. Shown once after the app updates to a newer
// version (the desktop shell decides "just updated" by comparing the running
// version against the last-seen one). Content comes from desktop/changelog.json.
export default function ChangelogModal({ version, previousVersion, changelog, onClose }) {
  const bullets = Array.isArray(changelog?.ru) && changelog.ru.length
    ? changelog.ru
    : Array.isArray(changelog?.en)
      ? changelog.en
      : [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card--narrow changelog-modal" onClick={(event) => event.stopPropagation()}>
        <div className="panel-head-v3">
          <div>
            <span className="kicker-v3">Обновление установлено</span>
            <h3>{changelog?.title || `Web Title Pro ${version}`}</h3>
          </div>
          <div className="topbar-actions">
            <button className="btn-v3-primary btn-v3-sm" onClick={onClose}>Понятно</button>
          </div>
        </div>

        <div className="changelog-body">
          <p className="note-v3">
            {previousVersion
              ? `Версия ${previousVersion} → ${version}. Что нового:`
              : `Версия ${version}. Что нового:`}
          </p>
          {bullets.length ? (
            <ul className="changelog-list">
              {bullets.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="note-v3">Список изменений для этой версии не найден.</p>
          )}
        </div>
      </div>
    </div>
  );
}
