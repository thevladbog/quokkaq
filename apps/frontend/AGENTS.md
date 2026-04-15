# QuokkaQ Frontend — контекст для агента

## Продукт

**QuokkaQ** — система управления очередями: подразделения (units), талоны, услуги, окна, смены, бронирование/предзапись, приглашения, киоск, табло, панели сотрудника и супервизора, админка.

## Стек

- Next.js 16.2+ (App Router), React 19, TypeScript 6
- Tailwind CSS 4, shadcn/ui (Radix)
- TanStack Query, next-intl (локали)
- Zod 4, framer-motion, react-dnd, react-rnd, react-qr-code
- Локаль и реврайты API: корневой [`proxy.ts`](proxy.ts) (next-intl; в Next 16 вместо устаревшего `middleware.ts`). ESLint держим на **v9** — совместимость с `eslint-config-next`.

## Структура

- Маршруты под `app/[locale]/`: `login`, `register`, `forgot-password`, `reset-password`, `admin/*`, `staff`, `supervisor`, `kiosk`, `screen`, `ticket`, `setup` — у зон отдельные `layout.tsx`.
- Общие утилиты и компоненты — по соглашениям уже принятым в репозитории.

## Бэкенд (соседний репозиторий)

- REST: переменная `NEXT_PUBLIC_API_URL` (локально обычно `http://localhost:3001`).
- WebSocket: `NEXT_PUBLIC_WS_URL`; в проде — `wss://...` к API-хосту.
- Реализация клиента: `lib/socket.ts` — **нативный `WebSocket`**. Логи подключения — через `lib/logger.ts` (в production без лишнего `console.log`).
- Исходники API: `../quokkaq-go-backend` (относительно этого фронта в общей папке `quokkaq`).

## OpenAPI и Orval (генерация клиента)

- Спека: `../backend/docs/swagger.json` (в монорепо — [`apps/backend/docs/swagger.json`](../../apps/backend/docs/swagger.json)).
- Конфиг: [`orval.config.ts`](orval.config.ts). Наборы тегов → отдельные файлы в [`lib/api/generated/`](lib/api/generated/) (например **`platform`** → `platform.ts`, **`auth`** → `auth.ts`); файлы **не править вручную**.
- HTTP для сгенерированных вызовов: [`lib/orval-mutator.ts`](lib/orval-mutator.ts) использует [`lib/authenticated-api-fetch.ts`](lib/authenticated-api-fetch.ts) (JWT и refresh, как в `lib/api.ts`).
- После изменений swag/OpenAPI: из корня репозитория `pnpm nx run frontend:orval`. Проверка расхождения с коммитом: `pnpm nx run frontend:orval:check`.
- Эндпоинты **`auth`** (логин, `/auth/me`, список организаций): сгенерированный [`lib/api/generated/auth.ts`](lib/api/generated/auth.ts) и обёртки [`lib/auth-orval.ts`](lib/auth-orval.ts) (валидация пользователя через `UserModelSchema`).
- Остальной REST по-прежнему через [`lib/api.ts`](lib/api.ts) и TanStack Query до миграции конкретных ручек в Orval.
- `shared-types` (Zod) остаётся для форм и ручных контрактов; типы из Orval — отдельный слой, дубли убирать постепенно.

## Локальная разработка

- `npm install` / `npm run dev` — порт **3000**.
- Pull request: GitHub Actions — [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) (ESLint, Prettier, Vitest, `next build` и затронутые пакеты).
- Полный стек БД/Redis/MinIO/API: `docker compose` в `quokkaq-go-backend`.

## Деплой

- Docker (standalone Next), CI по ветке `prod-release` → Yandex Cloud; детали в `README.md`.
