import { useMemo, useState } from 'react';
import { buildProjectSignature } from './project-utils.js';
import { useProjectDirty } from './use-project-dirty.js';

const DEFAULT_PROJECT_STATUS = {
  supported: false,
  currentProjectPath: null,
  recentProjects: [],
};

const getProjectFileName = (projectPath) => {
  if (!projectPath) {
    return 'Unsaved Project';
  }

  const parts = projectPath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || 'Unsaved Project';
};

const getProjectDisplayName = (projectName) =>
  projectName.replace(/\.wtp-project(\.json)?$/i, '') || 'Unsaved Project';

export function useProjectState({ snapshot, sourceLibrary, selectedSourceId }) {
  const [projectStatus, setProjectStatus] = useState(DEFAULT_PROJECT_STATUS);

  const currentProjectName = useMemo(
    () => getProjectFileName(projectStatus?.currentProjectPath || ''),
    [projectStatus?.currentProjectPath],
  );
  const currentProjectDisplayName = useMemo(
    () => getProjectDisplayName(currentProjectName),
    [currentProjectName],
  );
  const currentProjectSignature = useMemo(
    () => (snapshot ? buildProjectSignature({ snapshot, sourceLibrary, selectedSourceId }) : null),
    [snapshot, sourceLibrary, selectedSourceId],
  );
  const {
    dirty: projectDirty,
    setBaseline: setProjectBaselineSignature,
    setDirty: setProjectDirty,
  } = useProjectDirty(currentProjectSignature);

  return {
    projectStatus,
    setProjectStatus,
    currentProjectDisplayName,
    projectDirty,
    setProjectBaselineSignature,
    setProjectDirty,
  };
}
