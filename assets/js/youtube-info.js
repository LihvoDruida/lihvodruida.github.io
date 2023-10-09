const API_KEY = "AIzaSyBQgFh31e-kqfnWlAeI66TjmXe5KAPjMkk";
const CHANNEL_ID = "UCWex56K6Xev50zIF7hVCyMQ";

function getChannelInfo() {
  const loaderElement = document.getElementById("loader");
  const youtubeInfoElement = document.getElementById("youtube-info");

  if (loaderElement && youtubeInfoElement) {
    loaderElement.style.display = "inline-flex";
    youtubeInfoElement.style.display = "none";
  }

  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${CHANNEL_ID}&key=${API_KEY}`;

  fetch(url)
    .then((response) => response.json())
    .then((data) => {
      const channelTitle = data.items[0].snippet.title;
      const channelDescription = data.items[0].snippet.description;
      const subscriberCount = data.items[0].statistics.subscriberCount;
      const videoCount = data.items[0].statistics.videoCount;
      const viewCount = data.items[0].statistics.viewCount;
      const avatarUrl = data.items[0].snippet.thumbnails.default.url;
      const channelUrl = `https://www.youtube.com/channel/${CHANNEL_ID}`;

      const channelTitleElement = document.getElementById("channel-title");
      if (channelTitleElement) {
        channelTitleElement.textContent = channelTitle;
      }

      const channelDescriptionElement = document.getElementById(
        "channel-description"
      );
      if (channelDescriptionElement) {
        channelDescriptionElement.textContent = channelDescription;
      }

      const subscriberCountElement =
        document.getElementById("subscriber-count");
      if (subscriberCountElement) {
        subscriberCountElement.textContent = subscriberCount;
      }

      const videoCountElement = document.getElementById("video-count");
      if (videoCountElement) {
        videoCountElement.textContent = `${videoCount} відео`;
      }

      const viewCountElement = document.getElementById("view-count");
      if (viewCountElement) {
        viewCountElement.textContent = `${viewCount} переглядів`;
      }

      const channelAvatarElement = document.getElementById("channel-avatar");
      if (channelAvatarElement) {
        channelAvatarElement.src = avatarUrl;
      }

      const channelLinkElement = document.getElementById("channel-link");
      if (channelLinkElement) {
        channelLinkElement.href = channelUrl;
      }

      // Після отримання інформації, ховаємо анімацію завантаження та показуємо блок з інформацією
      if (loaderElement && youtubeInfoElement) {
        loaderElement.style.display = "none";
        youtubeInfoElement.style.display = "inline-flex";
      }
    })
    .catch((error) => {
      console.error("Произошла ошибка:", error);
      // При виникненні помилки, також ховаємо анімацію завантаження
      if (loaderElement) {
        loaderElement.style.display = "none";
      }
    });
}

getChannelInfo();
