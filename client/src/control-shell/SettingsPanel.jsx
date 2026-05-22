import OutputSettingsTab from './settings/OutputSettingsTab.jsx';
import ShortcutsSettingsTab from './settings/ShortcutsSettingsTab.jsx';
import BitfocusSettingsTab from './settings/BitfocusSettingsTab.jsx';
import MidiSettingsTab from './settings/MidiSettingsTab.jsx';
import UpdatesSettingsTab from './settings/UpdatesSettingsTab.jsx';
import YandexSettingsTab from './settings/YandexSettingsTab.jsx';
import AboutSettingsTab from './settings/AboutSettingsTab.jsx';

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
}) {
  return (
    <section className="output-card">
      <div className="card-head">
        <div>
          <h3>Output Settings & Integrations</h3>
        </div>
      </div>
      <div className="mode-toggle settings-tab-toggle" role="tablist" aria-label="Settings sections">
        <button type="button" className={`mode-toggle-button ${settingsTab === 'outputs' || settingsTab === 'output' ? 'is-active' : ''}`} onClick={() => onSetSettingsTab('outputs')}>Outputs</button>
        <button type="button" className={`mode-toggle-button ${settingsTab === 'controls' ? 'is-active' : ''}`} onClick={() => onSetSettingsTab('controls')}>Controls</button>
        <button type="button" className={`mode-toggle-button ${settingsTab === 'integrations' ? 'is-active' : ''}`} onClick={() => onSetSettingsTab('integrations')}>Integrations</button>
        <button type="button" className={`mode-toggle-button ${settingsTab === 'system' ? 'is-active' : ''}`} onClick={() => onSetSettingsTab('system')}>System</button>
      </div>
      {(settingsTab === 'outputs' || settingsTab === 'output') && (
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
      {settingsTab === 'controls' && (
        <div className="integration-grid">
          <div className="meta-card">
            <span className="meta-label">Controls</span>
            <strong>Keyboard, MIDI and Companion (HTTP) bindings</strong>
            <span className="output-note">All three input methods share the same action set. Bind the same action on multiple devices.</span>
          </div>
          <ShortcutsSettingsTab
            learningShortcut={learningShortcut}
            shortcutBindings={shortcutBindings}
            outputs={outputs}
            entries={shortcutEntries}
            timers={shortcutTimers}
            onStartLearning={onStartLearningShortcut}
            onClearShortcut={onClearShortcut}
            onCancelLearning={onCancelLearningShortcut}
            onToggleGlobal={onToggleGlobalShortcut}
          />
          <MidiSettingsTab
            midiState={midiState}
            outputs={outputs}
            entries={shortcutEntries}
            timers={shortcutTimers}
            onRefreshMidiState={onRefreshMidiState}
            onStartMidiLearn={onStartMidiLearn}
            onStopMidiLearn={onStopMidiLearn}
            onClearMidiBinding={onClearMidiBinding}
          />
          <BitfocusSettingsTab
            bitfocusActions={bitfocusActions}
            onCopyUrl={onCopyBitfocusUrl}
            onCopyPayload={onCopyBitfocusPayload}
          />
        </div>
      )}
      {settingsTab === 'integrations' && (
        <YandexSettingsTab
          yandexAuthState={yandexAuthState}
          yandexDeviceAuth={yandexDeviceAuth}
          onSave={onSaveYandexAuthSettings}
          onReload={onReloadYandexAuthSettings}
          onConnect={onConnectYandex}
          onDisconnect={onDisconnectYandex}
        />
      )}
      {settingsTab === 'system' && (
        <div className="integration-grid">
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
          />
        </div>
      )}
    </section>
  );
}
