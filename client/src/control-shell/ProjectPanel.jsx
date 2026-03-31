export default function ProjectPanel({
  isOpen,
  currentProjectName,
  projectStatus,
  onClose,
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onOpenRecent,
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <section className="output-card project-panel-card">
      <div className="card-head">
        <div>
          <span className="panel-kicker">Project</span>
          <h3>{currentProjectName}</h3>
        </div>
        <button className="ghost-button compact-button" onClick={onClose}>Close</button>
      </div>
      <div className="project-panel-grid">
        <div className="meta-card">
          <span className="meta-label">Current File</span>
          <strong>{currentProjectName}</strong>
          <span className="output-note">{projectStatus?.currentProjectPath || 'Not saved yet'}</span>
          <div className="topbar-actions">
            <button className="ghost-button compact-button" onClick={onNew}>New</button>
            <button className="ghost-button compact-button" onClick={onOpen}>Open</button>
            <button className="ghost-button compact-button" onClick={onSave}>Save</button>
            <button className="ghost-button compact-button" onClick={onSaveAs}>Save As</button>
          </div>
        </div>
        <div className="meta-card">
          <span className="meta-label">Recent Projects</span>
          <div className="project-recent-list">
            {projectStatus?.recentProjects?.length ? projectStatus.recentProjects.map((item) => (
              <button
                key={item.path}
                className="source-list-item"
                onClick={() => onOpenRecent(item.path)}
              >
                <strong>{item.name}</strong>
                <span>{item.path}</span>
              </button>
            )) : (
              <div className="empty-state">No recent projects yet.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
