import { useCallback, useState } from "react";

export const useAppState = () => {
  const [menuSections, setMenuSections] = useState({
    brushes: true,
    inks: false,
    size: false,
    opacity: false
  });

  const toggleMenuSection = useCallback((section) => {
    setMenuSections((prev) => ({
      ...prev,
      [section]: !prev[section]
    }));
  }, []);

  return {
    menuSections,
    toggleMenuSection
  };
};
