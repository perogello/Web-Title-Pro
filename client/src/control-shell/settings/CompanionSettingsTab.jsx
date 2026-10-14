import { useCallback, useEffect, useState } from 'react';
import { api, BACKEND_ORIGIN, copyText } from '../api.js';
import { showAppDialog } from '../app-dialog.jsx';
import HelpToggle from '../HelpToggle.jsx';

// Settings › Integrations: the Bitfocus Companion module shipped with the app.
// Desktop: one-click install into Companion's developer modules folder (and a
// restart of Companion when developer modules have to be switched on). Any
// browser: the module path, the .tgz for "Import module package" (also for a
// Companion on another computer) and a short guide.

const hostOf = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

const parentFolder = (folder) => String(folder || '').replace(/[\\/][^\\/]+[\\/]?$/, '');

export default function CompanionSettingsTab({ outputInfo, pushFeedback, pushError }) {
  const bridge = typeof window !== 'undefined' ? window.webTitleDesktop : null;
  const canInstall = Boolean(bridge?.installCompanionModule);
  const [moduleInfo, setModuleInfo] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setModuleInfo(await api('/api/companion-module'));
    } catch {
      setModuleInfo(null);
    }
    if (bridge?.getCompanionStatus) {
      try {
        setStatus(await bridge.getCompanionStatus());
      } catch {
        setStatus(null);
      }
    }
  }, [bridge]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const moduleFolder = status?.moduleFolder || moduleInfo?.folder || '';
  const devFolder = parentFolder(moduleFolder);
  const version = status?.moduleVersion || moduleInfo?.version || '';
  const lanHost = hostOf(outputInfo?.controlUrl) || 'IP этого компьютера';

  const copy = (value, label) =>
    copyText(value).then(() => pushFeedback?.(`${label} скопирован`)).catch(() => pushError?.('Не удалось скопировать'));

  const install = async () => {
    if (!canInstall) return;
    setBusy(true);
    setResult(null);
    try {
      let response = await bridge.installCompanionModule({});
      if (response?.reason === 'companion-running') {
        const choice = await showAppDialog({
          type: 'warning',
          title: 'Bitfocus Companion',
          message: 'Чтобы включить developer-модули, Companion нужно перезапустить.',
          detail:
            'Web Title Pro закроет Companion, включит developer-модули, положит модуль и запустит Companion снова. ' +
            'На несколько секунд кнопки Companion перестанут работать — не делайте этого во время эфира.',
          buttons: ['Перезапустить Companion и установить', 'Отмена'],
          defaultId: 0,
          cancelId: 1,
        });
        if (choice !== 0) return;
        response = await bridge.installCompanionModule({ restartCompanion: true });
      }

      if (!response?.ok) {
        setResult({ ok: false, text: response?.error || 'Не удалось установить модуль' });
        pushError?.(response?.error || 'Не удалось установить модуль Companion');
        return;
      }

      const notes = [`Модуль ${response.version} установлен: ${response.target}`];
      if (response.restarted) notes.push('Companion перезапущен с включёнными developer-модулями.');
      else if (response.liveReload) notes.push('Companion подхватил модуль сам, перезапуск не нужен.');
      else if (response.configChanged) notes.push('Developer-модули включены — запустите Companion.');
      setResult({ ok: true, text: notes.join(' '), offerLaunch: !response.companionRunning });
      pushFeedback?.(`Модуль Companion ${response.version} установлен`);
    } catch (error) {
      setResult({ ok: false, text: error.message });
      pushError?.(error.message);
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const launch = async () => {
    const response = await bridge?.launchCompanion?.();
    if (response?.ok) {
      pushFeedback?.('Companion запускается…');
      setResult((current) => (current ? { ...current, offerLaunch: false } : current));
    } else {
      pushError?.(response?.error || 'Не удалось запустить Companion');
    }
  };

  const statusChip = (() => {
    if (!canInstall) return { on: false, text: 'Web' };
    if (!status) return { on: false, text: '…' };
    if (status.installedActive && status.upToDate) return { on: true, text: 'Installed' };
    if (status.installedPath && !status.upToDate) return { on: false, text: 'Outdated' };
    return { on: false, text: status.companionFound ? 'Not installed' : 'No Companion' };
  })();

  return (
    <section className="vmix-settings-card companion-settings-card">
      <div className="vmix-settings-head">
        <div>
          <span className="kicker-v3">Integration</span>
          <h3>
            Bitfocus Companion module {version && <small className="companion-version-v3">v{version}</small>}
            <HelpToggle align="left">
              <span>
                Готовый модуль для Companion: кнопки с живой подсветкой эфира, переменные и пресеты для каждого output,
                титра и таймера. Работает с Companion 3.5 и новее.
              </span>
              <span>
                Модуль входит в состав приложения и обновляется вместе с ним: после обновления Web Title Pro установленная
                здесь копия обновится сама при следующем запуске. Пакет <code>.tgz</code>, импортированный в Companion на
                другом ПК, нужно импортировать заново — Companion подсветит подключение предупреждением о несовпадении
                версий.
              </span>
              <span>
                Автоустановка работает только в десктопном приложении: из браузера нельзя положить файлы в Companion и
                перезапустить его.
              </span>
            </HelpToggle>
          </h3>
        </div>
        <div className="vmix-settings-status">
          <span className={`vmix-status-dot ${statusChip.on ? 'is-on' : 'is-off'}`} />
          <span className={`vmix-status-label ${statusChip.on ? 'is-on' : 'is-off'}`}>{statusChip.text}</span>
        </div>
      </div>

      {moduleInfo && !moduleInfo.available && <div className="vmix-readout-error">{moduleInfo.error}</div>}

      <div className="companion-install-v3">
        <div className="vmix-settings-actions">
          <button
            type="button"
            className="btn-v3-primary btn-v3-sm"
            onClick={install}
            disabled={!canInstall || busy || !status?.moduleAvailable}
            title={canInstall ? undefined : 'Доступно только в десктопном приложении Web Title Pro'}
          >
            {busy
              ? 'Устанавливаю…'
              : status?.installedPath && !status.upToDate
                ? 'Обновить модуль в Companion'
                : status?.installedPath
                  ? 'Переустановить в Companion'
                  : 'Установить в Companion'}
          </button>
          {result?.offerLaunch && (
            <button type="button" className="btn-v3-ghost btn-v3-sm" onClick={launch}>
              Запустить Companion
            </button>
          )}
        </div>
        {canInstall && status && (
          <div className="vmix-settings-readout">
            <div className="vmix-readout-row">
              <span className="vmix-readout-label">Companion</span>
              <strong className="vmix-readout-value">
                {status.companionFound ? (status.companionRunning ? 'найден, запущен' : 'найден, не запущен') : 'не найден на этом ПК'}
              </strong>
            </div>
            <div className="vmix-readout-row">
              <span className="vmix-readout-label">Developer-модули</span>
              <strong className="vmix-readout-value">
                {status.developerEnabled ? 'включены' : 'выключены'}
              </strong>
            </div>
            <div className="vmix-readout-row">
              <span className="vmix-readout-label">Версия модуля</span>
              <strong className="vmix-readout-value">
                {status.installedPath
                  ? status.upToDate
                    ? `v${status.installedVersion} — актуальная`
                    : `в Companion v${status.installedVersion || '?'}, в приложении v${status.moduleVersion} — нужно обновить`
                  : `v${status.moduleVersion || '?'} — ещё не установлен`}
              </strong>
            </div>
            {status.installedPath && (
              <div className="vmix-readout-row">
                <span className="vmix-readout-label">Установлен в</span>
                <code className="vmix-readout-host" title={status.installedPath}>{status.installedPath}</code>
              </div>
            )}
          </div>
        )}
        {result && <div className={result.ok ? 'companion-result-v3' : 'vmix-readout-error'}>{result.text}</div>}
      </div>

      <div className="companion-paths-v3">
        <div className="vmix-readout-row">
          <span className="vmix-readout-label">Папка модуля</span>
          <code className="vmix-readout-host" title={moduleFolder}>{moduleFolder || '—'}</code>
          <div className="companion-path-actions-v3">
            <button type="button" className="btn-v3-ghost btn-v3-sm" onClick={() => copy(moduleFolder, 'Путь')} disabled={!moduleFolder}>
              Copy
            </button>
            {bridge?.openCompanionFolder && (
              <button type="button" className="btn-v3-ghost btn-v3-sm" onClick={() => bridge.openCompanionFolder({ path: moduleFolder })}>
                Open
              </button>
            )}
          </div>
        </div>
        <div className="vmix-readout-row">
          <span className="vmix-readout-label">Developer path</span>
          <code className="vmix-readout-host" title={devFolder}>{devFolder || '—'}</code>
          <div className="companion-path-actions-v3">
            <button type="button" className="btn-v3-ghost btn-v3-sm" onClick={() => copy(devFolder, 'Путь')} disabled={!devFolder}>
              Copy
            </button>
          </div>
        </div>
        <div className="vmix-readout-row">
          <span className="vmix-readout-label">Пакет .tgz</span>
          <code className="vmix-readout-host">{moduleInfo?.packageName || '—'}</code>
          <div className="companion-path-actions-v3">
            <a
              className={`btn-v3-ghost btn-v3-sm ${moduleInfo?.hasPackage ? '' : 'is-disabled'}`}
              href={`${BACKEND_ORIGIN}/api/companion-module/package`}
              download={moduleInfo?.packageName || 'web-title-pro.tgz'}
            >
              Скачать
            </a>
          </div>
        </div>
      </div>

      <details className="companion-guide-v3" open={!canInstall}>
        <summary>Как добавить модуль в Companion</summary>
        <ol>
          {canInstall && (
            <li>
              <strong>Автоматически (Companion на этом ПК):</strong> кнопка «Установить в Companion» выше.
            </li>
          )}
          <li>
            <strong>Вручную, developer-режим:</strong> в окне Companion (launcher) нажмите шестерёнку справа вверху →
            раздел <em>Developer</em> → <em>Select</em> и выберите папку из строки <em>Developer path</em> (ту, в которой
            лежит папка <code>web-title-pro</code>) → включите <em>Enable Developer Modules</em> → <em>Launch GUI</em>.
          </li>
          <li>
            <strong>Без developer-режима или Companion на другом ПК:</strong> скачайте пакет <code>.tgz</code> → в веб-интерфейсе
            Companion откройте <em>Modules</em> → <em>Import module package</em> → выберите файл.
          </li>
          <li>
            <strong>Подключение:</strong> <em>Connections</em> → <em>Add connection</em> → найдите <em>Web Title Pro</em> →
            Host <code>127.0.0.1</code> (Companion на этом ПК) или <code>{lanHost}</code> (на другом), Port <code>4000</code>.
          </li>
          <li>
            <strong>Кнопки:</strong> вкладка <em>Presets</em> подключения — перетащите готовые кнопки на страницу.
          </li>
        </ol>
      </details>
    </section>
  );
}
