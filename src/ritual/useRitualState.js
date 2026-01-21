import { useCallback, useRef } from "react";

export const useRitualState = () => {
  const phaseRef = useRef("READY");
  const startTimeRef = useRef(0);
  const timeLimitRef = useRef(10000);
  const remainingTimeRef = useRef(0);

  const setPhase = useCallback((next) => {
    phaseRef.current = next;
  }, []);

  return {
    phaseRef,
    startTimeRef,
    timeLimitRef,
    remainingTimeRef,
    setPhase
  };
};
