import { useCallback, useEffect, useMemo, useState } from "react";

export const useAppState = () => {
  const [cycles, setCycles] = useState([]);
  const [playingId, setPlayingId] = useState(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryExportOpen, setGalleryExportOpen] = useState(false);
  const [galleryExpanded, setGalleryExpanded] = useState(false);
  const [menuSections, setMenuSections] = useState({
    brushes: true,
    inks: false,
    size: false,
    opacity: false,
    advanced: false,
    gallery: false
  });

  useEffect(() => {
    if (!galleryOpen) {
      setGalleryExportOpen(false);
      setGalleryExpanded(false);
    }
  }, [galleryOpen]);

  const updateCycles = useCallback((updater) => {
    setCycles((prev) => (typeof updater === "function" ? updater(prev) : updater));
  }, []);

  const toggleMenuSection = useCallback((section) => {
    setMenuSections((prev) => ({
      ...prev,
      [section]: !prev[section]
    }));
  }, []);

  const selectedCycles = useMemo(
    () => cycles.filter((cycle) => cycle.selected),
    [cycles]
  );

  return {
    cycles,
    updateCycles,
    setCycles,
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
  };
};
