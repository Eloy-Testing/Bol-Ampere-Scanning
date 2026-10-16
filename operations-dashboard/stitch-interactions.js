(() => {
  "use strict";

  const decisionsTab = document.getElementById("decisionsTab");
  const movementsTab = document.getElementById("movementsTab");
  const decisionsPanel = document.getElementById("decisionsPanel");
  const movementsPanel = document.getElementById("movementsPanel");
  const globalSearch = document.getElementById("globalSearch");
  const searchEmpty = document.getElementById("searchEmpty");
  const assistiveStatus = document.getElementById("assistiveStatus");
  const alertButton = document.getElementById("alertButton");
  const helpButton = document.getElementById("helpButton");
  const helpDialog = document.getElementById("helpDialog");
  const helpClose = document.getElementById("helpClose");
  const terminalTabs = [...document.querySelectorAll("[data-terminal-target]")];
  const recordSelectors = [".exception-record", "#movementRows tr", ".shipment", ".return-row", ".client-row"];

  function activateLedger(name, moveFocus = false) {
    const showDecisions = name === "decisions";
    decisionsTab.setAttribute("aria-selected", String(showDecisions));
    movementsTab.setAttribute("aria-selected", String(!showDecisions));
    decisionsTab.tabIndex = showDecisions ? 0 : -1;
    movementsTab.tabIndex = showDecisions ? -1 : 0;
    decisionsPanel.hidden = !showDecisions;
    movementsPanel.hidden = showDecisions;
    if (moveFocus) (showDecisions ? decisionsTab : movementsTab).focus();
  }

  decisionsTab.addEventListener("click", () => activateLedger("decisions"));
  movementsTab.addEventListener("click", () => activateLedger("movements"));
  [decisionsTab, movementsTab].forEach((tab) => {
    tab.addEventListener("keydown", (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      activateLedger(tab === decisionsTab ? "movements" : "decisions", true);
    });
  });

  function normalize(value) {
    return value.toLocaleLowerCase("nl-NL").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  }

  function applySearch() {
    const query = normalize(globalSearch.value);
    let totalMatches = 0;
    let decisionMatches = 0;
    let movementMatches = 0;

    recordSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((record) => {
        const matches = !query || normalize(record.textContent || "").includes(query);
        record.hidden = !matches;
        if (matches) totalMatches += 1;
        if (matches && record.matches(".exception-record")) decisionMatches += 1;
        if (matches && record.matches("#movementRows tr")) movementMatches += 1;
      });
    });

    if (query && decisionMatches === 0 && movementMatches > 0) activateLedger("movements");
    if (query && movementMatches === 0 && decisionMatches > 0) activateLedger("decisions");
    searchEmpty.hidden = !query || totalMatches > 0;
    assistiveStatus.textContent = !query
      ? "Zoekfilter gewist."
      : totalMatches > 0
        ? `${totalMatches} operationele records gevonden.`
        : "Geen operationele records gevonden. Wis de zoekterm om de volledige stroom te tonen.";
  }

  globalSearch.addEventListener("input", applySearch);

  const observer = new MutationObserver(() => {
    if (globalSearch.value) queueMicrotask(applySearch);
  });
  ["exceptionList", "movementRows", "shipmentList", "returnList", "clientList"].forEach((id) => {
    const target = document.getElementById(id);
    if (target) observer.observe(target, { childList: true });
  });

  alertButton.addEventListener("click", () => {
    activateLedger("decisions");
    document.getElementById("operationsLedger").scrollIntoView({ behavior: "smooth", block: "start" });
    assistiveStatus.textContent = "Actieve beslissingen geopend.";
  });

  helpButton.addEventListener("click", () => helpDialog.showModal());
  helpClose.addEventListener("click", () => helpDialog.close());
  helpDialog.addEventListener("click", (event) => {
    if (event.target === helpDialog) helpDialog.close();
  });

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      document.querySelectorAll(".nav-link").forEach((candidate) => candidate.removeAttribute("aria-current"));
      link.setAttribute("aria-current", "page");
    });
  });

  terminalTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      terminalTabs.forEach((candidate) => candidate.classList.toggle("is-active", candidate === tab));
      document.getElementById(tab.dataset.terminalTarget)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  activateLedger("decisions");
})();
