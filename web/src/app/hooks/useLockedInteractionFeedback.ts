import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { ATOM_PICK_MAX_DELTA_PX } from "../../scene/atomPicking";

const LOCKED_INTERACTION_WHEEL_IDLE_MS = 150;
const REDISPATCHED_CONTEXT_MENU_EVENT = "__prettyLatticeRedispatchedContextMenu";

interface LockedInteractionPointer {
  pointerId: number;
  startX: number;
  startY: number;
  triggered: boolean;
}

type RedispatchedContextMenuEvent = MouseEvent & {
  [REDISPATCHED_CONTEXT_MENU_EVENT]?: boolean;
};

interface UseLockedInteractionFeedbackOptions {
  hasVisibleScene: boolean;
  interactionLocked: boolean;
}

function isRedispatchedContextMenuEvent(event: MouseEvent): boolean {
  return Boolean((event as RedispatchedContextMenuEvent)[REDISPATCHED_CONTEXT_MENU_EVENT]);
}

function isCanvasContextMenuTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("canvas") !== null;
}

function redispatchContextMenuEvent(
  event: ReactMouseEvent<HTMLElement>,
  nativeEvent: MouseEvent,
) {
  const redispatchedEvent = new MouseEvent("contextmenu", {
    bubbles: true,
    button: nativeEvent.button,
    buttons: nativeEvent.buttons,
    cancelable: true,
    clientX: nativeEvent.clientX,
    clientY: nativeEvent.clientY,
    ctrlKey: nativeEvent.ctrlKey,
    metaKey: nativeEvent.metaKey,
    shiftKey: nativeEvent.shiftKey,
  }) as RedispatchedContextMenuEvent;
  redispatchedEvent[REDISPATCHED_CONTEXT_MENU_EVENT] = true;
  event.currentTarget.dispatchEvent(redispatchedEvent);
}

export function useLockedInteractionFeedback({
  hasVisibleScene,
  interactionLocked,
}: UseLockedInteractionFeedbackOptions) {
  const [lockedInteractionFeedbackCount, setLockedInteractionFeedbackCount] = useState(0);
  const lockedInteractionPointerRef = useRef<LockedInteractionPointer | null>(null);
  const lockedInteractionWheelIdleTimeoutRef = useRef<number | null>(null);

  const triggerLockedInteractionFeedback = useCallback(() => {
    setLockedInteractionFeedbackCount((count) => count + 1);
  }, []);

  const clearLockedInteractionWheelGate = useCallback(() => {
    if (lockedInteractionWheelIdleTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(lockedInteractionWheelIdleTimeoutRef.current);
    lockedInteractionWheelIdleTimeoutRef.current = null;
  }, []);

  const resetLockedInteractionFeedback = useCallback(() => {
    setLockedInteractionFeedbackCount(0);
    lockedInteractionPointerRef.current = null;
    clearLockedInteractionWheelGate();
  }, [clearLockedInteractionWheelGate]);

  useEffect(() => () => clearLockedInteractionWheelGate(), [clearLockedInteractionWheelGate]);

  useEffect(() => {
    if (!hasVisibleScene || !interactionLocked) {
      clearLockedInteractionWheelGate();
    }
  }, [clearLockedInteractionWheelGate, hasVisibleScene, interactionLocked]);

  const handleSceneWheelCapture = useCallback(() => {
    if (!hasVisibleScene || !interactionLocked) {
      clearLockedInteractionWheelGate();
      return;
    }

    if (lockedInteractionWheelIdleTimeoutRef.current === null) {
      triggerLockedInteractionFeedback();
    } else {
      window.clearTimeout(lockedInteractionWheelIdleTimeoutRef.current);
    }

    lockedInteractionWheelIdleTimeoutRef.current = window.setTimeout(() => {
      lockedInteractionWheelIdleTimeoutRef.current = null;
    }, LOCKED_INTERACTION_WHEEL_IDLE_MS);
  }, [
    clearLockedInteractionWheelGate,
    hasVisibleScene,
    interactionLocked,
    triggerLockedInteractionFeedback,
  ]);

  const handleScenePointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!hasVisibleScene || !interactionLocked || event.button !== 0) {
        lockedInteractionPointerRef.current = null;
        return;
      }

      lockedInteractionPointerRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        triggered: false,
      };
    },
    [hasVisibleScene, interactionLocked],
  );

  const handleScenePointerMoveCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const lockedPointer = lockedInteractionPointerRef.current;
      if (
        !hasVisibleScene ||
        !interactionLocked ||
        !lockedPointer ||
        lockedPointer.pointerId !== event.pointerId ||
        lockedPointer.triggered
      ) {
        return;
      }

      const dragDistance = Math.hypot(
        event.clientX - lockedPointer.startX,
        event.clientY - lockedPointer.startY,
      );
      if (dragDistance <= ATOM_PICK_MAX_DELTA_PX) {
        return;
      }

      lockedPointer.triggered = true;
      triggerLockedInteractionFeedback();
    },
    [hasVisibleScene, interactionLocked, triggerLockedInteractionFeedback],
  );

  const handleScenePointerEndCapture = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (lockedInteractionPointerRef.current?.pointerId === event.pointerId) {
      lockedInteractionPointerRef.current = null;
    }
  }, []);

  const handleSceneContextMenuCapture = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    const nativeEvent = event.nativeEvent;
    if (isRedispatchedContextMenuEvent(nativeEvent)) {
      return;
    }

    if (!isCanvasContextMenuTarget(event.target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    redispatchContextMenuEvent(event, nativeEvent);
  }, []);

  return {
    handleSceneContextMenuCapture,
    handleScenePointerDownCapture,
    handleScenePointerEndCapture,
    handleScenePointerMoveCapture,
    handleSceneWheelCapture,
    lockedInteractionFeedbackCount,
    resetLockedInteractionFeedback,
    triggerLockedInteractionFeedback,
  };
}
