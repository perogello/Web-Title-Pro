import OutputSettingsTab from './settings/OutputSettingsTab.jsx';
import ShortcutsSettingsTab from './settings/ShortcutsSettingsTab.jsx';
import UpdatesSettingsTab from './settings/UpdatesSettingsTab.jsx';
import YandexSettingsTab from './settings/YandexSettingsTab.jsx';
import VmixSettingsTab from './settings/VmixSettingsTab.jsx';
import AboutSettingsTab from './settings/AboutSettingsTab.jsx';

const NAV = [
  { id: 'outputs', label: 'Outputs', hint: 'Render & preview URLs' },
  { id: 'controls', label: 'Controls', hint: 'Keyboard, MIDI, Companion' },
  { id: 'integrations', label: 'Integrations', hint: 'Yandex, Google Sheets' },
  { id: 'system', label: 'System', hint: 'Updates & app info' },
];

export default function SettingsPanel({
  settingsTab,
  currentProjectName,
  projectDirty,
  projectStatus,
  outputInfo,
  outputRenderTargets,
  selectedOutput,
  outputs,
  learningShortcut,
  shortcutBindings,
  shortcutEntries,
  shortcutTimers,
  bitfocusActions,
  midiState,
  appMeta,
  updateState,
  yandexAuthState,
  yandexDeviceAuth,
  vmixState,
  vmixHostDraft,
  formatStatusTime,
  onSetSettingsTab,
  onSelectOutput,
  onDeleteOutput,
  onUpdateOutput,
  onCopyRenderUrl,
  onCopyPreviewUrl,
  onCopyBaseUrl,
  onStartLearningShortcut,
  onClearShortcut,
  onCancelLearningShortcut,
  onToggleGlobalShortcut,
  onCopyBitfocusUrl,
  onCopyBitfocusPayload,
  onRefreshMidiState,
  onStartMidiLearn,
  onStopMidiLearn,
  onClearMidiBinding,
  onCheckForUpdates,
  onInstallUpdate,
  onRefreshAppMeta,
  onSaveYandexAuthSettings,
  onReloadYandexAuthSettings,
  onConnectYandex,
  onDisconnectYandex,
  onSetVmixHostDraft,
  onConnectVmix,
  onRefreshVmixState,
}) {
  const activeId = settingsTab === 'output' ? 'outputs' : (settingsTab || 'outputs');
  const activeNav = NAV.find((item) => item.id === activeId) || NAV[0];

  return (
    <section className="settings-shell-v2">
      <nav className="settings-nav-v2" aria-label="Settings sections">
        <div className="settings-nav-head">Settings</div>
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`settings-nav-item ${activeId === item.id ? 'is-active' : ''}`}
            onClick={() => onSetSettingsTab(item.id)}
          >
            <span className="settings-nav-label">{item.label}</span>
            <span className="settings-nav-hint">{item.hint}</span>
          </button>
        ))}
      </nav>

      <div className="settings-body-v2">
        <header className="settings-body-head">
          <div>
            <span className="kicker-v3">Settings / {activeNav.label}</span>
            <h2>{activeNav.label}</h2>
          </div>
        </header>

        <div className="settings-body-content">
          {activeId === 'outputs' && (
            <OutputSettingsTab
              outputInfo={outputInfo}
              outputRenderTargets={outputRenderTargets}
              selectedOutput={selectedOutput}
              outputs={outputs}
              onSelectOutput={onSelectOutput}
              onDeleteOutput={onDeleteOutput}
              onUpdateOutput={onUpdateOutput}
              onCopyRenderUrl={onCopyRenderUrl}
              onCopyPreviewUrl={onCopyPreviewUrl}
              onCopyBaseUrl={onCopyBaseUrl}
            />
          )}
          {activeId === 'controls' && (
            <ShortcutsSettingsTab
              learningShortcut={learningShortcut}
              shortcutBindings={shortcutBindings}
              outputs={outputs}
              entries={shortcutEntries}
              timers={shortcutTimers}
              midiState={midiState}
              bitfocusActions={bitfocusActions}
              onStartLearning={onStartLearningShortcut}
              onClearShortcut={onClearShortcut}
              onCancelLearning={onCancelLearningShortcut}
              onToggleGlobal={onToggleGlobalShortcut}
              onStartMidiLearn={onStartMidiLearn}
              onStopMidiLearn={onStopMidiLearn}
              onClearMidiBinding={onClearMidiBinding}
              onCopyBitfocusUrl={onCopyBitfocusUrl}
            />
          )}
          {activeId === 'integrations' && (
            <div className="settings-stack">
              <VmixSettingsTab
                vmixState={vmixState}
                vmixHostDraft={vmixHostDraft}
                onSetVmixHostDraft={onSetVmixHostDraft}
                onConnectVmix={onConnectVmix}
                onRefreshVmixState={onRefreshVmixState}
              />
              <YandexSettingsTab
                yandexAuthState={yandexAuthState}
                yandexDeviceAuth={yandexDeviceAuth}
                onSave={onSaveYandexAuthSettings}
                onReload={onReloadYandexAuthSettings}
                onConnect={onConnectYandex}
                onDisconnect={onDisconnectYandex}
              />
            </div>
          )}
          {activeId === 'system' && (
            <div className="settings-stack">
              <UpdatesSettingsTab
                appMeta={appMeta}
                updateState={updateState}
                formatStatusTime={formatStatusTime}
                onCheckForUpdates={onCheckForUpdates}
                onInstallUpdate={onInstallUpdate}
                onRefreshAppMeta={onRefreshAppMeta}
              />
              <AboutSettingsTab
                appMeta={appMeta}
                currentProjectName={currentProjectName}
                projectDirty={projectDirty}
                projectStatus={projectStatus}
                outputInfo={outputInfo}
                onCopyBaseUrl={onCopyBaseUrl}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
