import OutputCard from './OutputCard.jsx';

export default function OutputsSidebar({
  outputs,
  entries,
  selectedOutputId,
  busyAction,
  onSelectOutput,
  onAssignEntry,
  onPlay,
  onStop,
}) {
  return (
    <aside className="outputs-v2">
      {outputs.map((output) => (
        <OutputCard
          key={output.id}
          output={output}
          entries={entries}
          isSelected={output.id === selectedOutputId}
          busy={busyAction === `output-${output.id}` || busyAction === 'show' || busyAction === 'hide'}
          onSelect={onSelectOutput}
          onAssignEntry={onAssignEntry}
          onPlay={onPlay}
          onStop={onStop}
        />
      ))}
      {outputs.length === 0 && (
        <div className="hint-card-v2" style={{ padding: '16px' }}>
          <strong>No outputs yet</strong>
          Add an output in the Config tab to start playing titles.
        </div>
      )}
    </aside>
  );
}
