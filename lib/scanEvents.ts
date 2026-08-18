type ScanResultsListener = () => void;

const listeners = new Set<ScanResultsListener>();
const resetListeners = new Set<ScanResultsListener>();

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

export function emitWorkspaceReset() {
  for (const listener of resetListeners) {
    listener();
  }
  emitScanResultsChanged();
}

export function onWorkspaceReset(listener: ScanResultsListener) {
  resetListeners.add(listener);
  return () => {
    resetListeners.delete(listener);
  };
}
