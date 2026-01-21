import { useEffect, useRef } from "react";
import { AppCanvas } from "./AppCanvas";
import { AppControls } from "./AppControls";
import { useAppState } from "./useAppState";
import { useCanvasLoop } from "./useCanvasLoop";

const App = () => {
  const canvasRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const videoRefs = useRef({});
  const galleryActionsRef = useRef({});

  const {
    cycles,
    updateCycles,
    selectedCycles,
    playingId,
    setPlayingId,
    galleryOpen,
    setGalleryOpen,
    galleryExportOpen,
    setGalleryExportOpen,
    galleryExpanded,
    setGalleryExpanded,
    menuSections,
    toggleMenuSection
  } = useAppState();

  useCanvasLoop({
    canvasRef,
    canvasWrapRef,
    updateCycles,
    galleryActionsRef
  });

  const handlePlayPreview = (cycleId) => {
    setPlayingId((prev) => (prev === cycleId ? null : cycleId));
  };

  useEffect(() => {
    if (!playingId) return;
    const video = videoRefs.current[playingId];
    if (video) {
      video.currentTime = 0;
      video.play().catch(() => {});
    }
  }, [playingId]);

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
        setGalleryOpen={setGalleryOpen}
        galleryOpen={galleryOpen}
        galleryExpanded={galleryExpanded}
        setGalleryExpanded={setGalleryExpanded}
        galleryExportOpen={galleryExportOpen}
        setGalleryExportOpen={setGalleryExportOpen}
        cycles={cycles}
        selectedCycles={selectedCycles}
        playingId={playingId}
        onPlayPreview={handlePlayPreview}
        galleryActionsRef={galleryActionsRef}
        videoRefs={videoRefs}
      />
    </div>
  );
};

export default App;
