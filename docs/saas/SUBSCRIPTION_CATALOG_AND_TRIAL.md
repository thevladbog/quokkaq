# Каталог тарифов, триал и меню (техническая справка)

Документ описывает, как в QuokkaQ устроены **подписки**, **единый источник данных по тарифам**, **различия списков** в платформенной админке и у клиента, а также почему в сайдбаре могут пропадать пункты меню. См. также [BILLING.md](./BILLING.md).

## Единый источник истины (SSOT)

- **Данные:** таблица БД `subscription_plans` (редактирование через SaaS-платформу: `GET/POST/PUT /platform/subscription-plans`).
- **Клиентский каталог** (тенант, апгрейд, маркетинг с настроенным API): `GET /subscriptions/plans` — реализация [`GetActivePlans`](../../apps/backend/internal/repository/subscription_repository.go): только **`is_active = true` AND `is_public = true`**, сортировка по `display_order`, `name`.
- **Операторский полный каталог:** `GET /platform/subscription-plans` — [`ListAllPlans`](../../apps/backend/internal/repository/subscription_repository.go): **все** строки без фильтра по публичности/активности.

План виден в админке, но **не** попадает в тенант и в публичный API, пока не включены **«Активен»** и **«Публичный»**.

### Маркетинг

- Динамический прайс: [`apps/marketing/lib/fetch-marketing-subscription-plans.ts`](../../apps/marketing/lib/fetch-marketing-subscription-plans.ts) → тот же `GET /subscriptions/plans` (нужны `MARKETING_API_URL` или `NEXT_PUBLIC_API_URL`).
- Если env не задан или запрос падает, используется **статический** текст из [`apps/marketing/src/messages.ts`](../../apps/marketing/src/messages.ts) — это **не** SSOT; для продакшена нужно стабильно отдавать API-каталог с того же бэкенда, что и админка.

### Тенант: биллинг

- [`apps/frontend/app/[locale]/settings/organization/billing/OrganizationBillingContent.tsx`](../../apps/frontend/app/[locale]/settings/organization/billing/OrganizationBillingContent.tsx) — `subscriptionsApi.getPlans()` → `/subscriptions/plans`.

## Триал и лимиты плана

- Регистрация: [`apps/backend/internal/services/auth_service.go`](../../apps/backend/internal/services/auth_service.go) — подписка со статусом `trial`, **14 дней**, `PlanID` из `FindPlanByCode(planCode)`.
- Проверки возможностей (например [`CompanyHasPlanFeature`](../../apps/backend/internal/services/plan_feature.go)) смотрят на **`subscription_plans.features`** привязанного плана; статус `trial` **не** отключает эти проверки отдельно. Пример ключа: **`kiosk_employee_idp`** — прокси идентификации сотрудника по бейджу/логину (см. [`plan_feature.go`](../../apps/backend/internal/services/plan_feature.go), [runbook внешнего API](../operator/employee-idp-runbook.md)).
- На триале действуют правила **выбранного тарифа** (как после оплаты), ограниченные сроком триала.

## Регистрация и параметр плана

- Фронт: [`apps/frontend/app/[locale]/signup/page.tsx`](../../apps/frontend/app/[locale]/signup/page.tsx) — query **`?plan=<code>`** передаётся в `authSignup` как `planCode` (может быть `undefined`).
- Бэкенд: [`apps/backend/internal/handlers/auth_handler.go`](../../apps/backend/internal/handlers/auth_handler.go) — если `planCode` пустой, подставляется **`starter`** перед вызовом `Signup`.

**Важно:** код плана в URL должен **точно совпадать** с `subscription_plans.code` (например `optima`). Если в каталоге только код `start`, а дефолт остаётся `starter`, регистрация без `?plan=` может завершиться ошибкой — проверьте наличие строки с `code = 'starter'` или меняйте дефолт/каталог согласованно.

## Сайдбар: журнал аудита, клиенты, статистика

- [`apps/frontend/components/AppSidebar.tsx`](../../apps/frontend/components/AppSidebar.tsx) — пункты с привязкой к unit (журнал, клиенты, статистика) рендерятся только при наличии **`activeUnitId`**.
- [`apps/frontend/contexts/ActiveUnitContext.tsx`](../../apps/frontend/contexts/ActiveUnitContext.tsx) — если у пользователя нет назначенных подразделений (`assignableUnitIds` пуст), `activeUnitId` будет `null`, и перечисленные разделы в меню не показываются.

Это **не** связано с тарифом; при новом тенанте без структуры подразделений такое поведение ожидаемо.

---

## Чеклист проверки (операции)

### 1. Текущий план организации (`verify-tenant-plan`)

1. Авторизоваться под пользователем организации, выбрать компанию.
2. Вызвать **`GET /subscriptions/me`** (с тем же API, что прод) с Bearer-токеном.
3. Проверить: `status` (например `trial`), вложенный **`plan`** — поля **`plan.code`**, `planId`, при необходимости `plan.features` / лимиты.

Альтернатива в БД: `companies.subscription_id` → `subscriptions` → `subscription_plans` по `plan_id`.

### 2. Signup и `?plan=` (`verify-signup-plan-param`)

1. Убедиться, что ссылки с маркетинга ведут на `/signup?plan=<code>` с кодом из `subscription_plans`.
2. Без query-параметра бэкенд использует дефолт **`starter`** — сверить с фактическими кодами в БД.

### 3. Каталог: платформа vs тенант (`verify-public-plans-filter`)

1. Сравнить ответы **`GET /platform/subscription-plans`** (полный список, нужна платформа-авторизация) и **`GET /subscriptions/plans`** (публичный, без фильтра по роли для списка планов — см. маршруты API).
2. Планы, есть в первом и нет во втором: проверить в БД или в админке флаги **`is_active`**, **`is_public`**.
3. Если при одинаковых флагах списки расходятся — проверить, что фронт и платформа смотрят на **один и тот же base URL** API.

### Пример запросов (локально, если API на порту 3001)

```bash
curl -sS "http://localhost:3001/subscriptions/plans" | head -c 2000
# Платформа (нужен JWT платформенного оператора):
# curl -sS -H "Authorization: Bearer <token>" "http://localhost:3001/platform/subscription-plans"
```

---

## Связанные файлы

| Область | Файл |
|--------|------|
| Фильтры планов в репозитории | `apps/backend/internal/repository/subscription_repository.go` |
| Публичный список планов | `apps/backend/internal/handlers/subscription_handler.go` (`GetPlans`) |
| Список планов платформы | `apps/backend/internal/handlers/platform_handler.go` (`ListSubscriptionPlans`) |
| Регистрация | `apps/backend/internal/handlers/auth_handler.go`, `auth_service.go` |
