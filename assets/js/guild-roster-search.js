document.addEventListener("DOMContentLoaded", function () {
  var input = document.getElementById("roster-search-input");
  var clearButton = document.getElementById("roster-search-clear");
  var meta = document.getElementById("roster-search-meta");
  var emptyState = document.getElementById("roster-empty");
  var rosterLayout = document.getElementById("roster-layout");

  if (!input || !meta || !emptyState || !rosterLayout) return;

  var memberCards = Array.prototype.slice.call(rosterLayout.querySelectorAll('.member-card'));
  var roleColumns = Array.prototype.slice.call(rosterLayout.querySelectorAll('.role-column'));
  var totalMembers = memberCards.length;

  function normalize(value) {
    return (value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function getNameText(node) {
    if (!node) return '';
    var text = '';

    for (var i = 0; i < node.childNodes.length; i += 1) {
      var child = node.childNodes[i];
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent || '';
      }
    }

    return text || node.textContent || '';
  }

  function updateMeta(visibleCount, query) {
    meta.textContent = query
      ? 'Знайдено: ' + visibleCount + ' з ' + totalMembers
      : 'Показано всіх: ' + totalMembers;
  }

  function applyFilter() {
    var query = normalize(input.value);
    var visibleCount = 0;

    memberCards.forEach(function (card) {
      var nameNode = card.querySelector('.char-name');
      var realmNode = card.querySelector('.char-realm');
      var name = normalize(getNameText(nameNode));
      var realm = normalize(realmNode ? realmNode.textContent : '');
      var matches = !query || name.indexOf(query) !== -1 || realm.indexOf(query) !== -1;

      card.classList.toggle('is-hidden', !matches);
      if (matches) visibleCount += 1;
    });

    roleColumns.forEach(function (column) {
      var hasVisibleMembers = column.querySelector('.member-card:not(.is-hidden)');
      column.classList.toggle('is-hidden', !hasVisibleMembers);
    });

    emptyState.hidden = visibleCount > 0;
    if (clearButton) clearButton.hidden = !query;
    updateMeta(visibleCount, query);
  }

  input.addEventListener('input', applyFilter);

  if (clearButton) {
    clearButton.addEventListener('click', function () {
      input.value = '';
      input.focus();
      applyFilter();
    });
  }

  applyFilter();
});
