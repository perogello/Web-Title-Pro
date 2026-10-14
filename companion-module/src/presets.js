// Ready-made buttons (Companion "Presets" tab). Built from the live snapshot so
// every output / timer / title gets its own buttons with the right ids, live
// labels (variables) and on-air feedback.
import { getEntries, getOutputs, getTimers, OUTPUT_COMMANDS, outputLabel } from './model.js';

const rgb = (r, g, b) => ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);

export const COLORS = {
  white: rgb(255, 255, 255),
  black: rgb(0, 0, 0),
  dark: rgb(28, 28, 34),
  live: rgb(204, 22, 22),
  green: rgb(0, 140, 70),
  preview: rgb(0, 110, 60),
  blue: rgb(30, 80, 170),
  amber: rgb(190, 120, 0),
};

const button = ({ category, name, text, size = 'auto', color = COLORS.white, bgcolor = COLORS.dark, down, feedbacks = [] }) => ({
  type: 'button',
  category,
  name,
  style: { text, size, color, bgcolor },
  feedbacks,
  steps: [{ down, up: [] }],
});

const COMMAND_TEXT = {
  titleIn: 'IN',
  titleOut: 'OUT',
  previewIn: 'PVW\\nIN',
  previewOut: 'PVW\\nOUT',
  rowPrev: 'ROW\\n▲',
  rowNext: 'ROW\\n▼',
  timerStart: 'ROW\\nTIMER ▶',
  timerStop: 'ROW\\nTIMER ■',
  timerReset: 'ROW\\nTIMER ↺',
};

export const buildPresets = (snapshot, label) => {
  const presets = {};
  const v = (id) => `$(${label}:${id})`;

  getOutputs(snapshot).forEach((output, index) => {
    const n = index + 1;
    const category = `Output ${outputLabel(output, index)}`;
    const onAir = {
      feedbackId: 'output_on_air',
      options: { output: output.id },
      style: { bgcolor: COLORS.live, color: COLORS.white },
    };

    // Main button: shows what's selected, toggles it on/off air, red when live.
    presets[`o${n}_toggle`] = button({
      category,
      name: `${output.name}: toggle title on air`,
      text: `${v(`o${n}_name`)}\\n${v(`o${n}_value1`)}`,
      size: '14',
      down: [{ actionId: 'output_toggle', options: { output: output.id } }],
      feedbacks: [onAir],
    });

    for (const { id } of OUTPUT_COMMANDS) {
      const feedbacks = [];
      if (id === 'titleIn') feedbacks.push(onAir);
      if (id === 'previewIn') {
        feedbacks.push({
          feedbackId: 'output_preview',
          options: { output: output.id },
          style: { bgcolor: COLORS.preview, color: COLORS.white },
        });
      }
      presets[`o${n}_${id}`] = button({
        category,
        name: `${output.name}: ${id}`,
        text: COMMAND_TEXT[id],
        bgcolor: id === 'titleIn' ? COLORS.green : id === 'titleOut' ? rgb(110, 20, 20) : COLORS.dark,
        down: [{ actionId: 'output_command', options: { output: output.id, command: id } }],
        feedbacks,
      });
    }

    // One "put this title on the output" button per title.
    getEntries(snapshot).forEach((entry) => {
      presets[`o${n}_select_${entry.id}`] = button({
        category: `Titles → ${outputLabel(output, index)}`,
        name: `${entry.name} → ${output.name}`,
        text: entry.name,
        size: '14',
        down: [{ actionId: 'select_title', options: { output: output.id, entry: entry.id, take: false } }],
        feedbacks: [
          {
            feedbackId: 'output_title_selected',
            options: { output: output.id, entry: entry.id },
            style: { bgcolor: COLORS.blue, color: COLORS.white },
          },
        ],
      });
    });
  });

  getTimers(snapshot).forEach((timer, index) => {
    const n = index + 1;
    const category = 'Timers';
    presets[`t${n}_toggle`] = button({
      category,
      name: `${timer.name}: start / stop`,
      text: `${v(`t${n}_name`)}\\n${v(`t${n}_time`)}`,
      size: '14',
      down: [{ actionId: 'timer_toggle', options: { timer: timer.id } }],
      feedbacks: [
        { feedbackId: 'timer_running', options: { timer: timer.id }, style: { bgcolor: COLORS.green, color: COLORS.white } },
        { feedbackId: 'timer_color', options: { timer: timer.id } },
      ],
    });
    presets[`t${n}_reset`] = button({
      category,
      name: `${timer.name}: reset`,
      text: `${v(`t${n}_name`)}\\nRESET`,
      size: '14',
      down: [{ actionId: 'timer_command', options: { timer: timer.id, command: 'reset' } }],
    });
  });

  presets.panic = button({
    category: 'Global',
    name: 'Panic — hide every output',
    text: 'ALL\\nOUT',
    size: '18',
    color: COLORS.white,
    bgcolor: rgb(120, 0, 0),
    down: [{ actionId: 'panic', options: {} }],
  });

  presets.status = button({
    category: 'Global',
    name: 'On-air counter',
    text: `ON AIR\\n${v('on_air_count')}`,
    size: '18',
    down: [],
    feedbacks: [{ feedbackId: 'any_on_air', options: {}, style: { bgcolor: COLORS.live, color: COLORS.white } }],
  });

  return presets;
};
