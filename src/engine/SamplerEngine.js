import { clamp } from "../utils/math";
import { paperRgb } from "../utils/color";

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const drawSnapshot = (ctx, canvas, snapshot, progress, seed = 0) => {
  ctx.fillStyle = `rgb(${paperRgb.r}, ${paperRgb.g}, ${paperRgb.b})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!snapshot) return;
  const sway = Math.sin(progress * Math.PI * 2 + seed * 6) * 0.015;
  const driftX = Math.cos(progress * Math.PI * 2 + seed * 4) * canvas.width * 0.01;
  const driftY = Math.sin(progress * Math.PI * 2 + seed * 5) * canvas.height * 0.01;
  const scale = 1 + sway;
  const drawWidth = canvas.width * scale;
  const drawHeight = canvas.height * scale;
  const dx = (canvas.width - drawWidth) / 2 + driftX;
  const dy = (canvas.height - drawHeight) / 2 + driftY;
  ctx.drawImage(snapshot, dx, dy, drawWidth, drawHeight);
};

const replayCycle = (canvas, ctx, cycle, { durationMs = 2400, speed = 1.5 } = {}) => new Promise((resolve) => {
  const start = performance.now();
  const run = (now) => {
    const elapsed = (now - start) * speed;
    const progress = clamp(elapsed / durationMs, 0, 1);
    drawSnapshot(ctx, canvas, cycle.snapshot, progress, cycle.seed);
    if (progress < 1) {
      requestAnimationFrame(run);
    } else {
      resolve();
    }
  };
  requestAnimationFrame(run);
});

const createPreviewImage = (previewCanvas, previewCtx, cycle) => new Promise((resolve) => {
  drawSnapshot(previewCtx, previewCanvas, cycle.snapshot, 1, cycle.seed);
  previewCanvas.toBlob((blob) => {
    if (!blob) {
      resolve();
      return;
    }
    cycle.preview.imageURL = URL.createObjectURL(blob);
    resolve();
  }, "image/png", 0.6);
});

const connectAudioForPreview = (audioCtxRef, destination, durationMs, seed) => {
  const audioCtx = audioCtxRef.current;
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  if (!audioCtx) return () => {};
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const wobble = audioCtx.createOscillator();
  const wobbleGain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = 160 + seed * 220;
  wobble.type = "triangle";
  wobble.frequency.value = 0.6 + seed * 2;
  wobbleGain.gain.value = 12;
  wobble.connect(wobbleGain).connect(osc.frequency);
  gain.gain.value = 0;
  osc.connect(gain).connect(destination);
  const now = audioCtx.currentTime;
  const durationSec = durationMs / 1000;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.18, now + 0.12);
  gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);
  osc.start(now);
  wobble.start(now);
  osc.stop(now + durationSec + 0.05);
  wobble.stop(now + durationSec + 0.05);
  return () => {
    osc.disconnect();
    wobble.disconnect();
    gain.disconnect();
  };
};

const recordPreviewAV = async ({ previewCanvas, previewCtx, audioCtxRef, previewFps, cycle }) => {
  const durationMs = clamp(cycle.duration * 1000 * 0.25, 2000, 4000);
  const videoStream = previewCanvas.captureStream(previewFps);
  const audioDestination = audioCtxRef.current.createMediaStreamDestination();
  const stopAudio = connectAudioForPreview(audioCtxRef, audioDestination, durationMs, cycle.seed);
  const mergedStream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...audioDestination.stream.getAudioTracks()
  ]);
  const recorder = new MediaRecorder(mergedStream, { mimeType: "video/webm" });
  const chunks = [];
  return new Promise((resolve) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      stopAudio();
      const blob = new Blob(chunks, { type: "video/webm" });
      cycle.preview.avURL = URL.createObjectURL(blob);
      resolve();
    };
    recorder.start();
    replayCycle(previewCanvas, previewCtx, cycle, { durationMs, speed: 1.5 }).then(() => recorder.stop());
  });
};

const exportImageHD = async ({ exportCanvas, exportCtx, cycle }) => {
  drawSnapshot(exportCtx, exportCanvas, cycle.snapshot, 1, cycle.seed);
  return new Promise((resolve) => {
    exportCanvas.toBlob((blob) => {
      if (!blob) return resolve();
      downloadBlob(blob, `cycle_${cycle.id}.png`);
      resolve();
    }, "image/png");
  });
};

const exportGlobalImage = async ({ exportCanvas, exportCtx, selectedCycles }) => {
  exportCtx.fillStyle = `rgb(${paperRgb.r}, ${paperRgb.g}, ${paperRgb.b})`;
  exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  selectedCycles.forEach((cycle) => {
    exportCtx.drawImage(cycle.snapshot, 0, 0, exportCanvas.width, exportCanvas.height);
  });
  return new Promise((resolve) => {
    exportCanvas.toBlob((blob) => {
      if (!blob) return resolve();
      downloadBlob(blob, "global.png");
      resolve();
    }, "image/png");
  });
};

const recordAV = async ({ exportCanvas, exportCtx, audioCtxRef, cycle, filename, durationMs }) => {
  const videoStream = exportCanvas.captureStream(30);
  const audioDestination = audioCtxRef.current.createMediaStreamDestination();
  const stopAudio = connectAudioForPreview(audioCtxRef, audioDestination, durationMs, cycle.seed);
  const mergedStream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...audioDestination.stream.getAudioTracks()
  ]);
  const recorder = new MediaRecorder(mergedStream, { mimeType: "video/webm" });
  const chunks = [];
  return new Promise((resolve) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      stopAudio();
      const blob = new Blob(chunks, { type: "video/webm" });
      downloadBlob(blob, filename);
      resolve();
    };
    recorder.start();
    replayCycle(exportCanvas, exportCtx, cycle, { durationMs, speed: 1 }).then(() => recorder.stop());
  });
};

const exportCycleAV = async ({ exportCanvas, exportCtx, audioCtxRef, cycle }) => {
  const durationMs = cycle.duration * 1000;
  await recordAV({
    exportCanvas,
    exportCtx,
    audioCtxRef,
    cycle,
    filename: `cycle_${cycle.id}.webm`,
    durationMs
  });
};

const exportGroupedAV = async ({ exportCanvas, exportCtx, audioCtxRef, selectedCycles }) => {
  if (!selectedCycles.length) return;
  const durationMs = selectedCycles.reduce((sum, cycle) => sum + cycle.duration * 1000, 0);
  const videoStream = exportCanvas.captureStream(30);
  const audioDestination = audioCtxRef.current.createMediaStreamDestination();
  const stopAudio = connectAudioForPreview(audioCtxRef, audioDestination, durationMs, selectedCycles[0].seed);
  const mergedStream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...audioDestination.stream.getAudioTracks()
  ]);
  const recorder = new MediaRecorder(mergedStream, { mimeType: "video/webm" });
  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const run = async () => {
    for (const cycle of selectedCycles) {
      await replayCycle(exportCanvas, exportCtx, cycle, { durationMs: cycle.duration * 1000, speed: 1 });
    }
  };
  await new Promise((resolve) => {
    recorder.onstop = () => {
      stopAudio();
      const blob = new Blob(chunks, { type: "video/webm" });
      downloadBlob(blob, "cycles_groupes.webm");
      resolve();
    };
    recorder.start();
    run().then(() => recorder.stop());
  });
};

const createGifPalette = () => {
  const palette = [];
  for (let r = 0; r < 8; r += 1) {
    for (let g = 0; g < 8; g += 1) {
      for (let b = 0; b < 4; b += 1) {
        palette.push(
          Math.round((r / 7) * 255),
          Math.round((g / 7) * 255),
          Math.round((b / 3) * 255)
        );
      }
    }
  }
  return palette;
};

const quantizePixel = (r, g, b) => {
  const ri = Math.round((r / 255) * 7);
  const gi = Math.round((g / 255) * 7);
  const bi = Math.round((b / 255) * 3);
  return (ri << 5) | (gi << 2) | bi;
};

const lzwEncode = (indices, minCodeSize) => {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = endCode + 1;
  const dict = new Map();
  for (let i = 0; i < clearCode; i += 1) dict.set(`${i}`, i);
  const output = [];
  let cur = 0;
  let bits = 0;

  const emit = (code) => {
    cur |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      output.push(cur & 255);
      cur >>= 8;
      bits -= 8;
    }
  };

  emit(clearCode);
  let prefix = `${indices[0]}`;
  for (let i = 1; i < indices.length; i += 1) {
    const k = indices[i];
    const key = `${prefix},${k}`;
    if (dict.has(key)) {
      prefix = key;
    } else {
      emit(dict.get(prefix));
      dict.set(key, nextCode);
      nextCode += 1;
      prefix = `${k}`;
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize += 1;
      if (nextCode >= 4096) {
        emit(clearCode);
        dict.clear();
        for (let c = 0; c < clearCode; c += 1) dict.set(`${c}`, c);
        codeSize = minCodeSize + 1;
        nextCode = endCode + 1;
      }
    }
  }
  emit(dict.get(prefix));
  emit(endCode);
  if (bits > 0) output.push(cur & 255);
  return output;
};

const buildGif = (frames, width, height, delay, reverse) => {
  const bytes = [];
  const push = (...vals) => bytes.push(...vals);
  const write16 = (value) => push(value & 255, (value >> 8) & 255);
  const palette = createGifPalette();

  push(...[71, 73, 70, 56, 57, 97]);
  write16(width);
  write16(height);
  push(0b11110111);
  push(0);
  push(0);
  push(...palette);
  push(0x21, 0xff, 0x0b);
  push(...[78, 69, 84, 83, 67, 65, 80, 69, 50, 46, 48]);
  push(0x03, 0x01, 0x00, 0x00, 0x00);

  const orderedFrames = reverse ? frames.slice().reverse() : frames;
  orderedFrames.forEach((frame) => {
    push(0x21, 0xf9, 0x04, 0x00);
    write16(Math.round(delay / 10));
    push(0x00, 0x00);
    push(0x2c);
    write16(0);
    write16(0);
    write16(width);
    write16(height);
    push(0x00);
    push(0x08);
    const lzwData = lzwEncode(frame, 8);
    for (let i = 0; i < lzwData.length; i += 255) {
      const block = lzwData.slice(i, i + 255);
      push(block.length, ...block);
    }
    push(0x00);
  });
  push(0x3b);
  return new Blob([new Uint8Array(bytes)], { type: "image/gif" });
};

const exportStopMotionGIF = async ({ selectedCycles, reverse }) => {
  if (!selectedCycles.length) return;
  const first = selectedCycles[0];
  const img = await fetch(first.preview.imageURL).then((res) => res.blob()).then((blob) => createImageBitmap(blob));
  const gifCanvas = document.createElement("canvas");
  gifCanvas.width = img.width;
  gifCanvas.height = img.height;
  const gifCtx = gifCanvas.getContext("2d");
  const frames = [];
  const ordered = reverse ? selectedCycles.slice().reverse() : selectedCycles;
  for (const cycle of ordered) {
    const frameBitmap = await fetch(cycle.preview.imageURL).then((res) => res.blob()).then((blob) => createImageBitmap(blob));
    gifCtx.fillStyle = `rgb(${paperRgb.r}, ${paperRgb.g}, ${paperRgb.b})`;
    gifCtx.fillRect(0, 0, gifCanvas.width, gifCanvas.height);
    gifCtx.drawImage(frameBitmap, 0, 0, gifCanvas.width, gifCanvas.height);
    const imageData = gifCtx.getImageData(0, 0, gifCanvas.width, gifCanvas.height);
    const indices = new Uint8Array(imageData.width * imageData.height);
    for (let i = 0, p = 0; i < imageData.data.length; i += 4, p += 1) {
      indices[p] = quantizePixel(imageData.data[i], imageData.data[i + 1], imageData.data[i + 2]);
    }
    frames.push([...indices]);
    frameBitmap.close();
  }
  img.close();
  const gifBlob = buildGif(frames, gifCanvas.width, gifCanvas.height, 120, false);
  downloadBlob(gifBlob, reverse ? "stopmotion_reverse.gif" : "stopmotion.gif");
};

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

const crc32 = (data) => {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = crc32Table[(crc ^ data[i]) & 255] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const buildZip = async (files) => {
  const encoder = new TextEncoder();
  let offset = 0;
  const fileRecords = [];
  const chunks = [];

  for (const file of files) {
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const nameBytes = encoder.encode(file.name);
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    const crc = crc32(data);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    header.set(nameBytes, 30);
    chunks.push(header, data);
    fileRecords.push({
      nameBytes,
      crc,
      size: data.length,
      offset
    });
    offset += header.length + data.length;
  }

  const centralChunks = [];
  let centralSize = 0;
  fileRecords.forEach((record) => {
    const header = new Uint8Array(46 + record.nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint16(14, 0, true);
    view.setUint32(16, record.crc, true);
    view.setUint32(20, record.size, true);
    view.setUint32(24, record.size, true);
    view.setUint16(28, record.nameBytes.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, record.offset, true);
    header.set(record.nameBytes, 46);
    centralChunks.push(header);
    centralSize += header.length;
  });

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, fileRecords.length, true);
  endView.setUint16(10, fileRecords.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...chunks, ...centralChunks, end], { type: "application/zip" });
};

const exportZipBundle = async ({ exportCanvas, exportCtx, audioCtxRef, selectedCycles }) => {
  if (!selectedCycles.length) return;
  const files = [];
  for (const cycle of selectedCycles) {
    drawSnapshot(exportCtx, exportCanvas, cycle.snapshot, 1, cycle.seed);
    const imageBlob = await new Promise((resolve) => exportCanvas.toBlob(resolve, "image/png"));
    if (imageBlob) {
      files.push({ name: `cycle_${cycle.id}/image.png`, blob: imageBlob });
    }
    const durationMs = cycle.duration * 1000;
    const videoStream = exportCanvas.captureStream(30);
    const audioDestination = audioCtxRef.current.createMediaStreamDestination();
    const stopAudio = connectAudioForPreview(audioCtxRef, audioDestination, durationMs, cycle.seed);
    const mergedStream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...audioDestination.stream.getAudioTracks()
    ]);
    const recorder = new MediaRecorder(mergedStream, { mimeType: "video/webm" });
    const chunks = [];
    await new Promise((resolve) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        stopAudio();
        resolve();
      };
      recorder.start();
      replayCycle(exportCanvas, exportCtx, cycle, { durationMs, speed: 1 }).then(() => recorder.stop());
    });
    const videoBlob = new Blob(chunks, { type: "video/webm" });
    files.push({ name: `cycle_${cycle.id}/av.webm`, blob: videoBlob });
  }
  const globalBlob = await new Promise((resolve) => {
    exportCtx.fillStyle = `rgb(${paperRgb.r}, ${paperRgb.g}, ${paperRgb.b})`;
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    selectedCycles.forEach((cycle) => {
      exportCtx.drawImage(cycle.snapshot, 0, 0, exportCanvas.width, exportCanvas.height);
    });
    exportCanvas.toBlob(resolve, "image/png");
  });
  if (globalBlob) files.push({ name: "global.png", blob: globalBlob });
  const gifBlob = await (async () => {
    if (!selectedCycles.length) return null;
    const first = selectedCycles[0];
    const img = await fetch(first.preview.imageURL).then((res) => res.blob()).then((blob) => createImageBitmap(blob));
    const gifCanvas = document.createElement("canvas");
    gifCanvas.width = img.width;
    gifCanvas.height = img.height;
    const gifCtx = gifCanvas.getContext("2d");
    const frames = [];
    for (const cycle of selectedCycles) {
      const frameBitmap = await fetch(cycle.preview.imageURL).then((res) => res.blob()).then((blob) => createImageBitmap(blob));
      gifCtx.fillStyle = `rgb(${paperRgb.r}, ${paperRgb.g}, ${paperRgb.b})`;
      gifCtx.fillRect(0, 0, gifCanvas.width, gifCanvas.height);
      gifCtx.drawImage(frameBitmap, 0, 0, gifCanvas.width, gifCanvas.height);
      const imageData = gifCtx.getImageData(0, 0, gifCanvas.width, gifCanvas.height);
      const indices = new Uint8Array(imageData.width * imageData.height);
      for (let i = 0, p = 0; i < imageData.data.length; i += 4, p += 1) {
        indices[p] = quantizePixel(imageData.data[i], imageData.data[i + 1], imageData.data[i + 2]);
      }
      frames.push([...indices]);
      frameBitmap.close();
    }
    img.close();
    return buildGif(frames, gifCanvas.width, gifCanvas.height, 120, false);
  })();
  if (gifBlob) files.push({ name: "stopmotion.gif", blob: gifBlob });
  const zipBlob = await buildZip(files);
  downloadBlob(zipBlob, "export_cycles.zip");
};

export const createSamplerEngine = ({ previewCanvas, previewCtx, exportCanvas, exportCtx, audioCtxRef, previewFps }) => ({
  cleanupCycleAssets: (cycle) => {
    if (!cycle) return;
    if (cycle.preview.avURL) URL.revokeObjectURL(cycle.preview.avURL);
    if (cycle.preview.imageURL) URL.revokeObjectURL(cycle.preview.imageURL);
    if (cycle.snapshot?.close) cycle.snapshot.close();
  },
  createPreviewImage: (cycle) => createPreviewImage(previewCanvas, previewCtx, cycle),
  recordPreviewAV: (cycle) => recordPreviewAV({ previewCanvas, previewCtx, audioCtxRef, previewFps, cycle }),
  exportImageHD: (cycle) => exportImageHD({ exportCanvas, exportCtx, cycle }),
  exportGlobalImage: (selectedCycles) => exportGlobalImage({ exportCanvas, exportCtx, selectedCycles }),
  exportCycleAV: (cycle) => exportCycleAV({ exportCanvas, exportCtx, audioCtxRef, cycle }),
  exportGroupedAV: (selectedCycles) => exportGroupedAV({ exportCanvas, exportCtx, audioCtxRef, selectedCycles }),
  exportStopMotionGIF: (selectedCycles, reverse) => exportStopMotionGIF({ selectedCycles, reverse }),
  exportZipBundle: (selectedCycles) => exportZipBundle({ exportCanvas, exportCtx, audioCtxRef, selectedCycles })
});

export const replayCycleFrame = drawSnapshot;
export { replayCycle };
