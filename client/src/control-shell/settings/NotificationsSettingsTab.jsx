const OPTIONS = [
  { value: 'all', label: 'Все', hint: 'Результаты действий и ошибки' },
  { value: 'errors', label: 'Только ошибки', hint: 'Сбои и «нельзя, потому что…»' },
  { value: 'none', label: 'Никакие', hint: 'Без всплывающих сообщений' },
];

export default function NotificationsSettingsTab({ feedbackMode, onSetFeedbackMode }) {
  const active = OPTIONS.find((option) => option.value === feedbackMode) || OPTIONS[0];

  return (
    <div className="integration-grid">
      <div className="info-card-v3">
        <span className="info-label-v3">Уведомления</span>
        <strong>Всплывающие сообщения внизу экрана</strong>
        <div className="seg-control-v3 notifications-mode-v3" role="radiogroup" aria-label="Notifications">
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={feedbackMode === option.value}
              className={`seg-button-v3 ${feedbackMode === option.value ? 'is-active' : ''}`}
              onClick={() => onSetFeedbackMode?.(option.value)}
              title={option.hint}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="note-v3">
          {active.hint}. Настройка хранится на этом компьютере и не зависит от проекта.
        </span>
      </div>
    </div>
  );
}
