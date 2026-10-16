(() => {
  const fixedEpoch = Number(window.__BHP_FIXED_EPOCH__) || null;
  const fixedStart = performance.now();
  const current = () => new Date(fixedEpoch === null ? Date.now() : fixedEpoch + performance.now() - fixedStart);
  const pad = (value) => String(value).padStart(2, "0");
  const time = (date, seconds = false) => `${pad(date.getHours())}:${pad(date.getMinutes())}${seconds ? `:${pad(date.getSeconds())}` : ""}`;
  const secondsToday = (date) => date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
  const dayKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const hash = (value) => [...value].reduce((total, character) => (total * 33 + character.charCodeAt(0)) >>> 0, 5381);

  function workday(date) {
    const hour = date.getHours();
    if (hour < 6) return { label: "22:00—06:00", start: 0, cutoff: 6 };
    if (hour < 14) return { label: "06:00—14:00", start: 6, cutoff: hour < 12 ? 12 : 14 };
    if (hour < 22) return { label: "14:00—22:00", start: 14, cutoff: 21 };
    return { label: "22:00—06:00", start: 22, cutoff: 30 };
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach((node) => { node.textContent = value; });
  }

  function update() {
    const now = current();
    const shift = workday(now);
    const elapsed = Math.max(0, secondsToday(now) - shift.start * 3600);
    const seed = hash(`${dayKey(now)}:${Math.floor(secondsToday(now) / 11)}`);
    const synced = new Date(now.getTime() - (seed % 23) * 1000);

    setText("[data-clock]", time(now));
    setText("[data-clock-seconds]", time(now, true));
    setText("[data-sync]", time(synced, true));
    setText("[data-shift]", shift.label);
    setText("[data-cutoff-time]", `${pad(shift.cutoff % 24)}:00`);

    document.querySelectorAll("[data-countdown]").forEach((node) => {
      const target = new Date(now);
      const minutes = Number(node.dataset.minute || 0);
      const hours = node.hasAttribute("data-shift-cutoff") ? shift.cutoff : Number(node.dataset.hour || shift.cutoff);
      target.setHours(hours, minutes, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
      const remaining = Math.max(0, Math.floor((target - now) / 1000));
      node.textContent = `${pad(Math.floor(remaining / 3600))}:${pad(Math.floor((remaining % 3600) / 60))}:${pad(remaining % 60)}`;
    });

    document.querySelectorAll("[data-live-value]").forEach((node) => {
      const base = Number(node.dataset.base || 0);
      const every = Math.max(1, Number(node.dataset.every || 60));
      const variance = Number(node.dataset.variance || 0);
      const value = base + Math.floor(elapsed / every) + (variance ? seed % variance : 0);
      node.textContent = value.toLocaleString("nl-NL");
    });

    document.querySelectorAll("[data-event-time]").forEach((node, index) => {
      const age = Number(node.dataset.age || index * 47 + 14) + seed % 13;
      node.textContent = time(new Date(now.getTime() - age * 1000));
    });

    document.querySelectorAll("[data-eta]").forEach((node) => {
      const minutes = Number(node.dataset.eta || 8);
      node.textContent = time(new Date(now.getTime() + minutes * 60000));
    });

    document.querySelectorAll("[data-progress]").forEach((node) => {
      const base = Number(node.dataset.base || 0);
      const range = Number(node.dataset.range || 0);
      const value = Math.min(100, base + (range ? seed % range : 0));
      node.style.setProperty("--progress", `${value}%`);
      if (node.hasAttribute("aria-valuenow")) node.setAttribute("aria-valuenow", String(value));
    });

    document.documentElement.dataset.tick = String(seed % 6);
  }

  update();
  window.setInterval(() => { if (!document.hidden) update(); }, 1000);
})();
