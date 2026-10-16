SHELL := /bin/bash
.DEFAULT_GOAL := help
.PHONY: help deploy up check integration-check status ps logs stop restart
help:
	@printf '%s\n' 'make deploy — окрема збірка й запуск сайту з healthcheck та rollback' 'make check — перевірка Docker, env, конфігурації та мережі' 'make integration-check — перевірка дашборда без збірки й перезапуску сайту' 'make status — стан сайту' 'make logs — логи сайту' 'make restart — перезапуск лише сайту' 'make stop — зупинка лише сайту'
deploy up:
	@bash deploy/deploy.sh deploy
check:
	@bash deploy/deploy.sh check
integration-check:
	@bash deploy/deploy.sh integration-check
status ps:
	@bash deploy/deploy.sh status
logs:
	@bash deploy/deploy.sh logs
stop:
	@bash deploy/deploy.sh stop
restart:
	@bash deploy/deploy.sh restart
