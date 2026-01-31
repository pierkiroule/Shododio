import { useCallback, useRef } from "react";

export const useRitualState = () => {
  const phaseRef = useRef("READY");

  const setPhase = useCallback((next) => {
    phaseRef.current = next;
  }, []);

  return {
    phaseRef,
    setPhase
  };
};
