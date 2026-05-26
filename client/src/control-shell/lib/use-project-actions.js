import { useCallback, useEffect, useRef } from 'react';
import { normalizeSourceLibrary } from '../../source-library.js';
import { api, BACKEND_ORIGIN } from '../api.js';
import {
  buildProjectDocumentPayload,
  buildProjectSignature,
  buildWindowTitle,
  getSuggestedProjectName,
} from './project-utils.js';

const formatBundleCount = (count, singular, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

export function useProjectActions({
  desktopBridge,
  appVersion,
  currentProjectDisplayName,
  projectDirty,
  projectStatus,
  sourceLibrary,
  selectedSourceId,
  vmixState,
  setProjectBaselineSignature,
  setProjectDirty,
  setProjectStatus,
  setSourceLibrary,
  setSelectedSourceId,
  setActiveSourceRows,
  setActiveTimerRows,
  setSourceRowTimers,
  persistDraft,
  pushFeedback,
}) {
  const appCloseAuthorizedRef = useRef(false);
  const vmixStateRef = useRef(vmixState || null);

  useEffect(() => {
    vmixStateRef.current = vmixState || null;
  }, [vmixState]);

  const resetSourceRuntimeState = useCallback(() => {
    setActiveSourceRows({});
    setActiveTimerRows({});
    setSourceRowTimers({});
  }, [setActiveSourceRows, setActiveTimerRows, setSourceRowTimers]);

  const buildProjectDocument = useCallback(async () => {
    const exported = await api('/api/project/export');

    return buildProjectDocumentPayload({
      exportedState: exported?.state || {},
      projectName: currentProjectDisplayName,
      appVersion: appVersion || null,
      selectedSourceId,
      sourceLibrary,
      vmixState: vmixStateRef.current,
    });
  }, [appVersion, currentProjectDisplayName, selectedSourceId, sourceLibrary]);

  const saveProject = useCallback(
    async ({ saveAs = false } = {}) => {
      if (!desktopBridge?.saveProject || !desktopBridge?.saveProjectAs) {
        pushFeedback('Project files are available in the desktop app only');
        return { canceled: true };
      }

      try {
        await persistDraft();
        const project = await buildProjectDocument();
        const savedSignature = buildProjectSignature({
          snapshot: project.state || {},
          sourceLibrary: project.sources?.items || [],
          selectedSourceId: project.sources?.selectedSourceId || null,
        });
        const suggestedName = getSuggestedProjectName(project.meta?.name);
        const result = saveAs
          ? await desktopBridge.saveProjectAs({ project, suggestedName })
          : await desktopBridge.saveProject({
              path: projectStatus?.currentProjectPath || null,
              project,
              suggestedName,
            });

        if (result?.canceled) {
          return result;
        }

        if (result?.status) {
          setProjectStatus(result.status);
        }

        setProjectBaselineSignature(savedSignature);
        setProjectDirty(false);

        pushFeedback(`Project saved: ${result.path?.split(/[\\/]/).pop() || 'project'}`);
        return result;
      } catch (requestError) {
        pushFeedback(requestError.message);
        return { canceled: true, error: requestError.message };
      }
    },
    [
      buildProjectDocument,
      desktopBridge,
      persistDraft,
      projectStatus?.currentProjectPath,
      pushFeedback,
      setProjectBaselineSignature,
      setProjectDirty,
      setProjectStatus,
    ],
  );

  const confirmProceedWithUnsavedProject = useCallback(
    async (detail) => {
      if (!projectDirty) {
        return true;
      }

      if (desktopBridge?.confirmUnsavedChanges) {
        const result = await desktopBridge.confirmUnsavedChanges({ detail });

        if (result?.action === 'cancel') {
          return false;
        }

        if (result?.action === 'save') {
          const saveResult = await saveProject();
          return Boolean(saveResult && !saveResult.canceled);
        }

        return true;
      }

      return window.confirm('The current project has unsaved changes. Continue without saving?');
    },
    [desktopBridge, projectDirty, saveProject],
  );

  const applyProjectDocument = useCallback(
    async (projectDocument, nextProjectStatus = null) => {
      await api('/api/project/load', {
        method: 'POST',
        body: {
          state: projectDocument?.state || {},
          seedExamples: false,
        },
      });

      const nextSourceLibrary = normalizeSourceLibrary(projectDocument?.sources?.items || []);
      const nextSelectedSourceId =
        projectDocument?.sources?.selectedSourceId || nextSourceLibrary[0]?.id || '';

      setSourceLibrary(nextSourceLibrary);
      setSelectedSourceId(nextSelectedSourceId);
      resetSourceRuntimeState();

      if (nextProjectStatus) {
        setProjectStatus(nextProjectStatus);
      }

      const nextSignature = buildProjectSignature({
        snapshot: {
          selectedOutputId: projectDocument?.state?.selectedOutputId || null,
          outputs: projectDocument?.state?.outputs || [],
          integrations: projectDocument?.state?.integrations || {},
          entries: projectDocument?.state?.entries || [],
          timers: projectDocument?.state?.timers || [],
        },
        sourceLibrary: nextSourceLibrary,
        selectedSourceId: nextSelectedSourceId,
      });

      setProjectBaselineSignature(nextSignature);
      setProjectDirty(false);
    },
    [
      resetSourceRuntimeState,
      setProjectBaselineSignature,
      setProjectDirty,
      setProjectStatus,
      setSelectedSourceId,
      setSourceLibrary,
    ],
  );

  const createNewProject = useCallback(async () => {
    try {
      const shouldProceed = await confirmProceedWithUnsavedProject(
        'Do you want to save the current project before creating a new one?',
      );

      if (!shouldProceed) {
        return;
      }

      const nextSnapshot = await api('/api/project/load', {
        method: 'POST',
        body: {
          state: {},
          seedExamples: true,
        },
      });

      setSourceLibrary([]);
      setSelectedSourceId('');
      resetSourceRuntimeState();

      if (desktopBridge?.createNewProject) {
        const status = await desktopBridge.createNewProject();
        if (status) {
          setProjectStatus(status);
        }
      }

      const nextSignature = buildProjectSignature({
        snapshot: nextSnapshot,
        sourceLibrary: [],
        selectedSourceId: '',
      });
      setProjectBaselineSignature(nextSignature);
      setProjectDirty(false);

      pushFeedback('New project created');
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  }, [
    confirmProceedWithUnsavedProject,
    desktopBridge,
    pushFeedback,
    resetSourceRuntimeState,
    setProjectBaselineSignature,
    setProjectDirty,
    setProjectStatus,
    setSelectedSourceId,
    setSourceLibrary,
  ]);

  const openProject = useCallback(async () => {
    if (!desktopBridge?.openProjectDialog) {
      pushFeedback('Project files are available in the desktop app only');
      return;
    }

    try {
      const shouldProceed = await confirmProceedWithUnsavedProject(
        'Do you want to save the current project before opening another one?',
      );

      if (!shouldProceed) {
        return;
      }

      const result = await desktopBridge.openProjectDialog();

      if (result?.canceled) {
        return;
      }

      await applyProjectDocument(result.project, result.status || null);
      pushFeedback(`Project opened: ${result.path?.split(/[\\/]/).pop() || 'project'}`);
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  }, [applyProjectDocument, confirmProceedWithUnsavedProject, desktopBridge, pushFeedback]);

  const openRecentProject = useCallback(
    async (projectPath) => {
      if (!desktopBridge?.openRecentProject || !projectPath) {
        return;
      }

      try {
        const shouldProceed = await confirmProceedWithUnsavedProject(
          'Do you want to save the current project before opening another one?',
        );

        if (!shouldProceed) {
          return;
        }

        const result = await desktopBridge.openRecentProject(projectPath);

        if (result?.canceled) {
          return;
        }

        await applyProjectDocument(result.project, result.status || null);
        pushFeedback(`Project opened: ${result.path?.split(/[\\/]/).pop() || 'project'}`);
      } catch (requestError) {
        pushFeedback(requestError.message);
      }
    },
    [applyProjectDocument, confirmProceedWithUnsavedProject, desktopBridge, pushFeedback],
  );

  useEffect(() => {
    let mounted = true;

    if (!desktopBridge?.getProjectStatus) {
      return undefined;
    }

    desktopBridge
      .getProjectStatus()
      .then((status) => {
        if (mounted && status) {
          setProjectStatus(status);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [desktopBridge, setProjectStatus]);

  useEffect(() => {
    let mounted = true;

    if (!desktopBridge?.getStartupProject) {
      return undefined;
    }

    desktopBridge
      .getStartupProject()
      .then(async (result) => {
        if (!mounted || !result) {
          return;
        }

        if (result.status) {
          setProjectStatus(result.status);
        }

        if (result.project) {
          await applyProjectDocument(result.project, result.status || null);
          pushFeedback(`Project opened: ${result.path?.split(/[\\/]/).pop() || 'project'}`);
        } else if (result.error) {
          pushFeedback(result.error);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [applyProjectDocument, desktopBridge, pushFeedback, setProjectStatus]);

  useEffect(() => {
    const nextTitle = buildWindowTitle(currentProjectDisplayName, projectDirty);
    document.title = nextTitle;
    desktopBridge?.setWindowTitle?.({ title: nextTitle });
  }, [currentProjectDisplayName, projectDirty, desktopBridge]);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!projectDirty || appCloseAuthorizedRef.current) {
        return;
      }

      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [projectDirty]);

  useEffect(() => {
    window.__webTitleHandleCloseRequest = async () => {
      const shouldProceed = await confirmProceedWithUnsavedProject(
        'Do you want to save the current project before closing Web Title Pro?',
      );

      if (!shouldProceed) {
        return false;
      }

      if (desktopBridge?.requestAppClose) {
        appCloseAuthorizedRef.current = true;
        await desktopBridge.requestAppClose();
      }

      return true;
    };

    return () => {
      delete window.__webTitleHandleCloseRequest;
    };
  }, [confirmProceedWithUnsavedProject, desktopBridge]);

  useEffect(() => {
    window.__webTitleAuthorizeAppClose = () => {
      appCloseAuthorizedRef.current = true;
      return true;
    };

    return () => {
      delete window.__webTitleAuthorizeAppClose;
    };
  }, []);

  useEffect(() => {
    window.__webTitleConfirmUpdateInstall = async () =>
      confirmProceedWithUnsavedProject(
        'Do you want to save the current project before updating Web Title Pro?',
      );

    return () => {
      delete window.__webTitleConfirmUpdateInstall;
    };
  }, [confirmProceedWithUnsavedProject]);

  // ----------------------------------------------------------------------
  // .wtpkg project bundle: single-file archive that carries the project
  // document + every custom template referenced by entries. Lets a user
  // ship one file to a colleague without separately copying the templates
  // folder. Built-in templates are NOT bundled (assumed present on every
  // installation).
  // ----------------------------------------------------------------------
  const exportProjectBundle = useCallback(async () => {
    try {
      await persistDraft();
      const project = await buildProjectDocument();
      const response = await fetch(`${BACKEND_ORIGIN}/api/project/bundle/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project }),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({ error: 'Bundle export failed' }));
        throw new Error(errorPayload.error || 'Bundle export failed');
      }
      const blob = await response.blob();
      const includedCount = Number(response.headers.get('X-Bundle-Included-Templates') || 0);
      const outputCount = Number(response.headers.get('X-Bundle-Outputs') || 0);
      const entryCount = Number(response.headers.get('X-Bundle-Entries') || 0);
      const sourceCount = Number(response.headers.get('X-Bundle-Sources') || 0);
      const vmixInputCount = Number(response.headers.get('X-Bundle-Vmix-Inputs') || 0);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${getSuggestedProjectName(project.meta?.name)}.wtpkg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      const projectSummary = [
        formatBundleCount(outputCount, 'output'),
        formatBundleCount(entryCount, 'title'),
        formatBundleCount(sourceCount, 'data source'),
        formatBundleCount(vmixInputCount, 'vMix input'),
      ].join(', ');
      const templateSummary =
        includedCount > 0
          ? formatBundleCount(includedCount, 'custom template')
          : 'no custom templates referenced';
      pushFeedback(`Bundle exported: ${projectSummary}, ${templateSummary}`);
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  }, [buildProjectDocument, persistDraft, pushFeedback]);

  // Bundle import accepts a File object (caller provides the picker).
  // Uploads as multipart, lets the server unpack templates, then applies
  // the returned project document via the regular load flow so signatures
  // and dirty-state stay consistent with Save/Open.
  const importProjectBundleFile = useCallback(
    async (file) => {
      if (!file) {
        return;
      }

      try {
        const shouldProceed = await confirmProceedWithUnsavedProject(
          'Do you want to save the current project before importing a bundle?',
        );
        if (!shouldProceed) {
          return;
        }

        const formData = new FormData();
        formData.append('bundle', file, file.name || 'bundle.wtpkg');
        const result = await api('/api/project/bundle/import', {
          method: 'POST',
          body: formData,
        });

        await applyProjectDocument(result?.project, null);

        const imported = (result?.importedTemplates || []).filter((item) => !item.error);
        const skipped = result?.skippedTemplates || [];
        const failed = (result?.importedTemplates || []).filter((item) => item.error);

        const parts = [];
        if (imported.length) parts.push(`${imported.length} installed`);
        if (skipped.length) parts.push(`${skipped.length} skipped (already present)`);
        if (failed.length) parts.push(`${failed.length} failed`);

        pushFeedback(
          parts.length
            ? `Bundle imported with templates: ${parts.join(', ')}`
            : 'Bundle imported (no bundled templates)',
        );
      } catch (requestError) {
        pushFeedback(requestError.message);
      }
    },
    [applyProjectDocument, confirmProceedWithUnsavedProject, pushFeedback],
  );

  return {
    createNewProject,
    openProject,
    openRecentProject,
    saveProject,
    exportProjectBundle,
    importProjectBundleFile,
  };
}
