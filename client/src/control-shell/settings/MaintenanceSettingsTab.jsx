export default function MaintenanceSettingsTab({ isDesktop, onResetApp, onUninstallApp }) {
  return (
    <div className="integration-grid">
      <div className="info-card-v3">
        <span className="info-label-v3">Обслуживание</span>
        <strong>Сброс и удаление приложения</strong>
        <span className="note-v3">
          Сброс удаляет настройки, сессию, токены и рабочее состояние, затем перезапускает
          приложение начисто — помогает после неудачного обновления. Полное удаление дополнительно
          стирает сам WebTitlePro.exe. Сохранённые файлы проектов (.json) не затрагиваются —
          перед сбросом сохраните текущий проект.
        </span>
        {isDesktop ? (
          <div className="maintenance-actions-v3">
            <button type="button" className="btn-v3-ghost" onClick={onResetApp}>
              Сбросить приложение…
            </button>
            <button type="button" className="btn-v3-ghost is-danger" onClick={onUninstallApp}>
              Полностью удалить…
            </button>
          </div>
        ) : (
          <span className="note-v3">Доступно только в десктопном приложении.</span>
        )}
      </div>
    </div>
  );
}
