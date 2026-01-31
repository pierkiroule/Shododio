export const AppControls = ({
  menuSections,
  toggleMenuSection,
  onExportImage
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
            Toucher aquarelle
            <span className="accordion-indicator">{menuSections.brushes ? "−" : "+"}</span>
          </button>
          <div className="accordion-panel">
            <div className="brush-legend">
              <div className="brush-name">Brosse fluide : Lavis</div>
              <div className="brush-grammar">
                Choisissez le motif du bout : filaments, auréoles ou velours
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
            Pigments
            <span className="accordion-indicator">{menuSections.inks ? "−" : "+"}</span>
          </button>
          <div className="accordion-panel">
            <div id="color-options" className="option-row compact"></div>
          </div>
        </section>

        <section className="accordion-item open">
          <button className="accordion-trigger" type="button" disabled>
            Export
          </button>
          <div className="accordion-panel">
            <button className="chip-btn" type="button" onClick={onExportImage}>
              Exporter PNG HD
            </button>
          </div>
        </section>
      </div>
    </div>
  </>
);
