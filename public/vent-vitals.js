(function () {
  'use strict';

  // Kurvenmonitor für die Vitalparameter (EKG, Arterie, Pleth, Kapnografie) und
  // eine Kurvenvorschau beim Überfahren der Zahlen im Monitorstreifen.

  const live = window.GalenVentLive;
  const V = window.GALEN_VITAL_WAVES;
  const W = window.GALEN_VENT_WAVEFORMS;
  if (!live || !V || !W) return;

  const $ = id => document.getElementById(id);
  const panel = document.querySelector('[data-window="vitals"]');
  const mainCanvas = $('vitalsCanvas');
  const VALUE_WIDTH = 118;
  const number = (value, decimals = 0) => Number(value).toFixed(decimals).replace('.', ',');

  // Feste Skalen, die nur bei länger anhaltend anderen Werten wechseln.
  const scales = { art: V.createScale([150, 200, 250]), co2: V.createScale([50, 75, 100, 150]) };
  function updateScales(snapshot) {
    if (scales.lastElapsed !== undefined && snapshot.elapsed < scales.lastElapsed) {
      scales.art = V.createScale([150, 200, 250]);
      scales.co2 = V.createScale([50, 75, 100, 150]);
    }
    scales.lastElapsed = snapshot.elapsed;
    V.updateScale(scales.art, snapshot.sys, snapshot.elapsed);
    V.updateScale(scales.co2, snapshot.etco2, snapshot.elapsed);
  }

  const TRACES = {
    ecg: {
      label: 'EKG II', color: '#56f2a9', key: 'ecg', source: 'vitals', range: () => [-0.45, 1.25],
      value: s => s.cardiacArrest || s.hr < 15 ? 'HF —' : `HF ${Math.round(s.hr)}`, unit: '/min'
    },
    art: {
      label: 'ART', color: '#ff4f68', key: 'art', source: 'vitals', scale: true,
      range: () => [0, scales.art.scale],
      value: s => `${Math.round(s.sys)}/${Math.round(s.dia)}`, unit: s => `(${Math.round(s.map)}) mmHg`
    },
    pleth: {
      label: 'Pleth', color: '#4f9dff', key: 'pleth', source: 'vitals', range: () => [0, 1],
      value: s => `SpO₂ ${Math.round(s.spo2)}`, unit: '%'
    },
    co2: {
      label: 'CO₂', color: '#ffc768', key: 'co2', source: 'vent', scale: true,
      range: () => [0, scales.co2.scale],
      value: s => `etCO₂ ${Math.round(s.etco2)}`, unit: 'mmHg'
    }
  };

  let recorder = null;

  function updateRecorder(snapshot) {
    if (!recorder || snapshot.elapsed + 1 < recorder.lastSampleAt) recorder = V.create(snapshot);
    else V.advance(recorder, snapshot.elapsed, snapshot);
  }

  function prepareCanvas(canvas) {
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const box = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(box.width * ratio));
    const height = Math.max(1, Math.round(box.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx, width: box.width, height: box.height };
  }

  // Zeichnet mehrere Kurven untereinander im Stil der Beatmungskurven.
  // Durchlaufende Darstellung mit festem Zeitmaßstab (für die Vorschau): der
  // jüngste Wert steht rechts, ältere Werte laufen nach links heraus.
  function scrollPoints(source, now, curveWidth, pixelsPerSecond) {
    const from = now - curveWidth / pixelsPerSecond;
    let previous = null;
    return (source?.samples || []).filter(sample => sample.time >= from && sample.time <= now).map(sample => {
      const point = { ...sample, x: curveWidth - (now - sample.time) * pixelsPerSecond, breakBefore: previous === null || sample.time - previous > 0.1 };
      previous = sample.time;
      return point;
    });
  }

  // Kurvenbreite des großen Monitors, auch wenn er minimiert ist; daraus folgt
  // der Zeitmaßstab der Vorschau, damit beide Darstellungen gleich aussehen.
  function mainCurveWidth() {
    const column = document.querySelector('.center-column');
    return Math.max(300, (column?.clientWidth || 900) - 22 - VALUE_WIDTH);
  }

  function drawTraces(canvas, traceIds, snapshot, { showValues = true, scroll = false } = {}) {
    const { ctx, width, height } = prepareCanvas(canvas);
    if (width < 10 || height < 10) return;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#010608';
    ctx.fillRect(0, 0, width, height);
    const curveWidth = showValues ? Math.max(60, width - VALUE_WIDTH) : width;
    const rowHeight = height / traceIds.length;
    const ventRecorder = snapshot.ventRecorder;
    const sweeps = scroll ? {
      vitals: { points: scrollPoints(recorder, snapshot.elapsed, curveWidth, mainCurveWidth() / recorder.historySeconds) },
      vent: { points: scrollPoints(ventRecorder, snapshot.elapsed, curveWidth, mainCurveWidth() / (ventRecorder?.historySeconds || 12)) }
    } : {
      vitals: W.sweep(recorder, snapshot.elapsed, curveWidth),
      vent: ventRecorder ? W.sweep(ventRecorder, snapshot.elapsed, curveWidth) : { points: [] }
    };

    traceIds.forEach((id, row) => {
      const trace = TRACES[id];
      const top = row * rowHeight;
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(45, 86, 108, .3)';
      for (let x = 40; x < curveWidth; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + rowHeight); ctx.stroke();
      }
      if (row > 0) {
        ctx.strokeStyle = '#23485b';
        ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(width, top); ctx.stroke();
      }

      const [min, max] = trace.range(snapshot);
      const pad = Math.min(10, rowHeight * 0.12);
      const yFor = value => top + rowHeight - pad - Math.max(0, Math.min(1, (value - min) / (max - min))) * (rowHeight - pad * 2);
      ctx.font = '600 9px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillStyle = trace.color;
      ctx.fillText(trace.label, 6, top + 13);
      if (trace.scale) {
        ctx.fillStyle = '#59788b';
        ctx.fillText(`${min}–${max} mmHg`, 12 + ctx.measureText(trace.label).width, top + 13);
      }

      ctx.beginPath();
      sweeps[trace.source].points.forEach(point => {
        const y = yFor(point[trace.key]);
        if (point.breakBefore) ctx.moveTo(point.x, y);
        else ctx.lineTo(point.x, y);
      });
      ctx.strokeStyle = trace.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = trace.color;
      ctx.shadowBlur = 5;
      ctx.stroke();
      ctx.shadowBlur = 0;

      if (showValues) {
        ctx.fillStyle = 'rgba(12, 20, 30, .9)';
        ctx.fillRect(curveWidth, top, width - curveWidth, rowHeight);
        ctx.fillStyle = trace.color;
        ctx.font = `800 ${Math.max(12, Math.min(22, rowHeight * 0.32))}px ui-monospace, Menlo, Consolas, monospace`;
        ctx.fillText(trace.value(snapshot), curveWidth + 10, top + rowHeight / 2 + 4);
        ctx.font = '600 9px ui-monospace, Menlo, Consolas, monospace';
        ctx.fillStyle = '#8fa5b7';
        const unit = typeof trace.unit === 'function' ? trace.unit(snapshot) : trace.unit;
        ctx.fillText(unit, curveWidth + 10, top + rowHeight / 2 + 18);
      }
    });
  }

  function visibleTraces(snapshot) {
    return ['ecg', ...(snapshot.arterialConnected ? ['art'] : []), 'pleth', 'co2'];
  }

  // --- Vorschau beim Überfahren der Monitorwerte -----------------------------------

  const preview = document.createElement('div');
  preview.className = 'vital-preview';
  preview.setAttribute('aria-hidden', 'true');
  preview.hidden = true;
  const previewCanvas = document.createElement('canvas');
  preview.append(previewCanvas);
  document.body.append(preview);
  let previewTrace = null;
  let previewTile = null;

  function positionPreview() {
    if (!previewTile) return;
    const box = previewTile.getBoundingClientRect();
    const width = Math.max(300, box.width);
    const left = Math.min(Math.max(8, box.left), window.innerWidth - width - 8);
    Object.assign(preview.style, { left: `${left}px`, top: `${box.bottom + 6}px`, width: `${width}px` });
  }

  const TILE_TRACES = { ecg: 'ecg', art: 'art', spo2: 'pleth', co2: 'co2' };
  Object.entries(TILE_TRACES).forEach(([tileClass, traceId]) => {
    const tile = document.querySelector(`.monitor-vital.${tileClass}`);
    if (!tile) return;
    tile.classList.add('has-wave-preview');
    tile.addEventListener('mouseenter', () => {
      if (tile.classList.contains('hidden')) return;
      previewTrace = traceId;
      previewTile = tile;
      preview.hidden = false;
      positionPreview();
    });
    tile.addEventListener('mouseleave', () => {
      previewTrace = null;
      previewTile = null;
      preview.hidden = true;
    });
  });
  window.addEventListener('resize', positionPreview);

  function frame() {
    const snapshot = live.snapshot();
    if (snapshot) {
      updateRecorder(snapshot);
      updateScales(snapshot);
      if (mainCanvas && panel && !panel.classList.contains('window-minimized') && mainCanvas.offsetParent) {
        drawTraces(mainCanvas, visibleTraces(snapshot), snapshot);
      }
      if (previewTrace) {
        if (previewTrace === 'art' && !snapshot.arterialConnected) preview.hidden = true;
        else drawTraces(previewCanvas, [previewTrace], snapshot, { showValues: false, scroll: true });
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
