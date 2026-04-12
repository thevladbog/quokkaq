# QuokkaQ Go Backend — контекст для агента

## Продукт

**QuokkaQ** — система управления очередями для нескольких подразделений: талоны, услуги, окна, смены, бронирование/предзапись, приглашения пользователей, киоск, табло, staff/supervisor, админка. Мультитенантность по units.

## Стек

- Go 1.26.0, модуль `quokkaq-go-backend`
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
- Конфиг: `internal/config/`, примеры env — `.env.example`
- Типичные переменные: `DATABASE_URL`, `PORT` (по умолчанию **3001**), `APP_BASE_URL` (URL фронта), AWS/MinIO, SMTP, Redis, `JWT_SECRET`, `CORS_ALLOWED_ORIGINS` (через запятую), `RUN_AUTO_MIGRATE` (`false` — отключить AutoMigrate при старте).

## Доменные области (по `internal/services/`)

auth, users, units, tickets, services, counters, shifts, slots, bookings, pre-registrations, invitations, templates, mail, storage, TTS, job enqueue.

## Локальная разработка

- `go run cmd/api/main.go` или `air`
- `docker-compose.yml`: postgres, redis, minio, backend — API **:3001**
- После старта: Scalar `http://localhost:3001/swagger/`, спека OpenAPI 3: `http://localhost:3001/docs/openapi.json` (и исторический путь `/docs/swagger.json`).
- Новые эндпоинты: model → repository → service → handler → регистрация в `main.go` → аннотации swag (Swagger 2) → пайплайн доков из `apps/backend`:
  `swag init -g cmd/api/main.go -o ./docs` → `go run ./cmd/swagger-to-openapi3` (конвертация в OpenAPI 3 через kin-openapi) → `python3 scripts/post_swagger_openapi_tweaks.py` (`minProperties` / паттерн цвета; для YAML нужен PyYAML: `pip install pyyaml`).
- Pull request: корневой CI — `swag init` + конвертер + post-hook + `git diff` по `docs/*` при затронутом backend; отдельный workflow в `apps/backend/.github/` — тот же порядок.

## Фронтенд (соседний репозиторий)

- `../quokkaq-frontend` — Next.js; ожидает REST на `NEXT_PUBLIC_API_URL` и WebSocket на `NEXT_PUBLIC_WS_URL`.

## Деплой

- Ветка `prod-release`, образ в Yandex Container Registry, VM — см. `README.md`, `docs/DEPLOYMENT.md`.

## Документация

- Подробно: `README.md` (EN), `README.ru.md` (RU).
