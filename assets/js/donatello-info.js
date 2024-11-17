const apiUrl = "https://donatello.to/api/v1/clients";
const token = "fd4d0163ace81cf144e74f300ea83b3d";

async function fetchDonators() {
  try {
    const response = await fetch(apiUrl, {
      headers: {
        "X-Token": token,
      },
    });

    // Перевірка на помилку авторизації
    if (!response.ok) {
      throw new Error("Помилка авторизації");
    }

    const data = await response.json();
    const clients = data.clients;

    // Вибір блоку для вставки донатів
    const donatorList = document.querySelector(".list-group-donater");

    // Перевірка, чи є елемент списку
    if (!donatorList) {
      throw new Error("Елемент списку донаторів не знайдено.");
    }

    // Виведення п'яти донатів
    for (let i = 0; i < 5 && i < clients.length; i++) {
      const client = clients[i];

      // Перевірка на існування даних клієнта
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
  } catch (error) {
    const donatorList = document.querySelector(".list-group-donater");
    if (donatorList) {
      const errorItem = document.createElement("p");
      errorItem.classList.add("text-danger", "api-danger");
      errorItem.textContent = `Помилка: ${error.message}`;
      donatorList.appendChild(errorItem);
    }
  }
}

fetchDonators();
