FROM docker.io/ruby:3.2

WORKDIR /src
ADD Gemfile /src
ADD Gemfile.lock /src
RUN gem install bundler -v 2.3.26
RUN bundle install
RUN bundle exec jekyll build

VOLUME /src
EXPOSE 4000
ENTRYPOINT bundle exec ruby test/validate.rb && bundle exec jekyll serve --host 0.0.0.0 --incremental