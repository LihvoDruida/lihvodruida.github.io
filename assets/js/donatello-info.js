const proxyUrl = "https://proxy.cors.sh/";
const apiUrl = "https://donatello.to/api/v1/clients";

fetch(proxyUrl + apiUrl, {
  headers: {
    "X-Token": "fd4d0163ace81cf144e74f300ea83b3d",
  },
})
  .then((response) => {
    if (!response.ok) {
      throw new Error("Помилка авторизації");
    }
    return response.json();
  })
  .then((data) => {
    const clients = data.clients;

    // Вибір блоку для вставки донатів
    const donatorList = document.querySelector(".list-group-donater");

    // Виведення п'яти донатів
    for (let i = 0; i < 5; i++) {
      const client = clients[i];

      // Перевірка, чи об'єкт client не є undefined
      if (client) {
        // Створення елементів списку
        const listItem = document.createElement("li");
        listItem.classList.add(
          "list-group-item-donater",
          "d-flex",
          "justify-content-between",
          "px-0"
        );

        const donatorName = document.createElement("span");
        donatorName.innerHTML = `
          <i class="far fa-circle-user me-2" style="color:#AFB3BB"></i>
          ${client.clientName}
        `;

        const donationAmount = document.createElement("span");
        donationAmount.classList.add("font-blue");
        donationAmount.style.color = "#2196f3";
        donationAmount.textContent = `${client.totalAmount}₴`;

        // Додавання елементів до списку
        listItem.appendChild(donatorName);
        listItem.appendChild(donationAmount);
        donatorList.appendChild(listItem);
      }
    }
  })
  .catch((error) => {
    const donatorList = document.querySelector(".list-group-donater");
    const errorItem = document.createElement("p");
    errorItem.classList.add("text-danger", "api-danger");
    errorItem.textContent = `Помилка: ${error.message}`;
    donatorList.appendChild(errorItem);
  });
