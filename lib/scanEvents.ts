type ScanResultsListener = () => void;

const listeners = new Set<ScanResultsListener>();
const resetListeners = new Set<ScanResultsListener>();
const templateListeners = new Set<ScanResultsListener>();

export function emitScanResultsChanged() {
  for (const listener of listeners) {
    listener();
  }
}

export function onScanResultsChanged(listener: ScanResultsListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitTemplatesChanged() {
  for (const listener of templateListeners) {
    listener();
  }
}

export function onTemplatesChanged(listener: ScanResultsListener) {
  templateListeners.add(listener);
  return () => {
    templateListeners.delete(listener);
  };
}

export function emitWorkspaceReset() {
  for (const listener of resetListeners) {
    listener();
  }
  emitTemplatesChanged();
  emitScanResultsChanged();
}

export function onWorkspaceReset(listener: ScanResultsListener) {
  resetListeners.add(listener);
  return () => {
    resetListeners.delete(listener);
  };
}
