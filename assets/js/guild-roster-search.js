/**
 * Склад гільдії: пошук по таблиці + поступове розкриття списку.
 * Порядок рядків задає Jekyll (сортування за Raider.IO M+), JS його не змінює —
 * тому номер позиції завжди відповідає реальному місцю в рейтингу.
 */
document.addEventListener("DOMContentLoaded", function () {
  var CHUNK = 50;

  var input = document.getElementById("roster-search-input");
  var clearButton = document.getElementById("roster-search-clear");
  var meta = document.getElementById("roster-search-meta");
  var emptyState = document.getElementById("roster-empty");
  var body = document.getElementById("roster-body");
  var moreWrap = document.getElementById("roster-more");
  var moreButton = document.getElementById("roster-more-button");
  var moreNote = document.getElementById("roster-more-note");

  if (!input || !body || !meta || !emptyState) return;

  var rows = Array.prototype.slice.call(body.querySelectorAll(".roster-row"));
  var total = rows.length;
  var limit = CHUNK;

  function normalize(value) {
    return (value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function render() {
    var query = normalize(input.value);
    var matched = [];

    rows.forEach(function (row) {
      var haystack = normalize(row.getAttribute("data-search"));
      var isMatch = !query || haystack.indexOf(query) !== -1;
      row.classList.toggle("is-hidden", !isMatch);
      if (isMatch) matched.push(row);
    });

    // Під час пошуку показуємо всі збіги, без обмеження.
    var visibleLimit = query ? matched.length : Math.min(limit, matched.length);

    matched.forEach(function (row, index) {
      row.classList.toggle("is-clipped", index >= visibleLimit);
    });

    emptyState.hidden = matched.length > 0;

    if (clearButton) clearButton.hidden = !query;

    if (query) {
      meta.textContent = "Знайдено: " + matched.length + " з " + total;
    } else {
      meta.textContent = visibleLimit < total
        ? "Показано " + visibleLimit + " з " + total
        : "Показано всіх: " + total;
    }

    if (moreWrap) {
      var hasMore = !query && visibleLimit < matched.length;
      moreWrap.hidden = !hasMore;
      if (hasMore && moreNote) {
        moreNote.textContent = "Ще " + (matched.length - visibleLimit) + " учасників";
      }
    }
  }

  input.addEventListener("input", function () {
    limit = CHUNK;
    render();
  });

  if (clearButton) {
    clearButton.addEventListener("click", function () {
      input.value = "";
      limit = CHUNK;
      input.focus();
      render();
    });
  }

  if (moreButton) {
    moreButton.addEventListener("click", function () {
      limit += CHUNK;
      render();
    });
  }

  render();
});
