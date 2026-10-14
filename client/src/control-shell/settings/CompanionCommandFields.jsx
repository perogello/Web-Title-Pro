import { useState } from 'react';
import { BACKEND_ORIGIN, copyText } from '../api.js';
import { parseActionId } from '../shortcut-model.js';
import { ACTION_NAMES, OUTPUT_COMMANDS, TIMER_COMMANDS } from '../../../../companion-module/src/model.js';

// What exactly to put into Companion for one command, field by field, with a
// copy button per value. Two ways: our Web Title Pro module (the action + its
// dropdown values) and Companion's built-in Generic HTTP module (POST: URL +
// Body). Labels mirror what Companion shows: the module's action names come
// from companion-module/src/model.js, the Generic HTTP field names from that
// module ("URL", "Body", "header input(JSON)", "Content Type").

const CopyValue = ({ value, display = value }) => {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    copyText(value)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {});
  return (
    <span className="ctl-cp-value">
      <code title={value}>{display}</code>
      <button type="button" className="btn-v3-ghost btn-v3-sm ctl-cp-copy" onClick={copy} title="Скопировать">
        {copied ? '✓' : 'Copy'}
      </button>
    </span>
  );
};

const Field = ({ label, children }) => (
  <div className="ctl-cp-field">
    <span className="ctl-cp-label">{label}</span>
    {children}
  </div>
);

const Plain = ({ children }) => <span className="ctl-cp-plain">{children}</span>;

// Module action + option values for a canonical action id, or null.
export const companionModuleFields = (action, outputs = [], timers = []) => {
  const parsed = parseActionId(action);
  if (!parsed) return null;
  if (parsed.kind === 'output') {
    const index = outputs.findIndex((output) => output.id === parsed.id);
    const command = OUTPUT_COMMANDS.find((item) => item.id === parsed.command);
    if (index < 0 || !command) return null;
    return {
      action: ACTION_NAMES.output_command,
      options: [
        ['Output', `#${index + 1} ${outputs[index].name || outputs[index].id}`],
        ['Command', command.label],
      ],
    };
  }
  if (parsed.kind === 'timer') {
    const timer = timers.find((item) => item.id === parsed.id);
    const command = TIMER_COMMANDS.find((item) => item.id === parsed.command);
    if (!timer || !command) return null;
    return {
      action: ACTION_NAMES.timer_command,
      options: [
        ['Timer', timer.name || timer.id],
        ['Command', command.label],
      ],
    };
  }
  if (parsed.kind === 'global' && parsed.command === 'allOutputsOut') {
    return { action: ACTION_NAMES.panic, options: [] };
  }
  return null;
};

export default function CompanionCommandFields({ action, outputs, timers }) {
  const moduleFields = companionModuleFields(action, outputs, timers);
  const url = `${BACKEND_ORIGIN}/api/command`;
  const body = JSON.stringify({ actionId: action });

  return (
    <div className="ctl-cp-grid">
      {moduleFields && (
        <div className="ctl-cp-block">
          <div className="ctl-cp-head">
            Модуль Web Title Pro <span className="ctl-cp-tag">рекомендуется</span>
          </div>
          <Field label="Действие (Add action)">
            <CopyValue value={moduleFields.action} />
          </Field>
          {moduleFields.options.map(([label, value]) => (
            <Field key={label} label={label}>
              <Plain>{value}</Plain>
            </Field>
          ))}
        </div>
      )}
      <div className="ctl-cp-block">
        <div className="ctl-cp-head">
          Generic HTTP → действие <b>POST</b>
        </div>
        <Field label="URL">
          <CopyValue value={url} />
        </Field>
        <Field label="Body">
          <CopyValue value={body} />
        </Field>
        <Field label="header input(JSON)">
          <Plain>оставить пустым</Plain>
        </Field>
        <Field label="Content Type">
          <Plain>application/json (по умолчанию)</Plain>
        </Field>
      </div>
    </div>
  );
}
