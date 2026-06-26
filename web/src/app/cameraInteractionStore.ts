import {
  DEFAULT_VIEW_SCALE,
  clampViewScale,
} from "./viewState";
import type { CrystalCameraState } from "../scene/crystalCamera";

type Listener = () => void;

export interface CameraViewScaleCommandSnapshot {
  version: number;
  viewScale: number;
}

export interface CameraStateCommandSnapshot {
  cameraState: CrystalCameraState | null;
  version: number;
}

export interface CameraInteractionStore {
  getCameraStateCommandSnapshot: () => CameraStateCommandSnapshot;
  getViewScaleCommandSnapshot: () => CameraViewScaleCommandSnapshot;
  getViewScaleSnapshot: () => number;
  requestCameraState: (cameraState: CrystalCameraState) => void;
  requestViewScale: (viewScale: number) => void;
  setViewScaleSnapshot: (viewScale: number) => void;
  subscribeCameraStateCommand: (listener: Listener) => () => void;
  subscribeViewScale: (listener: Listener) => () => void;
  subscribeViewScaleCommand: (listener: Listener) => () => void;
}

export function createCameraInteractionStore(
  initialViewScale = DEFAULT_VIEW_SCALE,
): CameraInteractionStore {
  let viewScale = clampViewScale(initialViewScale);
  let commandSnapshot: CameraViewScaleCommandSnapshot = {
    version: 0,
    viewScale,
  };
  let cameraStateCommandSnapshot: CameraStateCommandSnapshot = {
    cameraState: null,
    version: 0,
  };
  const cameraStateCommandListeners = new Set<Listener>();
  const viewScaleListeners = new Set<Listener>();
  const commandListeners = new Set<Listener>();

  function notify(listeners: Set<Listener>) {
    for (const listener of listeners) {
      listener();
    }
  }

  function setViewScaleSnapshot(nextViewScale: number) {
    const clampedViewScale = clampViewScale(nextViewScale);
    if (Object.is(clampedViewScale, viewScale)) {
      return;
    }

    viewScale = clampedViewScale;
    notify(viewScaleListeners);
  }

  return {
    getCameraStateCommandSnapshot: () => cameraStateCommandSnapshot,
    getViewScaleCommandSnapshot: () => commandSnapshot,
    getViewScaleSnapshot: () => viewScale,
    requestCameraState: (cameraState: CrystalCameraState) => {
      cameraStateCommandSnapshot = {
        cameraState,
        version: cameraStateCommandSnapshot.version + 1,
      };
      notify(cameraStateCommandListeners);
    },
    requestViewScale: (nextViewScale: number) => {
      const clampedViewScale = clampViewScale(nextViewScale);
      setViewScaleSnapshot(clampedViewScale);
      commandSnapshot = {
        version: commandSnapshot.version + 1,
        viewScale: clampedViewScale,
      };
      notify(commandListeners);
    },
    setViewScaleSnapshot,
    subscribeCameraStateCommand: (listener: Listener) => {
      cameraStateCommandListeners.add(listener);
      return () => cameraStateCommandListeners.delete(listener);
    },
    subscribeViewScale: (listener: Listener) => {
      viewScaleListeners.add(listener);
      return () => viewScaleListeners.delete(listener);
    },
    subscribeViewScaleCommand: (listener: Listener) => {
      commandListeners.add(listener);
      return () => commandListeners.delete(listener);
    },
  };
}
