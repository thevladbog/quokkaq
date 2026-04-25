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
- **`/counter-display`** — экран у стойки: реклама/idle, гостевой опрос; терминальный JWT, ключи `quokkaq_counter_display_*`.
- **`/workplace-display`** — табло над стойкой: только название стойки и талон (вызов или обслуживание), крупная типографика; отдельные ключи `quokkaq_counter_board_*`; десктоп-терминал с **`kind: counter_board`** (в админке — «Табло над стойкой»), не путать с **`counter_guest_survey`** («Экран опроса у стойки»). Сессия: `GET .../counter-board/session` (не гостевой опрос; не требует фичи опроса у стойки). Нужна фича **`counter_board`** на плане. Сопряжение можно передать в URL: `?code=…`.
- Общие утилиты и компоненты — по соглашениям уже принятым в репозитории.

## Бэкенд (соседний репозиторий)

- REST: переменная `NEXT_PUBLIC_API_URL` (локально обычно `http://localhost:3001`).
- WebSocket: `NEXT_PUBLIC_WS_URL`; в проде — `wss://...` к API-хосту.
- Реализация клиента: `lib/socket.ts` — **нативный `WebSocket`**. Логи подключения — через `lib/logger.ts` (в production без лишнего `console.log`).
- Исходники API: `../quokkaq-go-backend` (относительно этого фронта в общей папке `quokkaq`).

## OpenAPI и Orval (генерация клиента)

- Спека: `../backend/docs/openapi.json` (в монорепо — [`apps/backend/docs/openapi.json`](../../apps/backend/docs/openapi.json)).
- Конфиг: [`orval.config.ts`](orval.config.ts). Наборы тегов → отдельные файлы в [`lib/api/generated/`](lib/api/generated/) (например **`platform`** → `platform.ts`, **`auth`** → `auth.ts`); файлы **не править вручную**.
- HTTP для сгенерированных вызовов: [`lib/orval-mutator.ts`](lib/orval-mutator.ts) использует [`lib/authenticated-api-fetch.ts`](lib/authenticated-api-fetch.ts) (JWT и refresh, как в `lib/api.ts`).
- После изменений swag/OpenAPI: из корня репозитория `pnpm nx run frontend:orval`. Проверка расхождения с коммитом: `pnpm nx run frontend:orval:check`.
- Эндпоинты **`auth`** (логин, `/auth/me`, список организаций): сгенерированный [`lib/api/generated/auth.ts`](lib/api/generated/auth.ts) и обёртки [`lib/auth-orval.ts`](lib/auth-orval.ts) (валидация пользователя через `UserModelSchema`).
- Остальной REST по-прежнему через [`lib/api.ts`](lib/api.ts) и TanStack Query до миграции конкретных ручек в Orval.
- `shared-types` (Zod) остаётся для форм и ручных контрактов; типы из Orval — отдельный слой, дубли убирать постепенно. Digital Signage: общая валидация сабмитов — [`lib/signage-zod.ts`](lib/signage-zod.ts) и схемы плейлистов/расписаний/фидов/шаблона экрана в `@quokkaq/shared-types`.
- **Талон и PII:** `documentsData` на **публичной** странице `app/[locale]/ticket/[ticketId]/` приходит только если `GET` идёт с `X-Visitor-Token` (токен кладётся в `sessionStorage` как `visitor_token_{id}` при выдаче талона с киоска/очереди). Обертка: [`ticketsApi.getById` в `lib/api.ts`](lib/api.ts). **Staff/supervisor** — смотрят PII по праву `tickets.user_data.read` (см. `ticket-user-data-visibility.ts`). Runbook: [«Ticket documentsData»](../../docs/operations/ticket-documents-data.md).

## Digital Signage (админ + `/screen/[unitId]`)

- **Админ-вкладка «Состояние»** — агрегат [`SignageHealthPanel`](components/admin/units/signage/signage-health-panel.tsx) (`useGetSignageHealth`). **Объявления** — `displayMode: banner | fullscreen` (полноэкранный слой: [`ScreenFullscreenAnnouncementOverlay`](components/screen/screen-fullscreen-announcement-overlay.tsx) в [`screen-unit-client`](components/screen/screen-unit-client.tsx)).
- **Позиция продукта:** один `unit` = одна площадка очереди и один табло-экран; сетевые fичи (группы экранов, proof of play) — не baseline без явного B2B-запроса. Даты **YYYY-MM-DD** в формах согласованы с бэкендом (календарь в таймзоне юнита).

## Локальная разработка

- `npm install` / `npm run dev` — порт **3000**.
- Pull request: GitHub Actions — [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) (ESLint, Prettier, Vitest, `next build` и затронутые пакеты).
- Полный стек БД/Redis/MinIO/API: `docker compose` в `quokkaq-go-backend`.

## Деплой

- Docker (standalone Next), CI по ветке `prod-release` → Yandex Cloud; детали в `README.md`.

## Права доступа (RBAC) во фронтенде

- **Модель пользователя** — [`UserModelSchema`](../../packages/shared-types/src/index.ts) (`@quokkaq/shared-types`): после парсинга доступны **`isPlatformAdmin`** (глобальная роль `platform_admin`) и **`isTenantAdmin`** (tenant-роль `system_admin` в активной компании). Поле **`roles`** устарело; предпочтительны `tenantRoles` и карта **`permissions`** по `unitId`.
- **Повышенный доступ в тенанте** — [`lib/tenant-admin-access.ts`](lib/tenant-admin-access.ts): `isTenantAdminUser(user)` = platform_admin **или** глобальный `admin` **или** tenant `system_admin`.
- **Маршруты** — [`components/ConditionalLayout.tsx`](components/ConditionalLayout.tsx) и [`components/ProtectedRoute.tsx`](components/ProtectedRoute.tsx): только `requiredPermission` / `requiredAnyPermission` / `requireTenantAdmin` / `requirePlatformOperator`; массивов `allowedRoles` нет.
- **Компонент** [`components/auth/permission-guard.tsx`](components/auth/permission-guard.tsx) — проверка прав на юнит; `tenantAdminBypass` разрешает tenant `system_admin` без перечисления прав; `platform_admin` обходят через `isPlatformAdmin`.
- **Константы прав** — [`lib/permission-variants.ts`](lib/permission-variants.ts) (канонические строки и алиасы), список для UI — [`lib/unit-permissions.ts`](lib/unit-permissions.ts). Для сопоставления строк использовать `userUnitPermissionMatches` / `flatPermissionsInclude`.
- **SaaS operator UI** (`/platform`) — только `isPlatformAdmin` / [`lib/platform-access.ts`](lib/platform-access.ts); отдельного env для «tenant admin в platform» нет.
