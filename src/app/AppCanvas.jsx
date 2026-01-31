export const AppCanvas = ({ canvasRef, canvasWrapRef }) => (
  <>
    <div id="boot-screen" className="overlay">
      <h1>ATELIER AQUARELLE</h1>
      <p className="boot-subtitle">RITUEL DE COULEURS</p>
      <button id="init-btn">Activer le Micro</button>
    </div>

    <div className="canvas-area" ref={canvasWrapRef}>
      <canvas id="paper-layer" ref={canvasRef}></canvas>
      <div className="paper-texture"></div>
      <div id="ui-layer" className="ui-layer">
        <div className="shodo-indicator" aria-hidden="true"></div>
        <div id="brush-indicator" className="brush-indicator" aria-hidden="true"></div>
        <div className="top-ui">
          <div id="status-msg">
            <div id="rec-dot"></div>
            <span id="status-text">Prêt à écouter</span>
          </div>
          <div id="audio-meter" className="audio-meter">
            <div id="spectrum-viz">
              <div id="spec-low" className="spec-bar"></div>
              <div id="spec-mid" className="spec-bar"></div>
              <div id="spec-high" className="spec-bar"></div>
            </div>
          </div>
        </div>

        <div className="action-area">
          <div className="action-controls">
            <button id="reset-btn" className="chip-btn" type="button">Reset</button>
          </div>
          <div className="control-block slider-block">
            <label htmlFor="audio-thickness" className="control-label">Épaisseur audio</label>
            <div className="size-row">
              <input id="audio-thickness" type="range" min="0" max="2" step="0.1" defaultValue="1" />
              <span id="audio-thickness-value" className="size-value">1.0</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  </>
);
