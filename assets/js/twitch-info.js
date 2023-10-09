const twitchApiUrl = "https://api.twitch.tv/helix/";
const clientIds = "zlx00o4l2w61o12ogjtug6qbx6wal7";
const secretIds = "2zs4zgsm29geuayp8df0u3dz9890iw";
const channelName = "lihvo_druida"; // Замініть на свій Twitch канал

function encrypt(text, shift) {
  let encryptedText = "";
  for (let i = 0; i < text.length; i++) {
    let charCode = text.charCodeAt(i);
    if (charCode >= 65 && charCode <= 90) {
      encryptedText += String.fromCharCode(((charCode - 65 + shift) % 26) + 65);
    } else if (charCode >= 97 && charCode <= 122) {
      encryptedText += String.fromCharCode(((charCode - 97 + shift) % 26) + 97);
    } else {
      encryptedText += text.charAt(i);
    }
  }
  return encryptedText;
}

function decrypt(text, shift) {
  return encrypt(text, 26 - shift);
}

const clientId = decrypt(clientIds, 5);
const secretId = decrypt(secretIds, 5);

// Функція для отримання інформації про канал
async function getChannelInfo() {
  const loaderTwElement = document.getElementById("loader-tw");
  const twitchInfoElement = document.getElementById("twitch-info");

  if (loaderTwElement && twitchInfoElement) {
    loaderTwElement.style.display = "inline-flex";
    twitchInfoElement.style.display = "none";
  }

  try {
    // Отримання access token
    const tokenResponse = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${secretId}&grant_type=client_credentials`,
      {
        method: "POST"
      }
    );
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Отримання ID каналу
    const channelResponse = await fetch(
      `${twitchApiUrl}users?login=${channelName}`,
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${accessToken}`
        }
      }
    );
    const channelData = await channelResponse.json();
    const channelId = channelData.data[0].id;

    // Отримання кількості фоловерів каналу
    const followersResponse = await fetch(
      `${twitchApiUrl}users/follows?to_id=${channelId}`,
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${accessToken}`
        }
      }
    );
    const followersData = await followersResponse.json();
    const followersCount = followersData.total;

    // Отримання інформації про канал, включаючи URL аватарки
    const channelInfoResponse = await fetch(
      `${twitchApiUrl}users?id=${channelId}`,
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${accessToken}`
        }
      }
    );
    const channelInfoData = await channelInfoResponse.json();
    const channelDisplayName = channelInfoData.data[0].display_name;
    const channelAvatarUrl = channelInfoData.data[0].profile_image_url;
    const channelViews = channelInfoData.data[0].view_count; // Отримання кількості переглядів каналу
    const channelUrl = `https://www.twitch.tv/${channelName}`;

    // Виведення на сторінку
    const channelNameElement = document.getElementById("channel-name");
    const followersCountElement = document.getElementById("followers-count");
    const channelAvatarElement = document.getElementById(
      "channel-twitch-avatar"
    );
    const channelLinkElement = document.getElementById("channel-link-tw");
    const channelViewsElement = document.getElementById("channel-views");

    if (
      channelNameElement &&
      followersCountElement &&
      channelAvatarElement &&
      channelLinkElement &&
      channelViewsElement
    ) {
      // Виведення на сторінку
      channelNameElement.textContent = channelDisplayName;
      followersCountElement.textContent = followersCount;
      channelViewsElement.textContent = `${channelViews} переглядів`;
      channelAvatarElement.src = channelAvatarUrl;
      channelLinkElement.href = channelUrl;
    }

    // Після отримання інформації, ховаємо анімацію завантаження та показуємо блок з інформацією
    if (loaderTwElement && twitchInfoElement) {
      loaderTwElement.style.display = "none";
      twitchInfoElement.style.display = "inline-flex";
    }
  } catch (error) {
    console.error(error);
    // При виникненні помилки, також ховаємо анімацію завантаження
    if (loaderTwElement) {
      loaderTwElement.style.display = "none";
    }
  }
}

// Виклик функції для отримання інформації про канал
getChannelInfo();
