#!/usr/bin/env bash
# Separate public-site deployment. Does not run dashboard Compose or edit Nginx.
set -Eeuo pipefail
umask 077
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT"
ACTION="${1:-deploy}"
PROJECT=lihvodruida-site
config_tmp=''
rollback_tag=''
rollback_active=0
fail() { printf '\nПОМИЛКА: %s\n' "$*" >&2; exit 1; }
info() { printf '\n==> %s\n' "$*"; }
cleanup() { if [[ -n "$config_tmp" ]]; then rm -f -- "$config_tmp"; fi; }
trap cleanup EXIT
case "$ACTION" in
  deploy|check|status|logs|stop|restart) ;;
  *) fail 'Використання: bash deploy/deploy.sh [deploy|check|status|logs|stop|restart]' ;;
esac
[[ $# -le 1 ]] || fail 'Зайві аргументи.'
for command in docker python3; do command -v "$command" >/dev/null || fail "Не знайдено $command."; done
docker compose version >/dev/null || fail 'Потрібен Docker Compose v2 або новіший.'
docker info >/dev/null 2>&1 || fail 'Docker недоступний. Перевір запуск daemon та права користувача ubuntu.'
case "$ACTION" in
  deploy|check|stop|restart)
    command -v flock >/dev/null || fail 'Потрібен flock із пакета util-linux.'
    exec 9>"$ROOT/.deploy.lock"
    flock -n 9 || fail 'Інший запуск керування сайтом ще працює.' ;;
esac
if [[ ! -f .env ]]; then
  case "$ACTION" in
    deploy|check) [[ -f .env.example ]] || fail 'Немає .env.example.'; cp .env.example .env; info 'Створено .env із публічними налаштуваннями сайту.' ;;
    *) fail 'Немає .env. Спочатку виконай make check.' ;;
  esac
fi
# Existing values are never rewritten or evaluated as shell code.
if [[ "$ACTION" == deploy || "$ACTION" == check ]]; then chmod 600 .env; fi
compose=(docker compose --project-directory "$ROOT" --env-file "$ROOT/.env" -p "$PROJECT" -f "$ROOT/compose.yml")
if [[ -f "$ROOT/compose.override.yml" ]]; then compose+=(-f "$ROOT/compose.override.yml"); fi
compose+=(-f "$ROOT/deploy/compose.vps.yml")
case "$ACTION" in
  status) exec "${compose[@]}" ps ;;
  logs) exec "${compose[@]}" logs --follow --tail=100 site ;;
esac
config_tmp="$(mktemp)"
"${compose[@]}" config --format json >"$config_tmp" || fail 'Некоректна конфігурація Compose.'
network="$(python3 - "$config_tmp" <<'PY'
import json,re,sys
from urllib.parse import urlsplit
try:
    config=json.load(open(sys.argv[1]))
    assert config.get('name')=='lihvodruida-site', 'Чуже ім’я Compose-проєкту.'
    assert set(config.get('services',{}))=={'site'}, 'Дозволений лише сервіс site.'
    service=config['services']['site']
    assert not service.get('container_name'), 'container_name не підтримується: потрібна ізоляція Compose.'
    assert service.get('read_only') is True, 'Потрібна read-only файлова система.'
    for port in service.get('ports',[]):
        assert port.get('host_ip')=='127.0.0.1' and int(port['target'])==3000, 'Порт сайту має бути доступний лише на localhost.'
    for key in ('SITE_URL','DASHBOARD_URL'):
        url=urlsplit(service.get('environment',{}).get(key,''))
        assert url.scheme=='https' and url.hostname and not url.username and not url.password and url.path in ('','/') and not url.query and not url.fragment, f'{key}: потрібен HTTPS origin без шляху та облікових даних.'
    net=config['networks']['dashboard_edge']
    name=net.get('name','')
    assert net.get('external') is True and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,127}',name), 'Некоректна зовнішня мережа.'
    assert 'dashboard_edge' in service.get('networks',{}), 'Сайт не підключений до edge.'
    print(name)
except (AssertionError,KeyError,ValueError,TypeError) as error:
    print(f'Перевірка деплою: {error}',file=sys.stderr)
    sys.exit(1)
PY
)" || fail 'Виправ .env або compose.override.yml.'
if [[ "$ACTION" == stop ]]; then
  info 'Зупиняємо лише публічний сайт.'
  "${compose[@]}" stop site
  exit 0
fi
docker network inspect "$network" >/dev/null 2>&1 || fail "Мережа $network відсутня. Потрібна чинна мережа Nginx дашборда; скрипт її не створює."
info "Конфігурація правильна. Проєкт: $PROJECT; мережа: $network."
if [[ "$ACTION" == check ]]; then exit 0; fi
health_timeout="${SITE_HEALTH_TIMEOUT:-90}"
[[ "$health_timeout" =~ ^[0-9]+$ ]] && ((health_timeout>=1 && health_timeout<=600)) || fail 'SITE_HEALTH_TIMEOUT: від 1 до 600 секунд.'
wait_healthy() {
  local start=$SECONDS cid state
  while ((SECONDS-start<health_timeout)); do
    cid="$("${compose[@]}" ps --all --quiet site)" || return 1
    [[ -n "$cid" && "$cid" != *$'\n'* ]] || return 1
    state="$(docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$cid")" || return 1
    case "$state" in
      'running|healthy') return 0 ;;
      'running|starting'|'created|starting') sleep 2 ;;
      *) printf 'Контейнер не готовий: %s\n' "$state" >&2; return 1 ;;
    esac
  done
  printf 'Не отримано healthy за %s с.\n' "$health_timeout" >&2
  return 1
}
if [[ "$ACTION" == restart ]]; then
  "${compose[@]}" restart site
  wait_healthy || fail 'Сайт не пройшов healthcheck. Перевір make logs.'
  info 'Сайт перезапущено; healthcheck успішний.'
  exit 0
fi
# Keep the image of the previously healthy service before replacing its tag.
old_cid="$("${compose[@]}" ps --quiet site)"
if [[ -n "$old_cid" ]]; then
  [[ "$old_cid" != *$'\n'* ]] || fail 'Підтримується одна репліка site.'
  old_state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$old_cid")"
  if [[ "$old_state" == healthy ]]; then
    old_image="$(docker inspect --format '{{.Image}}' "$old_cid")"
    rollback_tag="lihvodruida-site:rollback-$(date -u +%Y%m%dT%H%M%S)-$$"
    docker image tag "$old_image" "$rollback_tag"
  fi
fi
info 'Збираємо образ. Поточний сайт продовжує працювати під час build.'
export COMPOSE_PARALLEL_LIMIT=1
"${compose[@]}" build site || fail 'Збірка не пройшла. Контейнер сайту не замінено.'
on_deploy_error() {
  local code=$?
  trap - ERR INT TERM
  if [[ "$rollback_active" == 1 && -n "$rollback_tag" ]]; then
    info 'Новий запуск не пройшов. Повертаємо попередній здоровий образ.'
    if SITE_IMAGE="$rollback_tag" "${compose[@]}" up -d --no-build --no-deps --pull never site && wait_healthy; then
      printf 'Попередню версію відновлено: %s\n' "$rollback_tag" >&2
    else
      printf 'Автоматичне відновлення не пройшло. Образ збережено: %s\n' "$rollback_tag" >&2
    fi
  else
    printf 'Попереднього здорового образу немає. Перевір make logs.\n' >&2
  fi
  exit "$code"
}
rollback_active=1
trap on_deploy_error ERR
trap 'exit 130' INT
trap 'exit 143' TERM
info 'Запускаємо лише site та очікуємо healthy.'
"${compose[@]}" up -d --no-build --no-deps --pull never site
wait_healthy
rollback_active=0
trap - ERR INT TERM
info 'Деплой сайту завершено; healthcheck успішний.'
"${compose[@]}" ps site
printf '\nЛоги: make logs\nДомен і TLS: deploy/VPS.md\n'
