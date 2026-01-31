export const AppControls = ({
  menuSections,
  toggleMenuSection,
  setGalleryOpen,
  galleryOpen,
  galleryExpanded,
  setGalleryExpanded,
  galleryExportOpen,
  setGalleryExportOpen,
  cycles,
  selectedCycles,
  playingId,
  onPlayPreview,
  galleryActionsRef,
  videoRefs
}) => (
  <>
    <div className="tools-area">
      <div className="accordion">
        <section className={`accordion-item ${menuSections.brushes ? "open" : ""}`}>
          <button
            className="accordion-trigger"
            type="button"
            onClick={() => toggleMenuSection("brushes")}
          >
            Brosse audioreactive
            <span className="accordion-indicator">{menuSections.brushes ? "−" : "+"}</span>
          </button>
          <div className="accordion-panel">
            <div className="brush-legend">
              <div className="brush-name">Brosse unique : Rituel</div>
              <div className="brush-grammar">
                Énergie → taille • Basses → eau • Médiums → grain • Aigus → filaments • Pics → éclats
              </div>
            </div>
            <div id="brush-effects" className="option-row compact"></div>
          </div>
        </section>

        <section className={`accordion-item ${menuSections.inks ? "open" : ""}`}>
          <button
            className="accordion-trigger"
            type="button"
            onClick={() => toggleMenuSection("inks")}
          >
            Encres
            <span className="accordion-indicator">{menuSections.inks ? "−" : "+"}</span>
          </button>
          <div className="accordion-panel">
            <div id="color-options" className="option-row compact"></div>
          </div>
        </section>

        <section className={`accordion-item ${menuSections.advanced ? "open" : ""}`}>
          <button
            className="accordion-trigger"
            type="button"
            onClick={() => toggleMenuSection("advanced")}
          >
            Réglages avancés
            <span className="accordion-indicator">{menuSections.advanced ? "−" : "+"}</span>
          </button>
          <div className="accordion-panel">
            <div className="minimal-controls">
              <div className="control-block slider-block">
                <div className="control-label">Cycles</div>
                <label className="size-row toggle-row">
                  <input id="layering-toggle" type="checkbox" defaultChecked />
                  <span id="layering-value" className="size-value">Superposer</span>
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className={`accordion-item ${menuSections.gallery ? "open" : ""}`}>
          <button
            className="accordion-trigger"
            type="button"
            onClick={() => toggleMenuSection("gallery")}
          >
            Galerie
            <span className="accordion-indicator">{menuSections.gallery ? "−" : "+"}</span>
          </button>
          <div className="accordion-panel">
            <button
              className="chip-btn gallery-launch"
              type="button"
              onClick={() => {
                setGalleryOpen((prev) => {
                  const next = !prev;
                  if (next) setGalleryExpanded(false);
                  return next;
                });
              }}
            >
              Galerie éphémère
            </button>
          </div>
        </section>
      </div>
    </div>

    {galleryOpen ? (
      <button
        className="gallery-backdrop"
        type="button"
        aria-label="Fermer la galerie"
        onClick={() => setGalleryOpen(false)}
      />
    ) : null}
    <div
      className={`gallery-drawer ${galleryOpen ? "open" : ""} ${galleryExpanded ? "expanded" : ""}`}
      role="dialog"
      aria-modal="true"
    >
      <div className="gallery-drawer-header">
        <button
          className="gallery-drawer-handle"
          type="button"
          onClick={() => setGalleryExpanded((prev) => !prev)}
          aria-label={galleryExpanded ? "Réduire la galerie" : "Agrandir la galerie"}
        >
          <span className="handle-pill"></span>
        </button>
        <div className="gallery-drawer-title">Galerie éphémère</div>
        <div className="gallery-drawer-actions">
          <button
            className="chip-btn ghost"
            type="button"
            onClick={() => setGalleryExportOpen((prev) => !prev)}
          >
            {galleryExportOpen ? "Masquer exports" : "Afficher exports"}
          </button>
          <button className="chip-btn ghost" type="button" onClick={() => setGalleryOpen(false)}>
            Fermer
          </button>
        </div>
      </div>
      <div className="gallery-drawer-body">
        <p className="gallery-hint">
          Préviews AV générées après chaque cycle. Sélectionnez pour exporter (max 5 cycles).
        </p>
        <div className="gallery-grid">
          {cycles.length === 0 ? (
            <div className="gallery-empty">Aucun cycle enregistré pour l’instant.</div>
          ) : (
            cycles.map((cycle) => (
              <div key={cycle.id} className="gallery-card">
                {playingId === cycle.id ? (
                  <video
                    ref={(el) => {
                      if (el) videoRefs.current[cycle.id] = el;
                    }}
                    src={cycle.preview.avURL}
                    className="gallery-media"
                    controls
                    playsInline
                  />
                ) : (
                  <img className="gallery-media" src={cycle.preview.imageURL} alt={`Cycle ${cycle.id}`} />
                )}
                <div className="gallery-actions-row">
                  <button className="chip-btn" type="button" onClick={() => onPlayPreview(cycle.id)}>
                    ▶︎ Lire cycle AV
                  </button>
                  <label className="gallery-select">
                    <input
                      type="checkbox"
                      checked={cycle.selected}
                      onChange={(event) => galleryActionsRef.current.updateCycleSelection?.(cycle.id, event.target.checked)}
                    />
                    Sélectionner
                  </label>
                </div>
                <div className="gallery-actions-row">
                  <button className="chip-btn" type="button" onClick={() => galleryActionsRef.current.exportImageHD?.(cycle)}>
                    Image HD
                  </button>
                  <button className="chip-btn" type="button" onClick={() => galleryActionsRef.current.exportCycleAV?.(cycle)}>
                    AV HD
                  </button>
                  <button className="chip-btn" type="button" onClick={() => galleryActionsRef.current.deleteCycle?.(cycle.id)}>
                    Supprimer
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="gallery-actions">
          <button
            className="chip-btn"
            type="button"
            onClick={() => galleryActionsRef.current.clearGallery?.()}
          >
            Vider galerie
          </button>
        </div>
        {galleryExportOpen ? (
          <div className="gallery-export">
            <div className="gallery-export-row">
              <button
                className="chip-btn"
                type="button"
                disabled={!selectedCycles.length}
                onClick={() => selectedCycles.forEach((cycle) => galleryActionsRef.current.exportImageHD?.(cycle))}
              >
                Images HD sélectionnées
              </button>
              <button
                className="chip-btn"
                type="button"
                disabled={!selectedCycles.length}
                onClick={() => galleryActionsRef.current.exportGlobalImage?.(selectedCycles)}
              >
                Image globale
              </button>
            </div>
            <div className="gallery-export-row">
              <button
                className="chip-btn"
                type="button"
                disabled={!selectedCycles.length}
                onClick={() => selectedCycles.forEach((cycle) => galleryActionsRef.current.exportCycleAV?.(cycle))}
              >
                AV cycles
              </button>
              <button
                className="chip-btn"
                type="button"
                disabled={!selectedCycles.length}
                onClick={() => galleryActionsRef.current.exportGroupedAV?.(selectedCycles)}
              >
                AV groupé
              </button>
            </div>
            <div className="gallery-export-row">
              <button
                className="chip-btn"
                type="button"
                disabled={!selectedCycles.length}
                onClick={() => galleryActionsRef.current.exportStopMotionGIF?.(selectedCycles, false)}
              >
                GIF stop-motion
              </button>
              <button
                className="chip-btn"
                type="button"
                disabled={!selectedCycles.length}
                onClick={() => galleryActionsRef.current.exportStopMotionGIF?.(selectedCycles, true)}
              >
                GIF reverse
              </button>
            </div>
            <div className="gallery-export-row">
              <button
                className="chip-btn"
                type="button"
                disabled={!selectedCycles.length}
                onClick={() => galleryActionsRef.current.exportZipBundle?.(selectedCycles)}
              >
                Export ZIP groupé
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  </>
);
