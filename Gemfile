source "https://rubygems.org"

gem "jekyll", ">= 4.3.2"
gem "public_suffix", ">= 6.0"

gem "csv"
gem "logger"
gem "base64"
gem "webrick", ">= 1.8.1"

group :jekyll_plugins do
  gem "jekyll-seo-tag", ">= 2.8.0"
  gem "jekyll-sitemap", ">= 1.4.0"
  gem "jekyll-feed", ">= 0.17"
  gem "jekyll-include-cache", ">= 0.2"
end

platforms :mingw, :x64_mingw, :mswin, :jruby do
  gem "tzinfo", ">= 1", "< 3"
  gem "tzinfo-data"
end

gem "wdm", ">= 0.1.1", install_if: Gem.win_platform?