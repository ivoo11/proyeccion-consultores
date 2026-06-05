(function () {
  let isRendering = false;

  function getTitle(select) {
    const group = select.closest(".filter-group");
    return group?.querySelector(".filter-title")?.textContent?.trim() || "Filtro";
  }

  function shouldShowOption(option) {
    return option.textContent.trim().toLowerCase() !== "seleccionar";
  }

  function getSignature(select) {
    return Array.from(select.options)
      .map(opt => `${opt.value}:${opt.textContent}`)
      .join("|") + `__${select.value}`;
  }

  function renderSelect(select) {
    if (!select || select.dataset.pcRendering === "true") return;

    const signature = getSignature(select);
    if (select.dataset.pcSignature === signature) return;

    select.dataset.pcSignature = signature;
    select.dataset.pcEnhanced = "true";
    select.dataset.pcRendering = "true";

    let wrapper = select.nextElementSibling;

    if (!wrapper || !wrapper.classList.contains("pc-filter")) {
      wrapper = document.createElement("div");
      wrapper.className = "pc-filter pc-filter-pills";

      const title = document.createElement("div");
      title.className = "pc-filter-section-title";
      title.textContent = getTitle(select);

      const options = document.createElement("div");
      options.className = "pc-filter-options";

      wrapper.appendChild(title);
      wrapper.appendChild(options);

      select.insertAdjacentElement("afterend", wrapper);
    }

    const optionsBox = wrapper.querySelector(".pc-filter-options");
    optionsBox.innerHTML = "";

    Array.from(select.options)
      .filter(shouldShowOption)
      .forEach(option => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pc-filter-pill";
        btn.textContent = option.textContent;
        btn.dataset.value = option.value;

        if (String(option.value) === String(select.value)) {
          btn.classList.add("active");
        }

        btn.addEventListener("click", () => {
          select.value = option.value;

          select.dispatchEvent(new Event("change", {
            bubbles: true
          }));

          select.dataset.pcSignature = "";
          syncFilters();
        });

        optionsBox.appendChild(btn);
      });

    select.dataset.pcRendering = "false";
  }

  function syncFilters() {
    if (isRendering) return;

    isRendering = true;

    document.querySelectorAll(".filters select").forEach(renderSelect);

    isRendering = false;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const filters = document.querySelector(".filters");
    if (!filters) return;

    syncFilters();

    const observer = new MutationObserver(() => {
      setTimeout(syncFilters, 0);
    });

    observer.observe(filters, {
      childList: true,
      subtree: true
    });

    filters.addEventListener("change", () => {
      setTimeout(syncFilters, 0);
    });

    setTimeout(syncFilters, 300);
    setTimeout(syncFilters, 800);
    setTimeout(syncFilters, 1500);
  });
})();