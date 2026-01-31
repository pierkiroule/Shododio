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
            Pinceaux
            <span className="accordion-indicator">{menuSections.brushes ? "−" : "+"}</span>
          </button>
          <div className="accordion-panel">
            <div id="brush-options" className="option-row compact"></div>
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
                <div className="control-label">Superposition</div>
                <label className="size-row toggle-row">
                  <input id="layering-toggle" type="checkbox" defaultChecked />
                  <span id="layering-value" className="size-value">Superposer</span>
                </label>
              </div>
            </div>
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
