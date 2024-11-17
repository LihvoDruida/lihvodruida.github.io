const apiUrl = "https://donatello.to/api/v1/clients";
const token = "fd4d0163ace81cf144e74f300ea83b3d";

async function fetchDonators() {
  try {
    const response = await fetch(apiUrl, {
      headers: {
        "X-Token": token,
      },
      mode: "no-cors",  // This disables CORS
    });

    // Check for authorization error
    if (!response.ok) {
      throw new Error("Authorization error");
    }

    const data = await response.json();
    const clients = data.clients;

    // Select the block for inserting donors
    const donatorList = document.querySelector(".list-group-donater");

    // Check if the donator list element exists
    if (!donatorList) {
      throw new Error("Donator list element not found.");
    }

    // Display the top 5 donors
    for (let i = 0; i < 5 && i < clients.length; i++) {
      const client = clients[i];

      // Check if client data exists
      if (client) {
        // Create list item
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

        // Append elements to the list
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
      errorItem.textContent = `Error: ${error.message}`;
      donatorList.appendChild(errorItem);
    }
  }
}

// Call the function to fetch and display the donators
fetchDonators();
