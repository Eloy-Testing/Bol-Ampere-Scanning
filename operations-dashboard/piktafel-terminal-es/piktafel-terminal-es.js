(function () {
  "use strict";

  const elements = {
    pacePanel: document.getElementById("pacePanel"),
    paceStatus: document.getElementById("paceStatus"),
    remainingContext: document.getElementById("remainingContext"),
    personalContext: document.getElementById("personalContext"),
    forecastContext: document.getElementById("forecastContext"),
    announcement: document.getElementById("viewAnnouncement")
  };

  const paceStates = {
    "Onder streef": "Por debajo del objetivo",
    "Binnen streef": "Dentro del objetivo",
    "Boven maximum": "Por encima del máximo"
  };

  const ariaStates = {
    "onder streef": "por debajo del objetivo",
    "binnen streef": "dentro del objetivo",
    "boven maximum": "por encima del máximo"
  };

  const viewLabels = {
    calm: "Calma",
    numbers: "Cifras",
    dual: "Doble"
  };

  let translating = false;

  function replaceText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function translateGeneratedOutput() {
    if (translating) return;
    translating = true;

    const status = elements.paceStatus?.textContent?.trim();
    if (status && paceStates[status]) replaceText(elements.paceStatus, paceStates[status]);

    const remaining = elements.remainingContext?.textContent?.trim().match(/^van (\d+) binnen · (\d+)% open$/i);
    if (remaining) replaceText(elements.remainingContext, `de ${remaining[1]} recibidos · ${remaining[2]}% pendiente`);

    const personal = elements.personalContext?.textContent?.trim().match(/^verwacht nu (\d+) · (.+)$/i);
    if (personal) replaceText(elements.personalContext, `previsto ahora ${personal[1]} · ${personal[2]}`);

    const forecast = elements.forecastContext?.textContent?.trim().match(/^dagstreef (\d+) · (.+)$/i);
    if (forecast) replaceText(elements.forecastContext, `objetivo diario ${forecast[1]} · ${forecast[2]}`);

    const paceLabel = elements.pacePanel?.getAttribute("aria-label") || "";
    const paceMatch = paceLabel.match(/^Piktijd (\d+) seconden per order, (.+)$/i);
    if (paceMatch) {
      const translatedState = ariaStates[paceMatch[2].toLowerCase()] || paceMatch[2];
      elements.pacePanel.setAttribute(
        "aria-label",
        `Tiempo de picking ${paceMatch[1]} segundos por pedido, ${translatedState}`
      );
    }

    const announcement = elements.announcement?.textContent?.trim() || "";
    const announcementMatch = announcement.match(/^Weergave (Rustig|Cijfers|Twee meters) actief\.$/i);
    if (announcementMatch) {
      const dutchMode = announcementMatch[1].toLowerCase();
      const translated = dutchMode === "rustig" ? "Calma" : dutchMode === "cijfers" ? "Cifras" : "Doble";
      replaceText(elements.announcement, `Vista ${translated} activa.`);
    }

    document.documentElement.dataset.locale = "es-ES";
    translating = false;
  }

  const observer = new MutationObserver(translateGeneratedOutput);
  [elements.paceStatus, elements.remainingContext, elements.personalContext, elements.forecastContext, elements.announcement]
    .filter(Boolean)
    .forEach((node) => observer.observe(node, { childList: true, characterData: true, subtree: true }));

  if (elements.pacePanel) observer.observe(elements.pacePanel, { attributes: true, attributeFilter: ["aria-label"] });

  document.querySelectorAll("[data-view-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const label = viewLabels[button.dataset.viewMode];
      if (label) replaceText(elements.announcement, `Vista ${label} activa.`);
    });
  });

  translateGeneratedOutput();
})();
