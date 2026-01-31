import { useCallback, useEffect, useRef } from "react";
import { clamp } from "../utils/math";

const createTouchState = () => ({
  x: 0,
  y: 0,
  strength: 0,
  active: false,
  lastX: 0,
  lastY: 0,
  swipeAngle: 0,
  swipePower: 0,
  tapBoost: 0
});

export const useTouchGuide = ({ canvasWrapRef, canvasRef, onPointerDown, onPointerMove, onPointerUp }) => {
  const touchRef = useRef(createTouchState());
  const activePointerIdRef = useRef(null);

  const updateTouchPoint = useCallback((event) => {
    const canvasWrap = canvasWrapRef.current;
    const paper = canvasRef.current;
    if (!canvasWrap || !paper) return;
    if (event.target.closest(".action-area")) return;
    const rect = canvasWrap.getBoundingClientRect();
    const scaleX = rect.width > 0 ? paper.width / rect.width : 1;
    const scaleY = rect.height > 0 ? paper.height / rect.height : 1;
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    const y = clamp(event.clientY - rect.top, 0, rect.height);
    touchRef.current.x = x * scaleX;
    touchRef.current.y = y * scaleY;
  }, [canvasRef, canvasWrapRef]);

  const onCanvasTap = useCallback((event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    updateTouchPoint(event);
    touchRef.current.lastX = touchRef.current.x;
    touchRef.current.lastY = touchRef.current.y;
    touchRef.current.strength = 1;
    touchRef.current.active = true;
    touchRef.current.swipePower = 0;
    touchRef.current.tapBoost = clamp(touchRef.current.tapBoost + 0.35, 0, 1.5);
    activePointerIdRef.current = event.pointerId;
    canvasWrapRef.current?.setPointerCapture?.(event.pointerId);
    onPointerDown?.({ x: touchRef.current.x, y: touchRef.current.y }, event);
  }, [canvasWrapRef, onPointerDown, updateTouchPoint]);

  const onCanvasMove = useCallback((event) => {
    if (activePointerIdRef.current === null || event.pointerId !== activePointerIdRef.current) return;
    const prevX = touchRef.current.x;
    const prevY = touchRef.current.y;
    updateTouchPoint(event);
    onPointerMove?.({ x: prevX, y: prevY }, { x: touchRef.current.x, y: touchRef.current.y }, event);
    const dx = touchRef.current.x - touchRef.current.lastX;
    const dy = touchRef.current.y - touchRef.current.lastY;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.5) {
      touchRef.current.swipeAngle = Math.atan2(dy, dx);
      touchRef.current.swipePower = clamp(touchRef.current.swipePower + dist * 0.02, 0, 1);
      touchRef.current.lastX = touchRef.current.x;
      touchRef.current.lastY = touchRef.current.y;
    }
    touchRef.current.strength = 1;
  }, [onPointerMove, updateTouchPoint]);

  const onCanvasRelease = useCallback((event) => {
    if (activePointerIdRef.current === null || event.pointerId !== activePointerIdRef.current) return;
    touchRef.current.active = false;
    activePointerIdRef.current = null;
    canvasWrapRef.current?.releasePointerCapture?.(event.pointerId);
    onPointerUp?.({ x: touchRef.current.x, y: touchRef.current.y }, event);
  }, [canvasWrapRef, onPointerUp]);

  const resetTouch = useCallback(() => {
    touchRef.current = createTouchState();
    activePointerIdRef.current = null;
  }, []);

  useEffect(() => {
    const canvasWrap = canvasWrapRef.current;
    if (!canvasWrap) return undefined;

    canvasWrap.addEventListener("pointerdown", onCanvasTap);
    canvasWrap.addEventListener("pointermove", onCanvasMove);
    canvasWrap.addEventListener("pointerup", onCanvasRelease);
    canvasWrap.addEventListener("pointercancel", onCanvasRelease);

    return () => {
      canvasWrap.removeEventListener("pointerdown", onCanvasTap);
      canvasWrap.removeEventListener("pointermove", onCanvasMove);
      canvasWrap.removeEventListener("pointerup", onCanvasRelease);
      canvasWrap.removeEventListener("pointercancel", onCanvasRelease);
    };
  }, [canvasWrapRef, onCanvasMove, onCanvasRelease, onCanvasTap]);

  return {
    touchRef,
    resetTouch
  };
};
