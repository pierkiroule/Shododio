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
            Motif du bout de brosse
            <span className="accordion-indicator">{menuSections.brushes ? "−" : "+"}</span>
          </button>
          <div className="accordion-panel">
            <div className="brush-legend">
              <div className="brush-name">Brosse unique : Rituel</div>
              <div className="brush-grammar">
                Choisissez le motif du bout : griffes, auréoles ou classique
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

        <section className="accordion-item open">
          <button className="accordion-trigger" type="button" disabled>
            Source audio
          </button>
          <div className="accordion-panel">
            <div className="audio-import">
              <label className="audio-label" htmlFor="mp3-input">
                Importer un MP3
              </label>
              <input id="mp3-input" type="file" accept="audio/mpeg,audio/mp3" />
              <div className="audio-hint">
                <span id="mp3-name">Aucun fichier chargé.</span>
                <span>Le MP3 remplace le micro pour la brosse.</span>
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
