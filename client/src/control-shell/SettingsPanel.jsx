import OutputSettingsTab from './settings/OutputSettingsTab.jsx';
import ShortcutsSettingsTab from './settings/ShortcutsSettingsTab.jsx';
import BitfocusSettingsTab from './settings/BitfocusSettingsTab.jsx';
import MidiSettingsTab from './settings/MidiSettingsTab.jsx';
import UpdatesSettingsTab from './settings/UpdatesSettingsTab.jsx';
import TestSettingsTab from './settings/TestSettingsTab.jsx';
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
        <button type="button" className={`mode-toggle-button ${settingsTab === 'output' ? 'is-active' : ''}`} onClick={() => onSetSettingsTab('output')}>Output</button>
        <button type="button" className={`mode-toggle-button ${settingsTab === 'shortcuts' ? 'is-active' : ''}`} onClick={() => onSetSettingsTab('shortcuts')}>Shortcuts</button>
        <button type="button" className={`mode-toggle-button ${settingsTab === 'bitfocus' ? 'is-active' : ''}`} onClick={() => onSetSettingsTab('bitfocus')}>Bitfocus</button>
        <button type="button" className={`mode-toggle-button ${settingsTab === 'midi' ? 'is-active' : ''}`} onClick={() => onSetSettingsTab('midi')}>MIDI</button>
        <button type="button" className={`mode-toggle-button ${settingsTab === 'yandex' ? 'is-active' : ''}`} onClick={() => onSetSettingsTab('yandex')}>Yandex</button>
        <button type="button" className={`mode-toggle-button ${settingsTab === 'updates' ? 'is-active' : ''}`} onClick={() => onSetSettingsTab('updates')}>Updates</button>
        <button type="button" className={`mode-toggle-button ${settingsTab === 'test' ? 'is-active' : ''}`} onClick={() => onSetSettingsTab('test')}>Test</button>
        <button type="button" className={`mode-toggle-button ${settingsTab === 'about' ? 'is-active' : ''}`} onClick={() => onSetSettingsTab('about')}>About</button>
      </div>
      {settingsTab === 'about' && (
        <AboutSettingsTab
          appMeta={appMeta}
          currentProjectName={currentProjectName}
          projectDirty={projectDirty}
          projectStatus={projectStatus}
        />
      )}
      {settingsTab === 'output' && (
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
      {settingsTab === 'shortcuts' && (
        <ShortcutsSettingsTab
          learningShortcut={learningShortcut}
          shortcutBindings={shortcutBindings}
          outputs={outputs}
          onStartLearning={onStartLearningShortcut}
          onClearShortcut={onClearShortcut}
          onCancelLearning={onCancelLearningShortcut}
        />
      )}
      {settingsTab === 'bitfocus' && (
        <BitfocusSettingsTab
          bitfocusActions={bitfocusActions}
          onCopyUrl={onCopyBitfocusUrl}
          onCopyPayload={onCopyBitfocusPayload}
        />
      )}
      {settingsTab === 'midi' && (
        <MidiSettingsTab
          midiState={midiState}
          onRefreshMidiState={onRefreshMidiState}
          onStartMidiLearn={onStartMidiLearn}
          onStopMidiLearn={onStopMidiLearn}
          onClearMidiBinding={onClearMidiBinding}
        />
      )}
      {settingsTab === 'yandex' && (
        <YandexSettingsTab
          yandexAuthState={yandexAuthState}
          yandexDeviceAuth={yandexDeviceAuth}
          onSave={onSaveYandexAuthSettings}
          onReload={onReloadYandexAuthSettings}
          onConnect={onConnectYandex}
          onDisconnect={onDisconnectYandex}
        />
      )}
      {settingsTab === 'updates' && (
        <UpdatesSettingsTab
          appMeta={appMeta}
          updateState={updateState}
          formatStatusTime={formatStatusTime}
          onCheckForUpdates={onCheckForUpdates}
          onInstallUpdate={onInstallUpdate}
          onRefreshAppMeta={onRefreshAppMeta}
        />
      )}
      {settingsTab === 'test' && <TestSettingsTab />}
    </section>
  );
}
