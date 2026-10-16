(() => {
  const fixedEpoch = Number(window.__BHP_FIXED_EPOCH__) || null;
  const fixedStart = performance.now();
  const now = () => new Date(fixedEpoch == null ? Date.now() : fixedEpoch + (performance.now() - fixedStart));
  const pad = (n) => String(n).padStart(2, "0");
  const time = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const secondsToday = (date) => date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
  const hash = (text) => [...text].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 2166136261);

  function operatingWindow(date) {
    const hour = date.getHours();
    if (hour < 6) return { shift: "22:00–06:00", startHour: 0, cutoffHour: 6 };
    if (hour < 14) return { shift: "06:00–14:00", startHour: 6, cutoffHour: hour < 12 ? 12 : 14 };
    if (hour < 22) return { shift: "14:00–22:00", startHour: 14, cutoffHour: 21 };
    return { shift: "22:00–06:00", startHour: 22, cutoffHour: 30 };
  }

  function refresh() {
    const date = now();
    const dayKey = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const tick = Math.floor(secondsToday(date) / 7);
    const seed = hash(`${dayKey}:${tick}`);
    const synced = new Date(date.getTime() - (seed % 19) * 1000);
    const windowState = operatingWindow(date);

    document.querySelectorAll("[data-active-shift]").forEach((node) => { node.textContent = windowState.shift; });
    document.querySelectorAll("[data-next-cutoff]").forEach((node) => {
      node.textContent = `DHL Parcel · Dock 02 · ${pad(windowState.cutoffHour % 24)}:00`;
    });
    document.querySelectorAll("[data-service-cutoff]").forEach((node) => {
      const minutes = Number(node.dataset.serviceCutoff || 0);
      const totalMinutes = (windowState.cutoffHour % 24) * 60 + minutes;
      node.textContent = `${pad(Math.floor(totalMinutes / 60) % 24)}:${pad(totalMinutes % 60)}`;
    });
    document.querySelectorAll("[data-eta-minutes]").forEach((node) => {
      const eta = new Date(date.getTime() + Number(node.dataset.etaMinutes || 0) * 60000);
      node.textContent = time(eta);
    });

    document.querySelectorAll("[data-clock]").forEach((node) => { node.textContent = time(date); });
    document.querySelectorAll("[data-synced]").forEach((node) => { node.textContent = `${time(synced)}:${pad(synced.getSeconds())}`; });
    document.querySelectorAll("[data-countdown]").forEach((node) => {
      const target = new Date(date);
      const targetHour = node.hasAttribute("data-adaptive-cutoff") ? windowState.cutoffHour : Number(node.dataset.hour || 12);
      target.setHours(targetHour, Number(node.dataset.minute || 0), 0, 0);
      if (target <= date) target.setDate(target.getDate() + 1);
      const delta = Math.floor((target - date) / 1000);
      node.textContent = `${pad(Math.floor(delta / 3600))}:${pad(Math.floor((delta % 3600) / 60))}:${pad(delta % 60)}`;
    });
    document.querySelectorAll("[data-live-value]").forEach((node) => {
      const base = Number(node.dataset.base || 0);
      const every = Math.max(1, Number(node.dataset.every || 60));
      const shiftSeconds = Math.max(0, secondsToday(date) - windowState.startHour * 3600);
      node.textContent = (base + Math.floor(shiftSeconds / every)).toLocaleString("nl-NL");
    });
    document.querySelectorAll("[data-event-time]").forEach((node, index) => {
      const eventDate = new Date(date.getTime() - (index * 43 + seed % 17) * 1000);
      node.textContent = time(eventDate);
    });

    const pulse = document.querySelector("[data-pulse]");
    if (pulse) pulse.dataset.pulse = String(seed % 5);
  }

  refresh();
  window.setInterval(() => { if (!document.hidden) refresh(); }, 1000);
})();
