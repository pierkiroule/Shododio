export const AppCanvas = ({ canvasRef, canvasWrapRef }) => (
  <>
    <div id="boot-screen" className="overlay">
      <h1>LA VOIX DU SHODO</h1>
      <p className="boot-subtitle">RITUEL VOCAL</p>
      <div className="boot-actions">
        <button id="init-btn">Activer le Micro</button>
        <button id="mp3-btn" className="chip-btn ghost" type="button">Importer un MP3</button>
      </div>
    </div>

    <div className="canvas-area" ref={canvasWrapRef}>
      <canvas id="paper-layer" ref={canvasRef}></canvas>
      <div className="paper-texture"></div>
      <div id="ui-layer" className="ui-layer">
        <div className="shodo-indicator" aria-hidden="true"></div>
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
        </div>
      </div>

    </div>
  </>
);
