(function(){
  document.addEventListener("DOMContentLoaded", () => {
    const lab = document.getElementById("laboratorio");
    const toggle = document.getElementById("filtersToggle");
    const filters = document.querySelector(".filters");

    if(!lab || !toggle || !filters) return;

    filters.classList.add("pc-floating-filters");
    document.body.appendChild(filters);

    let backdrop = document.querySelector(".filters-backdrop");

    if(!backdrop){
      backdrop = document.createElement("div");
      backdrop.className = "filters-backdrop";
      document.body.appendChild(backdrop);
    }

    function openFilters(){
      document.body.classList.add("filters-open");
      backdrop.classList.add("is-visible");
      toggle.setAttribute("aria-expanded", "true");
    }

    function closeFilters(){
      document.body.classList.remove("filters-open");
      backdrop.classList.remove("is-visible");
      toggle.setAttribute("aria-expanded", "false");
    }

    toggle.addEventListener("click", e => {
      e.preventDefault();

      document.body.classList.contains("filters-open")
        ? closeFilters()
        : openFilters();
    });

    backdrop.addEventListener("click", closeFilters);

    document.addEventListener("keydown", e => {
      if(e.key === "Escape") closeFilters();
    });

    const actions = filters.querySelector(".filters-actions");

    if(actions && !actions.querySelector(".filters-apply-btn")){
      const applyBtn = document.createElement("button");
      applyBtn.type = "button";
      applyBtn.className = "filters-apply-btn";
      applyBtn.textContent = "Aplicar filtros";
      applyBtn.addEventListener("click", closeFilters);
      actions.appendChild(applyBtn);
    }
  });
})();