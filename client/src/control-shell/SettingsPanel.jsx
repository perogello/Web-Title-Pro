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
  entries,
  getRundownPrimaryLabel,
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
      <div className="settings-tab-strip">
        <button className={`tab-button ${settingsTab === 'output' ? 'is-active' : ''}`} onClick={() => onSetSettingsTab('output')}>Output</button>
        <button className={`tab-button ${settingsTab === 'shortcuts' ? 'is-active' : ''}`} onClick={() => onSetSettingsTab('shortcuts')}>Shortcuts</button>
        <button className={`tab-button ${settingsTab === 'bitfocus' ? 'is-active' : ''}`} onClick={() => onSetSettingsTab('bitfocus')}>Bitfocus</button>
        <button className={`tab-button ${settingsTab === 'midi' ? 'is-active' : ''}`} onClick={() => onSetSettingsTab('midi')}>MIDI</button>
        <button className={`tab-button ${settingsTab === 'yandex' ? 'is-active' : ''}`} onClick={() => onSetSettingsTab('yandex')}>Yandex</button>
        <button className={`tab-button ${settingsTab === 'updates' ? 'is-active' : ''}`} onClick={() => onSetSettingsTab('updates')}>Updates</button>
        <button className={`tab-button ${settingsTab === 'test' ? 'is-active' : ''}`} onClick={() => onSetSettingsTab('test')}>Test</button>
        <button className={`tab-button ${settingsTab === 'about' ? 'is-active' : ''}`} onClick={() => onSetSettingsTab('about')}>About</button>
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
          entries={entries}
          getRundownPrimaryLabel={getRundownPrimaryLabel}
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
