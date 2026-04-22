# QuokkaQ Go Backend — контекст для агента

## Продукт

**QuokkaQ** — система управления очередями для нескольких подразделений: талоны, услуги, окна, смены, бронирование/предзапись, приглашения пользователей, киоск, табло, staff/supervisor, админка. Мультитенантность по units.

## Стек

- Go 1.26.2, модуль `quokkaq-go-backend`
- HTTP: Chi v5, CORS, JWT (`golang-jwt/jwt`)
- БД: PostgreSQL + GORM
- Real-time: Gorilla WebSocket (`internal/ws/`) — комнаты по подразделениям
- Фоновые задачи: Asynq + Redis (`internal/jobs/`)
- Файлы: AWS SDK v2 → MinIO/S3
- Почта: gomail v2, шаблоны в сервисах
- API docs: OpenAPI 3 (Scalar `/swagger/`, файлы в `docs/`)

## Архитектура

```text
handlers → services → repository → models (GORM)
     ↘ ws hub, Asynq workers
```

- Точка входа: `cmd/api/main.go`
- **Миграции БД:** версионированные шаги в [`pkg/database/postgres.go`](pkg/database/postgres.go) через `RunMigration("v…", …)`. **Не менять уже существующие миграции** (тело уже применённых версий в БД не перезапускается) — только **добавлять новые** версии с новым ключом `vX.Y.Z_…` и нужной логикой/DDL.
- **Публичное демо:** данные — [`internal/demoseed`](internal/demoseed), CLI — [`cmd/seed-demo`](cmd/seed-demo); порядок на чистой БД: миграции → [`cmd/seed-plans`](cmd/seed-plans) (пакет [`internal/subscriptionplanseed`](internal/subscriptionplanseed)) → `seed-demo`. После правок миграций/моделей, от которых зависит сид, из корня монорепо: `export DATABASE_URL=postgresql://…` (пустая PostgreSQL **16+**) → `pnpm nx run backend:test-demoseed-smoke`. Стек и деплой: [`../../deploy/demo/README.md`](../../deploy/demo/README.md), [`docs/DEMO_DEPLOYMENT.md`](docs/DEMO_DEPLOYMENT.md).
- Конфиг: `internal/config/`, примеры env — `.env.example`
- Типичные переменные: `DATABASE_URL`, `PORT` (по умолчанию **3001**), `APP_BASE_URL` (URL фронта), AWS/MinIO, SMTP, Redis, `JWT_SECRET`, `CORS_ALLOWED_ORIGINS` (через запятую), `RUN_AUTO_MIGRATE` (`false` — отключить AutoMigrate при старте).

## Доменные области (по `internal/services/`)

auth, users, units, tickets, services, counters, shifts, slots, bookings, pre-registrations, invitations, templates, mail, storage, TTS, job enqueue.

## Digital Signage (табло, внешние фиды, плейлисты)

- **Модели/таблицы:** [`internal/models/signage.go`](internal/models/signage.go) — плейлисты, расписания, `ExternalFeed` (в т.ч. `last_error`, `last_fetch_at`, `consecutive_failures` после миграции), объявления на экран.
- **Сервис/поллинг:** [`internal/services/signage_service.go`](internal/services/signage_service.go) — `PollDueFeeds` / `PollFeedByID`. Тип `weather` использует **Open-Meteo** (параметры `lat`/`lon` в `config` JSON, см. `pollWeather`); `rss` — парсер `gofeed`, `custom_url` — JSON по HTTP. Для сетевых вызовов встроены **повторные попытки** (см. `httpGetJSON` / `pollCustomURL`).
- **Периодика Asynq:** `internal/jobs/feed_poller.go`, постановка `EnqueueSignageFeedPoll` из `cmd/api/main.go` (интервальные enqueue в общем цикле, как у других periodic jobs).
- **Публичные пути (без сессии, для экрана):** объявления и данные фидов — теги и маршруты в [`internal/handlers/signage_handler.go`](internal/handlers/signage_handler.go) (имена путей и префиксы `public-` / `public-screen-` в OpenAPI).
- **Очередь `servedToday`:** в обход HTTP и WebSocket `UnitETASnapshot` заполняется в [`internal/services/eta_service.go`](internal/services/eta_service.go) той же логикой дня, что `GetUnitQueueSummary` (функция `servedTodayForUnit` + timezone юнита).

## Статистика: аномалии и staffing

- **Asynq:** периодическая задача `anomaly:check` ставится из `cmd/api/main.go`, тип и постановка — `internal/jobs/types.go`, `internal/jobs/client.go`, обработчик — `internal/jobs/worker.go` (`handleAnomalyCheck`). Нужен **Redis** (`REDIS_URL` и т.п.), иначе очередь недоступна.
- **БД:** сохранённые сигналы — таблица `anomaly_alerts` (миграция в [`pkg/database/postgres.go`](pkg/database/postgres.go)), репозиторий [`internal/repository/anomaly_alert_repository.go`](internal/repository/anomaly_alert_repository.go).
- **API для UI:** `GET /units/{unitId}/statistics/anomaly-alerts` — [`internal/handlers/statistics_handler.go`](internal/handlers/statistics_handler.go); логика детекции/уведомлений — [`internal/services/prediction_service.go`](internal/services/prediction_service.go).

## Локальная разработка

- Из корня монорепо: `pnpm nx run backend:serve` — `go run ./cmd/api` через [`scripts/run-backend-dev.js`](scripts/run-backend-dev.js) (освобождение порта, корректный код выхода для Nx при Ctrl+C). Hot reload нет: после правок `.go` перезапустите процесс. Без Nx: `node scripts/run-backend-dev.js` или `go run ./cmd/api` из `apps/backend`.
- `docker-compose.yml`: postgres, redis, minio, backend — API **:3001**
- После старта: Scalar `http://localhost:3001/swagger/`, спека OpenAPI 3: `http://localhost:3001/docs/openapi.json` (и исторический путь `/docs/swagger.json`).
- Новые эндпоинты: model → repository → service → handler → регистрация в `main.go` → аннотации swag (Swagger 2) → пайплайн доков из `apps/backend`:
  `swag init -g cmd/api/main.go -o ./docs` → `go run ./cmd/swagger-to-openapi3` (конвертация в OpenAPI 3 через kin-openapi + структурные патчи). Или через Nx из корня: `pnpm nx run backend:openapi`.
- Pull request: корневой CI — `pnpm nx run backend:openapi:check` + `git diff` по `docs/*` при затронутом backend; отдельный workflow в `apps/backend/.github/` — тот же порядок; Gosec — [`.github/workflows/gosec.yml`](../../.github/workflows/gosec.yml) и [`.gosec.json`](.gosec.json).
- Монорепо **quokkaq**: после обновления `docs/openapi.json`, если эндпоинт попадает под Orval на фронте, из корня выполнить `pnpm nx run frontend:orval` и закоммитить изменения в `apps/frontend/lib/api/generated/` (см. `apps/frontend/orval.config.ts`). Для читаемых имён в клиенте можно задать `@ID` в swag-комментариях к handler.

## Tenant integration API и публичный виджет

- Интеграционный REST — префикс **`/integrations/v1`** (ключи, scope, пути — канон в OpenAPI/Scalar на вашем инстансе, например `GET /docs/openapi.json`).
- **`INTEGRATION_API_RL_REDIS`:** при `true` и доступном Redis (`REDIS_URL` или `REDIS_HOST`/`REDIS_PORT`) для `/integrations/v1` используется sliding-window лимит в Redis; иначе — in-memory token bucket.
- **`GET /companies/me`** включает **`planCapabilities`**: флаги тарифа для UI (Developer API, webhooks, публичный виджет и др.) — имена полей и типы только из OpenAPI.
- **Публичный виджет:** JWT подписывается секретом **`PUBLIC_WIDGET_JWT_SECRET`**; allowlist origin — `company.settings.publicQueueWidgetAllowedOrigins`. Краткая операторская документация: [EN](../../docs/wiki/en/developer-api.md), [RU](../../docs/wiki/ru/developer-api.md).

## Фронтенд (соседний репозиторий)

- `../quokkaq-frontend` — Next.js; ожидает REST на `NEXT_PUBLIC_API_URL` и WebSocket на `NEXT_PUBLIC_WS_URL`.

## Деплой

- Ветка `prod-release`, образ в Yandex Container Registry, VM — см. `README.md`, `docs/DEPLOYMENT.md`.

## Документация

- Подробно: `README.md` (EN), `README.ru.md` (RU).

## Авторизация и RBAC

- **Каталог прав** — константы в [`internal/rbac/permissions.go`](internal/rbac/permissions.go) (dot-notation: `tickets.read`, `access.staff_panel`, `support.reports`, …). Новые ключи добавлять туда и в OpenAPI/клиент при необходимости.
- **HTTP middleware** ([`internal/middleware/rbac_middleware.go`](internal/middleware/rbac_middleware.go)):
  - `RequirePlatformAdmin` — только SaaS-оператор (`platform_admin`); в не-production при `PLATFORM_ALLOW_TENANT_ADMIN` может допускать глобальный `admin` (см. `authorization.go`).
  - `RequireTenantAdmin` — `platform_admin`, глобальный `admin`, tenant `system_admin`, или каталог `tenant.admin` на юните.
  - `RequireTenantPermission(perm)` — то же + `TenantPermissionAllowed`: каталог `perm` через tenant roles **или** то же право на `user_units` в компании ([`internal/repository/tenant_permission_allowed.go`](internal/repository/tenant_permission_allowed.go)).
  - `RequireUnitPermission` — право на конкретном `unitId` из URL (JWT user или terminal).
- **Tenant roles** — `tenant_roles`, `tenant_role_units`, `user_tenant_roles`; слияние прав в `user_units` — `tenantroleseed.RebuildUserUnitsFromTenantRoles` / синхронизация из хендлеров.
- **Глобальный `admin`** — `userRepo.IsAdmin` (только имя роли `admin`); **legacy**, но всё ещё используется в части хендлеров и middleware. Для полного контроля внутри тенанта предпочтительны tenant-роль `system_admin` и каталог прав.
- **Миграции БД** — только новые версии: `RunMigration("v1.x.y_snake_case", …)` в [`pkg/database/postgres.go`](pkg/database/postgres.go); тела уже применённых миграций не менять.
- **Inline-проверки** (survey, shift journal, statistics scope) опираются на глобальные имена ролей и/или канонические права на `user_units`; tenant `system_admin` обычно покрывается **слитыми** правами на все юниты после TRU, а не отдельной проверкой slug в репозитории.

## Зависимости и алерты

- **pgx / CVE-2026-33815 (GHSA-xgrm-4fwx-7qm8):** в `go.mod` стоит `github.com/jackc/pgx/v5` **v5.9.1**; по OSV исправление с **v5.9.0**. Локально: `go run golang.org/x/vuln/cmd/govulncheck@latest ./...` в `apps/backend` — без находок. Если GitHub Dependency review всё ещё ругается, в [`.github/workflows/dependency-review.yml`](../../.github/workflows/dependency-review.yml) для этого GHSA задан `allow-ghsas` (см. комментарий в workflow); при обновлении данных GitHub правило можно убрать.
- **Debricked (OpenText Core SCA):** опциональный CI — [`.github/workflows/debricked.yml`](../../.github/workflows/debricked.yml); нужен секрет репозитория `DEBRICKED_TOKEN`. Скан с корня монорепо (`debricked scan .`) подхватывает `pnpm-lock.yaml`, `apps/backend/go.mod` и др. Ложные срабатывания после апгрейда зависимости настраиваются в UI Debricked (automation rules / ignore / waiver), а не только в коде.
