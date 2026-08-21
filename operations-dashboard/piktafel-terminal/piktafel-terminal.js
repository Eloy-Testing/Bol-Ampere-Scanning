(function () {
  "use strict";

  const TIME_ZONE = "Europe/Amsterdam";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const TICK_SECONDS = 6;
  const formatter = new Intl.DateTimeFormat("nl-NL", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  const elements = {
    clock: document.getElementById("terminalClock"),
    pacePanel: document.getElementById("pacePanel"),
    paceCanvas: document.getElementById("paceGauge"),
    paceValue: document.getElementById("paceValue"),
    paceStatus: document.getElementById("paceStatus"),
    remainingOrders: document.getElementById("remainingOrders"),
    remainingContext: document.getElementById("remainingContext"),
    personalPicked: document.getElementById("personalPicked"),
    personalContext: document.getElementById("personalContext"),
    forecastOrders: document.getElementById("forecastOrders"),
    forecastContext: document.getElementById("forecastContext"),
    floorRate: document.getElementById("floorRate"),
    floorPicked: document.getElementById("floorPicked"),
    floorReceived: document.getElementById("floorReceived"),
    personalRate: document.getElementById("personalRate"),
    cutoffCountdown: document.getElementById("cutoffCountdown"),
    viewAnnouncement: document.getElementById("viewAnnouncement")
  };

  const viewLabels = {
    calm: "Rustig",
    numbers: "Cijfers",
    dual: "Twee meters"
  };

  let currentState = null;
  let currentView = "calm";

  function nowEpoch() {
    const fixed = Number(window.__BHP_FIXED_EPOCH__);
    return Number.isFinite(fixed) ? fixed : Date.now();
  }

  function partsAt(epoch) {
    const parts = {};
    formatter.formatToParts(new Date(epoch)).forEach((part) => {
      if (part.type !== "literal") parts[part.type] = part.value;
    });
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour),
      minute: Number(parts.minute),
      second: Number(parts.second)
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function hashText(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function deterministicUnit(seed) {
    let value = seed >>> 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967295;
  }

  function signed(value) {
    if (value === 0) return "0";
    return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
  }

  function formatClock(partValues) {
    return [partValues.hour, partValues.minute, partValues.second]
      .map((value) => String(value).padStart(2, "0"))
      .join(":");
  }

  function createState(epoch) {
    const local = partsAt(epoch);
    const dayKey = `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`;
    const secondsOfDay = local.hour * 3600 + local.minute * 60 + local.second;
    const sequence = Math.floor(secondsOfDay / TICK_SECONDS);
    const daySeed = hashText(dayKey);
    const tickSeed = hashText(`${dayKey}:${sequence}`);
    const shiftStart = 7.5 * 3600;
    const elapsedHours = clamp((secondsOfDay - shiftStart) / 3600, 0, 14.5);
    const dayVariation = ((local.day % 5) - 1) * 3;
    const received = 619 + dayVariation;
    const floorRate = 90 + Math.round((deterministicUnit(daySeed) - 0.5) * 4);
    const floorPicked = clamp(Math.floor(4 + elapsedHours * floorRate), 0, received);
    const remaining = Math.max(0, received - floorPicked);
    const personalRate = 19 + (deterministicUnit(daySeed + 19) > 0.76 ? 1 : 0);
    const personalPicked = clamp(Math.floor(elapsedHours * personalRate) - 1, 0, floorPicked);
    const expectedNow = Math.max(0, Math.floor(elapsedHours * 20.6));
    const paceNoise = Math.round((deterministicUnit(tickSeed) - 0.5) * 4);
    const pace = clamp(35 + paceNoise, 25, 47);
    const hoursRemaining = clamp(22 - (secondsOfDay / 3600), 0, 14.5);
    const forecast = Math.max(personalPicked, Math.round(personalPicked + hoursRemaining * personalRate * 0.915));
    const dayTarget = 285;
    const cutoffSeconds = Math.max(0, 22 * 3600 - secondsOfDay);
    const cutoffHours = Math.floor(cutoffSeconds / 3600);
    const cutoffMinutes = Math.floor((cutoffSeconds % 3600) / 60);
    const status = pace < 30 ? "Onder streef" : pace <= 40 ? "Binnen streef" : "Boven maximum";

    return {
      epoch,
      dayKey,
      sequence,
      local,
      received,
      floorPicked,
      remaining,
      openPercent: received ? Math.round((remaining / received) * 100) : 0,
      floorRate,
      personalRate,
      personalPicked,
      expectedNow,
      personalDelta: personalPicked - expectedNow,
      forecast,
      dayTarget,
      forecastDelta: forecast - dayTarget,
      pace,
      status,
      cutoff: `${String(cutoffHours).padStart(2, "0")}:${String(cutoffMinutes).padStart(2, "0")}`
    };
  }

  function setText(node, value) {
    if (node && node.textContent !== String(value)) node.textContent = String(value);
  }

  function renderState(state) {
    currentState = state;
    document.documentElement.dataset.operationDay = state.dayKey;
    document.documentElement.dataset.operationSequence = String(state.sequence);
    elements.clock.dateTime = new Date(state.epoch).toISOString();
    setText(elements.clock, formatClock(state.local));
    setText(elements.paceValue, state.pace);
    setText(elements.paceStatus, state.status);
    setText(elements.remainingOrders, state.remaining);
    setText(elements.remainingContext, `van ${state.received} binnen · ${state.openPercent}% open`);
    setText(elements.personalPicked, state.personalPicked);
    setText(elements.personalContext, `verwacht nu ${state.expectedNow} · ${signed(state.personalDelta)}`);
    setText(elements.forecastOrders, state.forecast);
    setText(elements.forecastContext, `dagstreef ${state.dayTarget} · ${signed(state.forecastDelta)}`);
    setText(elements.floorRate, state.floorRate);
    setText(elements.floorPicked, state.floorPicked);
    setText(elements.floorReceived, state.received);
    setText(elements.personalRate, state.personalRate);
    setText(elements.cutoffCountdown, state.cutoff);
    elements.pacePanel.setAttribute(
      "aria-label",
      `Piktijd ${state.pace} seconden per order, ${state.status.toLowerCase()}`
    );
    drawGauge(state.pace, currentView === "dual");
    window.__BHP_TERMINAL_STATE__ = { ...state, view: currentView };
  }

  function drawGauge(pace, showPlan) {
    const canvas = elements.paceCanvas;
    const context = canvas.getContext("2d");
    const logicalWidth = 720;
    const logicalHeight = 560;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);

    if (canvas.width !== logicalWidth * ratio || canvas.height !== logicalHeight * ratio) {
      canvas.width = logicalWidth * ratio;
      canvas.height = logicalHeight * ratio;
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, logicalWidth, logicalHeight);

    const centerX = 360;
    const centerY = 376;
    const radius = 276;
    const start = (150 * Math.PI) / 180;
    const sweep = (240 * Math.PI) / 180;
    const angleFor = (value) => start + (clamp(value, 0, 60) / 60) * sweep;

    function arc(from, to, color) {
      context.beginPath();
      context.arc(centerX, centerY, radius, angleFor(from), angleFor(to));
      context.strokeStyle = color;
      context.lineWidth = 18;
      context.lineCap = "butt";
      context.stroke();
    }

    arc(0, 30, "#45ab80");
    arc(30, 40, "#9a8437");
    arc(40, 60, "#6d4444");

    for (let value = 0; value <= 60; value += 5) {
      const angle = angleFor(value);
      const major = value % 15 === 0;
      const outer = radius - 28;
      const inner = outer - (major ? 30 : 16);
      context.beginPath();
      context.moveTo(centerX + Math.cos(angle) * inner, centerY + Math.sin(angle) * inner);
      context.lineTo(centerX + Math.cos(angle) * outer, centerY + Math.sin(angle) * outer);
      context.strokeStyle = major ? "#778087" : "#384249";
      context.lineWidth = major ? 4 : 2;
      context.stroke();
    }

    context.fillStyle = "#42576a";
    context.font = '700 23px "SFMono-Regular", Menlo, Consolas, monospace';
    context.textAlign = "center";
    context.textBaseline = "middle";
    [0, 15, 30, 45, 60].forEach((value) => {
      const angle = angleFor(value);
      const labelRadius = 195;
      context.fillText(
        String(value),
        centerX + Math.cos(angle) * labelRadius,
        centerY + Math.sin(angle) * labelRadius
      );
    });

    if (showPlan) drawNeedle(context, centerX, centerY, radius, angleFor(30), "#80d1df", 3, 0.75, false);
    drawNeedle(context, centerX, centerY, radius, angleFor(pace), "#f0c841", 7, 0.87, true);

    context.beginPath();
    context.arc(centerX, centerY, 15, 0, Math.PI * 2);
    context.fillStyle = "#060a0d";
    context.fill();
    context.strokeStyle = "#f0c841";
    context.lineWidth = 4;
    context.stroke();
  }

  function drawNeedle(context, centerX, centerY, radius, angle, color, lineWidth, scale, tapered) {
    if (tapered) {
      const perpendicular = angle + Math.PI / 2;
      const tipX = centerX + Math.cos(angle) * radius * scale;
      const tipY = centerY + Math.sin(angle) * radius * scale;
      context.beginPath();
      context.moveTo(
        centerX + Math.cos(perpendicular) * lineWidth,
        centerY + Math.sin(perpendicular) * lineWidth
      );
      context.lineTo(tipX, tipY);
      context.lineTo(
        centerX - Math.cos(perpendicular) * lineWidth,
        centerY - Math.sin(perpendicular) * lineWidth
      );
      context.closePath();
      context.fillStyle = color;
      context.fill();
      return;
    }
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(centerX + Math.cos(angle) * radius * scale, centerY + Math.sin(angle) * radius * scale);
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.lineCap = "round";
    context.stroke();
  }

  function selectView(view, announce) {
    if (!viewLabels[view]) return;
    currentView = view;
    document.body.dataset.view = view;
    document.querySelectorAll("[data-view-mode]").forEach((button) => {
      const selected = button.dataset.viewMode === view;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    if (announce) setText(elements.viewAnnouncement, `Weergave ${viewLabels[view]} actief.`);
    if (currentState) renderState(currentState);
  }

  document.querySelectorAll("[data-view-mode]").forEach((button) => {
    button.addEventListener("click", () => selectView(button.dataset.viewMode, true));
  });

  window.addEventListener("resize", () => {
    if (currentState) drawGauge(currentState.pace, currentView === "dual");
  });

  function tick() {
    renderState(createState(nowEpoch()));
  }

  selectView("calm", false);
  tick();
  window.setInterval(tick, 1000);
})();
