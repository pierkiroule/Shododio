import { useRef } from "react";
import { AppCanvas } from "./AppCanvas";
import { AppControls } from "./AppControls";
import { useAppState } from "./useAppState";
import { useCanvasLoop } from "./useCanvasLoop";

const App = () => {
  const canvasRef = useRef(null);
  const canvasWrapRef = useRef(null);

  const { menuSections, toggleMenuSection } = useAppState();

  useCanvasLoop({
    canvasRef,
    canvasWrapRef
  });

  return (
    <div className="app">
      <svg className="filter-defs" aria-hidden="true">
        <filter id="ink-sharpen">
          <feConvolveMatrix order="3" kernelMatrix="0 -1 0 -1 5 -1 0 -1 0" />
        </filter>
      </svg>

      <AppCanvas canvasRef={canvasRef} canvasWrapRef={canvasWrapRef} />

      <AppControls
        menuSections={menuSections}
        toggleMenuSection={toggleMenuSection}
      />
    </div>
  );
};

export default App;
