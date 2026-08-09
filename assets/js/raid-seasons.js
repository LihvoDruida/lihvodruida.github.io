/**
 * Перемикач сезонів у блоці рейдового прогресу.
 * Якщо сезон із даними лише один, перемикача в розмітці немає — скрипт тихо виходить.
 */
document.addEventListener("DOMContentLoaded", function () {
  var root = document.getElementById("raid-seasons");
  if (!root) return;

  var tabs = Array.prototype.slice.call(root.querySelectorAll("[data-season-tab]"));
  var panels = Array.prototype.slice.call(root.querySelectorAll("[data-season-panel]"));
  if (tabs.length < 2) return;

  function activate(id, focusTab) {
    tabs.forEach(function (tab) {
      var isActive = tab.getAttribute("data-season-tab") === id;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.setAttribute("tabindex", isActive ? "0" : "-1");
      if (isActive && focusTab) tab.focus();
    });

    panels.forEach(function (panel) {
      var isActive = panel.getAttribute("data-season-panel") === id;
      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
    });
  }

  tabs.forEach(function (tab, index) {
    tab.addEventListener("click", function () {
      activate(tab.getAttribute("data-season-tab"), false);
    });

    tab.addEventListener("keydown", function (event) {
      var keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
      if (keys.indexOf(event.key) === -1) return;
      event.preventDefault();

      var next = index;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;

      activate(tabs[next].getAttribute("data-season-tab"), true);
    });
  });

  var initial = tabs[0];
  tabs.some(function (tab) {
    if (tab.classList.contains("is-active")) {
      initial = tab;
      return true;
    }
    return false;
  });

  activate(initial.getAttribute("data-season-tab"), false);
});
