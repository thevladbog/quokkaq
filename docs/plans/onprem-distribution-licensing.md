# On-Prem дистрибуция QuokkaQ с лицензированием

**Статус:** Draft — ожидает review product / engineering lead / legal.
**Владелец:** Platform team.
**Аудитория:** инженерное руководство, release engineering, SRE, sales engineering.
**Скоуп:** архитектурный и организационный план. Код и конкретные миграции — в подпланах по milestone-ам.

---

## 0. TL;DR

1. Добавляем **вторую ветку дистрибуции**: on-prem в дополнение к текущему SaaS. SaaS-код остаётся нетронутым, поведение по умолчанию не меняется.
2. Вводим **`DEPLOYMENT_MODE=saas|onprem`** в [`apps/backend/internal/config/config.go`](../../apps/backend/internal/config/config.go). Default — `saas`.
3. Источник entitlements абстрагируем за **интерфейсом `EntitlementsProvider`**: SaaS читает из подписки в БД, on-prem — из подписанного лицензионного файла.
4. Лицензия — **PEM-envelope с Ed25519 подписью**. Payload похож на JWT-шаблон, но без `alg`-зоопарка. Публичный ключ вкомпилен в бинарник через `embed.FS`.
5. Коммерческая модель — **hybrid GitLab CE/EE**: core perpetual (ticket flow, kiosk, local auth), premium по подписке (SSO, API, webhooks, smart ETA, multi-tenant, white-label).
6. **Два SKU-режима**: `airgap` (offline лицензия, manual update bundles) и `online` (heartbeat + auto-notify об апдейтах).
7. **3 формата поставки по фазам**: Docker Compose → Helm → Ansible. Single-binary — out of scope.
8. **License server** — не отдельный сервис, а пакет внутри существующего SaaS backend. Переиспользует Stripe/YooKassa, `/platform` админку, audit logs.
9. **White-label** — архитектурные хуки в M1–M3 (`next-intl` namespace `brand.*`, brand config endpoint), полная реализация — M4.
10. **Roadmap**: M1 MVP (8–10 нед) → M2 Helm + license server (6–8 нед) → M3 Air-gap + Ansible (4–6 нед) → M4 white-label / FSTEC / single-binary (future).

---

## 1. Формат лицензионного файла и криптография

### 1.1 Формат envelope

Выбираем **custom PEM-armored envelope**, не JWT:

```
-----BEGIN QUOKKAQ LICENSE-----
<base64url(JSON payload)>
.
<base64url(Ed25519 signature of JSON payload)>
-----END QUOKKAQ LICENSE-----
```

**Почему не JWT:**

- Лицензия живёт годами и ходит через email/WhatsApp/Jira — PEM framing устойчив к whitespace-повреждениям.
- JWT тянет `alg`-параметр и исторически-уязвимую `alg:none`-семантику. В нашем случае алгоритм фиксирован, выбор lib-ы не нужен.
- Для верификации достаточно `crypto/ed25519` из stdlib — нулевые сторонние зависимости и минимальная attack surface.

Dot-разделитель специально JWT-подобный: операторам визуально знакомо.

### 1.2 Payload (canonical JSON)

```jsonc
{
  "v": 1,
  "keyId": "qq-lic-2026a",
  "licenseId": "lic_01HXYZ...",
  "customerId": "cust_01HXYZ...",
  "customerName": "Bank Foo LLC",
  "sku": "enterprise-airgap",          // enterprise-(airgap|online) | midmarket-(airgap|online)
  "edition": "enterprise",              // core | midmarket | enterprise
  "mode": "airgap",                     // airgap | online
  "issuedAt": "2026-04-24T10:00:00Z",
  "notBefore": "2026-04-24T10:00:00Z",
  "expiresAt": "2027-04-24T10:00:00Z",  // для perpetual core — дата в 2099
  "gracePeriodDays": 14,

  "features": {
    "sso_oidc": true, "sso_saml": true,
    "api_access": true, "outbound_webhooks": true,
    "custom_screen_layouts": true,
    "kiosk_smart_eta": true, "kiosk_id_ocr": false,
    "kiosk_offline_mode": true, "kiosk_post_service_survey": true,
    "kiosk_employee_idp": true,
    "counter_guest_survey": true, "counter_board": true,
    "public_queue_widget": true,
    "advanced_reports": true, "multi_tenant": false,
    "white_label": false, "commerceml": false
  },
  "limits": {
    "companies": 1,
    "units": 50, "users": 500, "counters": 200,
    "services": 200, "tickets_per_month": -1, "zones_per_unit": 10
  },
  "hardware": {
    "fingerprintPolicy": "soft",        // off | soft | hard
    "fingerprints": []                   // если hard и пусто — pin при первом старте
  },
  "whiteLabel": { "enabled": false, "brandName": "", "logoSha256": "" },
  "heartbeat": {
    "required": true,
    "intervalHours": 24,
    "toleranceDays": 14,
    "endpoint": "https://license.quokkaq.io/v1/heartbeat"
  },
  "phoneHome": {
    "optIn": false,
    "endpoint": "https://telemetry.quokkaq.io/v1/usage"
  }
}
```

### 1.3 Криптографические решения

- **Алгоритм — Ed25519**: 32-байтный публичный ключ, детерминистические подписи, нет выбора параметров, stdlib.
- **Хранение приватного ключа на стороне vendor (M1)**: отдельный K8s Secret в license-server namespace + 1Password vault как sync-источник. **Upgrade-path (M2)** — YubiHSM или Yandex Cloud KMS / AWS KMS (по региону клиента).
- **Публичные ключи**: вкомпилены в backend через `embed.FS` в `apps/backend/internal/license/keys/`. **В каждом релизе лежат два ключа** — `active` и `next` (для окна rotation 6 мес). Аварийный override — через env `LICENSE_PUBLIC_KEYS_EXTRA` (PEM, несколько ключей через `\n\n`).
- **Rotation**: плановая, ежегодная. Аварийная — через выпуск нового public-ключа в patch-релизе.

### 1.4 Revocation

- **Online SKU**: CRL endpoint `GET /v1/crl` от license-сервера. Формат — JSON-список `licenseId` с Ed25519-подписью и `validUntil`. Кэшируется в Redis. Установка учитывает CRL при heartbeat.
- **Air-gap SKU**: revocation отсутствует **by design**. Риск принимается; митигируется (а) короткими сроками premium-подписок, (б) опциональным `hard` fingerprint policy, (в) perpetual-core семантикой "работаешь тем, что уже установлено".

---

## 2. Валидация лицензии и gating в backend

### 2.1 Новый пакет `apps/backend/internal/license/`

```
internal/license/
  types.go            // License, Features, Limits, Status структуры
  loader.go           // Чтение из LICENSE_FILE_PATH, SIGHUP reload
  verifier.go         // Ed25519 verify + schema + time + fingerprint
  fingerprint.go      // machine-id + MAC + CPU → SHA-256
  crl.go              // Fetch + cache (Redis, только online)
  heartbeat.go        // POST tick (только online)
  service.go          // Facade LicenseService — единая точка входа
  state.go            // Машина состояний NotActivated→Active→Grace→Expired|Revoked
  ui_status.go        // JSON для /platform/license admin endpoint
  keys/               // embed.FS: active.pem, next.pem
  keys.go             // Загрузка через embed + LICENSE_PUBLIC_KEYS_EXTRA
```

Интерфейс сервиса:

```go
type LicenseService interface {
    Capabilities() Capabilities
    Status() Status                // Active | Grace | Expired | Revoked | NotActivated
    Verify() error                 // deep re-verify (sig + clock + CRL)
    Reload(path string) error      // re-read с диска
    HasFeature(key string) bool
    GetLimit(key string) int
    HardwareFingerprint() string
}
```

### 2.2 Ключевая абстракция: `EntitlementsProvider`

Создаём новый пакет `apps/backend/internal/services/entitlements/`:

```go
type EntitlementsProvider interface {
    HasFeature(ctx context.Context, companyID, key string) (bool, error)
    GetLimit(ctx context.Context, companyID, metric string) (int, error)
}
```

Две реализации:

- `DBEntitlementsProvider` — обёртка над текущей логикой [`apps/backend/internal/services/plan_feature.go:50-70`](../../apps/backend/internal/services/plan_feature.go) и [`apps/backend/internal/services/quota_service.go:154-189`](../../apps/backend/internal/services/quota_service.go). SaaS-поведение не меняется.
- `LicenseEntitlementsProvider` — читает напрямую из `license.Service`.

Выбор реализации — при старте `cmd/api/main.go` на основе `DEPLOYMENT_MODE`. DI через существующий container (если нет — прямая передача в конструкторы services).

**Replacement map:**

| Текущий вызов | Что меняется |
|---|---|
| `plan_feature.go:CompanyHasPlanFeature(companyID, key)` | Проходит через `EntitlementsProvider.HasFeature` |
| `quota_service.go:GetLimit(companyID, metric)` | Проходит через `EntitlementsProvider.GetLimit` |
| `subscriptionfeatures/gates.go:CompanyHasAPIAccess` и др. | Те же ключи, через провайдер |

### 2.3 Startup sequence

В `apps/backend/cmd/api/main.go` после `config.Load()`:

1. Если `DEPLOYMENT_MODE=onprem` — `license.New(ctx, cfg)` **до** миграций БД. Fail fast с понятной ошибкой, если лицензия невалидна или отсутствует (кроме первого запуска — тогда `NotActivated` статус, backend поднимается в wizard-режиме).
2. Собираем `EntitlementsProvider` (license-based или db-based).
3. Инжектим в конструкторы сервисов, использующих фичи/лимиты.
4. Миграции БД.
5. HTTP-роуты, включая `license.Gate()` middleware и `/platform/license/*`.

### 2.4 Периодическая re-validация

- Goroutine с `time.Tick(1*time.Hour)`: re-read файла, re-verify signature, re-check `expiresAt`.
- `time.Tick(24*time.Hour)` jitter ±10 %: heartbeat (только `mode=online`).
- Fingerprint drift: при `policy=hard` — немедленно переход в `Revoked`; при `policy=soft` — только WARN в логе.

### 2.5 Middleware `license.Gate()`

Ставится после auth и **перед** mutating handlers в `/api/v1/*` и `/platform/*` (кроме `/system/*` wizard и `/health/*`):

- `Active` — пропускает без изменений.
- `Grace` — добавляет заголовок `X-License-ReadOnly: 1`; mutating endpoints возвращают `200` с предупреждающим payload, но админские действия (создание/удаление units, users) блокируются `402`.
- `Expired` — все write-endpoints возвращают `503 Service Unavailable` с `X-License-Status: expired`. Тикет-поток для конечных пользователей (kiosk) **никогда не блокируется** — клиенты в очереди не должны страдать от административной просрочки. Экспорт данных всегда доступен (GDPR-like).
- `Revoked` — сразу в read-only без grace.

### 2.6 Диаграмма состояний

```
 NotActivated ──activate──▶ Active
                              │
          ┌──(expiresAt)──────┤
          ▼                   │
        Grace ──(grace+N дней)─▶ Expired
          ▲                   │
          │                   └──(CRL match, online only)──▶ Revoked
          └──(apply new license)── Active
```

### 2.7 Multi-tenancy в on-prem

- **Default SKU**: `limits.companies = 1`. Единственный tenant бутстрапится как `is_saas_operator=true` — переиспользуем существующий short-circuit в [`apps/backend/internal/services/plan_feature.go:55-57`](../../apps/backend/internal/services/plan_feature.go).
- **Enterprise SKU** с `features.multi_tenant=true`: до `limits.companies` tenants в одном инстансе, operator-tenant управляет ими через `/platform` UI.
- Это оставляет SaaS-путь для tenants идентичным — различие только в том, что operator-tenant теперь находится на стороне клиента.

### 2.8 Hardware fingerprinting

Алгоритм в `license/fingerprint.go`:

1. `machine-id`: Linux `/etc/machine-id`, macOS `IOPlatformUUID`, Windows registry.
2. Первый non-loopback MAC (нижний регистр, без двоеточий).
3. CPU signature: `/proc/cpuinfo` → `vendor_id|family|model|stepping`.
4. `sha256(machine_id || "|" || mac || "|" || cpu)`.

**Политики:**

- `off` — не вычисляется.
- `soft` (default) — вычисляется, виден в UI, drift логируется.
- `hard` — должен совпасть с `license.hardware.fingerprints[]`. Если список пуст — первый старт биндит fingerprint в `/etc/quokkaq/license.fingerprint` (переезд = re-issue лицензии).

**Kubernetes caveat**: в pod `machine-id` = container's UID, не ноды. Для Helm deployments по умолчанию `soft`, `hard` поддерживается через DaemonSet-provided file или K8s cluster UID. Задокументировано в `values.yaml` Helm chart.

---

## 3. License Server (online SKU)

### 3.1 Размещение

**Не выделяем в отдельный сервис** — вливаем в существующий SaaS backend как пакет `apps/backend/internal/licensesrv/`, доступный только при `DEPLOYMENT_MODE=saas`. Обоснование:

- SaaS backend уже имеет Stripe/YooKassa, `/platform` админку, JWT auth, audit logs, rate limiting, object storage, SMTP.
- Отдельный сервис — 80 % duplication. Выделять в отдельный деплой — имеет смысл только при реальной нагрузке (M4+).

### 3.2 Новые endpoints

| Метод | Путь | Доступ | Назначение |
|---|---|---|---|
| `POST` | `/platform/licenses` | Admin | Создание лицензии (manual или из Stripe webhook) |
| `GET` | `/platform/licenses` | Admin | Список всех лицензий |
| `GET` | `/platform/licenses/{id}` | Admin | Детали + history |
| `POST` | `/platform/licenses/{id}/revoke` | Admin | Добавить в CRL |
| `POST` | `/platform/licenses/{id}/regenerate` | Admin | Перевыпуск (изменение лимитов/фич) |
| `POST` | `/v1/activate` | Public, rate-limited | Первичная активация по licenseId + fingerprint |
| `POST` | `/v1/heartbeat` | Public, rate-limited | Online-инстанс шлёт statistics + получает latestVersion + CRL rev |
| `GET` | `/v1/crl` | Public | Signed CRL list |
| `GET` | `/v1/artifacts/{sku}/{version}` | Public, signed URL | Скачивание update bundle |

### 3.3 Storage

Новые таблицы в существующем Postgres через `database.RunVersionedMigrations`:

- **`licenses`**: `id ULID`, `customer_id`, `sku`, `edition`, `mode`, `features JSONB`, `limits JSONB`, `issued_at`, `expires_at`, `status`, `revoked_at`, `stripe_subscription_id` nullable, `yookassa_subscription_id` nullable, `created_by`, `updated_at`.
- **`license_heartbeats`** (партиционирована помесячно): `license_id`, `install_id`, `fingerprint`, `version`, `received_at`, `ip`, `metrics JSONB`.
- **`license_issuance_log`**: `license_id`, `event`, `actor`, `at`, `notes` (для юридических споров).

### 3.4 Stripe / YooKassa integration

Расширяем существующие webhook handlers. Псевдокод логики для Stripe:

```
on invoice.payment_succeeded:
    sub := resolveSubscription(event)
    if sub.Product.Metadata["quokkaq_sku"] == "":
        return (обычная SaaS-логика, не трогаем)
    licensesrv.IssueOrRenewForSubscription(sub)
        → создать/обновить licenses row
        → сгенерировать .lic файл (signer)
        → положить в MinIO/S3 bucket "licenses/"
        → email customer pre-signed URL (template license-issued.tmpl)
```

Аналогично для YooKassa — zeркальный handler.

### 3.5 Failure modes

- **License server down во время heartbeat**: install остаётся в `Active` до `license.heartbeat.toleranceDays`, затем `Grace`. Vendor outage не роняет клиента.
- **Утечка приватного ключа**: emergency rotation — выпуск patch-релиза backend с новым `active.pem`, массовый revoke через CRL, email-оповещение всем online-клиентам.

---

## 4. Core vs Premium feature split

Единый источник истины — [`packages/subscription-pricing/src/plan-manifest.ts`](../../packages/subscription-pricing/src/plan-manifest.ts). Расширяем каждую запись полем `tier: 'core' | 'premium'`. Фронт pricing-UI, license-signer CLI и фичегейты backend читают тот же манифест.

| Фича / возможность | Tier | Обоснование |
|---|---|---|
| Ticket flow, counter/queue/unit management | **Core** | Сам продукт |
| Kiosk (basic screens, TTS, WebSocket) | **Core** | Без него киоск не продаётся |
| Local auth (email + password), invitations | **Core** | Минимум |
| Email/SMTP notifications | **Core** | Нет внешних зависимостей |
| Basic reports (дневные метрики) | **Core** | Тяжело gate-ить чисто |
| `public_queue_widget` | **Core** | Дешёвый дифференциатор |
| `sso_oidc`, `sso_saml` | **Premium** | Enterprise ask |
| `api_access` (текущий `CompanyHasAPIAccess`) | **Premium** | Maps 1:1 |
| `outbound_webhooks` | **Premium** | Maps 1:1 |
| `custom_screen_layouts` | **Premium** | Maps 1:1 |
| `kiosk_smart_eta`, `kiosk_id_ocr`, `kiosk_offline_mode`, `kiosk_post_service_survey` | **Premium** | Уже gated в коде |
| `kiosk_employee_idp` | **Premium** | HTTPS IdP |
| `counter_guest_survey`, `counter_board` | **Premium** | Отдельные подсистемы |
| Advanced analytics (anomalies, heatmaps, экспорты) | **Premium** | Оправдывает tier price |
| Multi-tenant (`limits.companies > 1`) | **Premium** | Enterprise SKU |
| White-label | **Premium** | См. §10 |
| CommerceML / 1C integration | **Premium** | Customer-specific value |
| Google / MS calendar integration | **Premium** | OAuth surface + premium support |

**Perpetual-core контракт**: после активации core работает forever. Истечение premium-подписки → premium-фичи скрываются в UI, backend возвращает `402 Payment Required` на mutating premium endpoints, но core ticket flow продолжает работать нормально.

---

## 5. Distribution artifacts (phased)

### 5.1 Phase 1 — Docker Compose bundle

Дерево `deploy/onprem/compose/`:

```
docker-compose.yml         # backend, frontend, worker, postgres, redis, minio(opt), otel(opt), jaeger(opt)
.env.template
install.sh                 # openssl rand secrets → .env → compose up → migrations → print first-login URL
upgrade.sh                 # cosign verify → docker load → migrations --dry-run → confirm → apply
backup.sh                  # pg_dump + volumes tarball
README.md                  # 10-минутный quickstart
SHA256SUMS
SHA256SUMS.sig             # cosign keyless
sbom.spdx.json             # syft
images/
  images.tar               # air-gap: docker save всех образов
  image-manifest.json      # online: pull by digest
```

**Image strategy:**

- **Air-gap bundle** — все образы в `images.tar` (~400–600 МБ gzipped). `install.sh` делает `docker load`.
- **Online bundle** — `image-manifest.json` с digest-ами, `install.sh` делает `docker pull` с fallback `ghcr.io/quokkaq/` → `cr.yandex/quokkaq/`.

**CI workflow `.github/workflows/release-onprem.yml`** (новый):

1. Trigger: tag `v*.*.*`.
2. Matrix: `[airgap, online] × [amd64, arm64]`.
3. Build images, syft SBOM, grype CVE scan (fail on critical без `apps/backend/internal/vulnpins/`).
4. `docker save` → `images.tar` (только airgap).
5. `SHA256SUMS` + `cosign sign-blob --yes` keyless OIDC.
6. `tar czf quokkaq-onprem-{sku}-{version}-{arch}.tar.gz`.
7. Attach to GitHub Release + опционально S3 mirror.

### 5.2 Phase 2 — Helm chart

Дерево `deploy/onprem/helm/quokkaq/`:

```
Chart.yaml
values.yaml
values.schema.json
templates/
  backend/       # Deployment, Service, HPA, PDB, NetworkPolicy, ConfigMap, Secret ref
  frontend/     # Deployment, Service, Ingress
  worker/       # Deployment (тот же image, другой CMD — Asynq worker)
  license/      # Secret (license.lic), projected volume mount /etc/quokkaq/license.lic:ro
  migrations/   # Job с pre-install и pre-upgrade hook, backoffLimit: 0
  telemetry/    # Optional Jaeger + OTel collector
  networkpolicies.yaml
  NOTES.txt
charts/
  postgresql/   # bitnami-postgresql (single-node default, HA subchart задокументирован)
  redis/        # bitnami-redis
  minio/        # bitnami-minio, optional (values.storage.local=true отключает)
externalsecrets-example.yaml  # для Vault / ESO
```

**Ключевые решения:**

- **License как Secret**: `kubectl create secret generic quokkaq-license --from-file=license.lic=./license.lic`; rotation — `helm upgrade --set-file license.fileContent=./new-license.lic`.
- **Migrations** — pre-install/pre-upgrade Job с `backoffLimit: 0` (fail-fast при schema mismatch).
- **NetworkPolicies** — default-deny egress; whitelist: DNS, Postgres, Redis, optional MinIO, optional `license.quokkaq.io` (в air-gap profile последний отсутствует).
- **OCI publish**: `oras push ghcr.io/quokkaq/charts/quokkaq:$version`.

### 5.3 Phase 3 — Ansible playbook

Дерево `deploy/onprem/ansible/`:

```
inventory/
  hosts.example.yml
group_vars/all.yml
playbooks/
  site.yml
  upgrade.yml
  backup.yml
roles/
  common/            # timezone, NTP, swap, ulimits
  postgres/          # systemd, TLS, tuned
  redis/             # systemd, requirepass
  minio/             # optional
  quokkaq-backend/   # binary install, systemd unit, secrets, healthcheck loop
  quokkaq-frontend/  # Node 22, standalone Next.js, systemd
  quokkaq-worker/    # systemd, asynq worker
  caddy/             # reverse-proxy + автоматический TLS (предпочтительнее nginx + certbot)
  certbot/           # fallback для nginx
molecule/            # podman-driver integration tests
README.md
```

Цель — клиенты, которые не используют Docker (часть госсектора, регулируемые отрасли с требованием systemd + SELinux). Follow-up в M4 — `.rpm` / `.deb` через `nfpm`.

---

## 6. Admin UX & setup flow

### 6.1 First-run wizard

Новый путь — `apps/frontend/app/[locale]/platform/setup/page.tsx`. Переиспользует существующий `apps/backend/internal/middleware/setup_token.go` и `deployment_setup_service.go`.

Шаги:

1. **License upload** — drag-and-drop `.lic` → `POST /system/license/activate`. Backend верифицирует, пишет в `LICENSE_FILE_PATH`, если директория writable; иначе показывает команду `docker cp ./license.lic backend:/etc/quokkaq/license.lic && docker compose restart backend`.
2. **Admin account** — переиспользуем `POST /system/setup`.
3. **SMTP configuration** — существующий `platform/integrations` SMTP-блок поднимается в wizard, обязателен test-email перед переходом дальше.
4. **Public URLs** — `APP_BASE_URL`, `PUBLIC_APP_URL`. Пишутся в config secret. Влияют на CORS и email-ссылки.
5. **Summary + go-live**.

Новые backend endpoints (за `SetupWizardTokenGate`):

- `POST /system/license/activate` — принимает PEM, вызывает `license.Verify`, пишет на диск, перезагружает сервис.
- `GET /system/license/status` — для возобновления wizard.

### 6.2 Admin page `/platform/license`

Новый путь — `apps/frontend/app/[locale]/platform/license/page.tsx`, доступен только `isPlatformAdmin`:

- **Панель 1**: Summary — customer, SKU, edition, mode, status badge, expires in N дней.
- **Панель 2**: Features matrix — список premium фич с on/off и ссылками на документацию.
- **Панель 3**: Limits vs usage — прогресс-бары (переиспользует `UsageMetricsSchema` из [`packages/shared-types/src/index.ts`](../../packages/shared-types/src/index.ts)).
- **Панель 4** (только online): Heartbeat status — last OK, next attempt, CRL revision.
- **Панель 5**: Apply new license — drag-and-drop, hot reload без рестарта.
- **Панель 6** (только online): Available update — показывается, когда `latestVersion > currentVersion`. Кнопка «Download bundle».
- **Панель 7**: Hardware fingerprint — для support-тикетов.

Backend endpoints под `/platform/license/*`:

| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/platform/license` | Полный статус (service.UI_Status()) |
| `POST` | `/platform/license/apply` | Загрузить новую лицензию |
| `POST` | `/platform/license/heartbeat-now` | Admin-trigger (online) |
| `GET` | `/platform/license/usage` | Текущий usage vs caps |

---

## 7. Updates & release pipeline

### 7.1 Versioning & changelog

- **Conventional commits** — уже частично в проекте, зафиксировать через commit-lint hook.
- **`release-please`** GitHub Action заменяет текущий [`release-changelog-preview.yml`](../../.github/workflows/release-changelog-preview.yml): каждый merge в `main` обновляет release PR с `CHANGELOG.md`. Тег `v1.2.3` триггерит downstream-пайплайны.
- **Operator-facing release notes** — `docs/releases/vX.Y.Z.md` (новая структура) с разделами "Upgrade steps", "Breaking changes", "Security fixes", "Known issues". Генерируется на основе CHANGELOG.

### 7.2 Bundle signing

- Все artifacts имеют `SHA256SUMS`.
- **cosign keyless OIDC** signing на identity `repo:quokkaq/quokkaq:refs/tags/v*`.
- Operator верифицирует через `cosign verify-blob --certificate-identity-regexp '...' SHA256SUMS.sig`.
- Images подписаны индивидуально через `cosign sign --yes`.

### 7.3 Air-gap update flow

1. Оператор скачивает `quokkaq-onprem-airgap-v1.3.0.tar.gz` из vendor portal (по pre-signed URL из email или из `/v1/artifacts` для online).
2. Uploads в admin UI — `/platform/license/updates/upload`.
3. Backend стримит загрузку в `/var/quokkaq/updates/tmp/`, запускает `cosign verify-blob`. Отклоняет с явной ошибкой при mismatch.
4. Validates manifest (`manifest.json` в bundle): `fromVersion`, `toVersion`, `schema` migrations, `requires.license.edition`.
5. **Staging** — extract в `/var/quokkaq/updates/v1.3.0-pending`. Backend **не** auto-applies.
6. Admin нажимает «Apply» → `RunVersionedMigrations --dry-run` → печатает plan → waits for confirmation → live migration.
7. `docker load` новых образов → `docker compose up -d` swap (или `helm upgrade` для Helm).

**Rollback path** — через backup restore. Миграции **forward-only** (правило в `CONTRIBUTING.md`): новые колонки nullable или с default; renames в два релиза.

### 7.4 Online auto-notify

- Heartbeat response включает `latestVersion`. Backend сохраняет → non-blocking banner в UI.
- **Никакой автоматической загрузки кода**. Download всегда gated admin-action. Это соответствует compliance expectations для on-prem.

### 7.5 Migration safety

- Расширяем `apps/backend/pkg/database/*migrations*` режимом `--dry-run` — печатает `ALTER` / `CREATE` без apply.
- Pre-upgrade check job: автоматический `pg_dump` в `/var/quokkaq/backups/pre-v{version}.sql.gz`.

---

## 8. Observability в on-prem

- **OTel полностью опциональный**: [`apps/backend/internal/telemetry/otel.go`](../../apps/backend/internal/telemetry/otel.go) — если `OTEL_EXPORTER_OTLP_ENDPOINT` пуст, no-op (сейчас есть fallback на fixed endpoint — убрать).
- **Self-hosted Jaeger + OTel collector** — optional compose service и Helm subchart. По умолчанию `false`.
- **Phone-home** (только online SKU, opt-in в лицензии):
  - Отправляется при heartbeat.
  - Payload: `{licenseId, version, fingerprint, uptimeHours, metrics:{units,users,counters,tickets_per_month_agg}, featureUsage:{sso_oidc:true, api_access:false, ...}}`.
  - Никаких PII, company names, IP адресов.
  - Хранится в `license_heartbeats.metrics JSONB` — используется Customer Success для upsell-сигналов.
- **`/health/license`** — новый endpoint: `{status, expiresIn, heartbeatAge, version}`. Для Prometheus blackbox exporter и Nagios probes.

---

## 9. Security & compliance

### 9.1 Secret generation

- `install.sh` генерит все обязательные secrets через `openssl rand -base64 48` в `.env`. Не в git, не в stdout, только хеши в лог.
- **Mandatory**: `JWT_SECRET`, `SSO_SECRETS_ENCRYPTION_KEY`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `MINIO_ROOT_PASSWORD` (если MinIO enabled).
- **Убрать fallback `default_secret_please_change`** в [`apps/backend/internal/middleware/auth.go:58`](../../apps/backend/internal/middleware/auth.go) для `APP_ENV != local`. Backend отказывается стартовать в `production`/`staging` без явного `JWT_SECRET`.

### 9.2 Air-gap hardening

Новый CI-lint `tools/airgap-check/`:

- `rg -n 'https?://' apps/backend apps/frontend packages/` с whitelist (heartbeat, CRL, OAuth, OTel collector). Остальные URL flagged.
- Аудит `next/font/google` → self-hosted `apps/frontend/public/fonts/`. Сейчас могут быть CDN imports — обязательный аудит в M1.
- `apps/frontend/next.config.ts`: проверка `Image.domains`, CSP `connect-src`.
- `pnpm` lockfile scan для пакетов с runtime-fetch (`next/font/google`, `react-use-cdn`).
- `STORAGE_DRIVER=local` для инсталляций без MinIO — нужен local-fs driver в storage_service (сейчас только S3-compat).

### 9.3 Tamper detection

- 1h periodic re-verification (signature + clock + CRL).
- Fingerprint drift: WARN при `soft`, state transition в `Revoked` при `hard`.
- `license_issuance_log` на vendor side — audit trail для юридических споров.

### 9.4 Supply chain

- **SBOM**: `syft` per image → SPDX JSON, published as release asset.
- **CVE scan**: `grype` + существующие `trivy` / `osv-scanner`. Fail gate на critical без записи в `apps/backend/internal/vulnpins/`.
- **gosec** — уже в CI, keep.
- **Container signing**: cosign keyless OIDC (§7.2).

### 9.5 Регуляторный путь (M4, out of primary scope)

- Цель — **ФСТЭК УД-4** (entry-level).
- Prereqs: GOST crypto fork (`go-gost`) для России, reproducible builds, RU-only fonts SKU, аудит cross-border dependencies.
- Отдельный план — `docs/plans/onprem-fstec-path.md` (future).

---

## 10. White-label: архитектурные хуки

Полная реализация — M4. В M1–M3 готовим почву:

- **Capability flag**: `license.whiteLabel.enabled` → экспонируется в `/auth/me` response.
- **Строки бренда**: мигрируем все inline `"QuokkaQ"` в [`apps/frontend/messages/en.json`](../../apps/frontend/messages/en.json) и [`ru.json`](../../apps/frontend/messages/ru.json) в новый namespace `brand.*`: `brand.name`, `brand.tagline`, `brand.supportEmail`, `brand.footer`. Компоненты используют `t('brand.name')`.
- **Theme config**: новый файл `apps/frontend/lib/theme/brand.ts` — читает `publicAppConfig.brand` от backend. Default — QuokkaQ colors и строки. Когда `whiteLabel.enabled` — admin может переопределить через `/platform/branding`.
- **Email templates**: `apps/backend/internal/services/email_templates.go` — абстрактный brand name и logo URL через template vars, не inline строки.
- **Favicon / manifest**: served from `/branding/*` — backend возвращает default QuokkaQ до override.
- **Branding endpoints** `/platform/branding`: stubs в M1–M3 (возвращают 501 + default), реализация в M4.
- **Документ расширения**: `docs/arch/white-label.md` — описывает точки расширения, TBD API, DO/DON'T для brand migration.

---

## 11. Roadmap

| Milestone | Длительность | Скоуп | Exit criteria |
|---|---|---|---|
| **M1 — MVP On-Prem** | 8–10 недель | License crypto + `internal/license` + `EntitlementsProvider` + `DEPLOYMENT_MODE` + `/platform/license` + setup wizard + Docker Compose bundle + `release-onprem.yml` + `tools/license-signer` CLI | End-to-end install на чистой VM < 15 мин. SaaS CI зелёный, zero regressions. Внутренний pilot-клиент в staging. |
| **M2 — Scalable + License Server** | 6–8 недель | Helm chart + bitnami subcharts + license server endpoints в SaaS backend + Stripe/YooKassa auto-issuance + heartbeat client + update-notify banner + cosign verify в admin upload + ARM64 | Mid-market клиент с online SKU auto-renews через Stripe. Helm chart прошёл `helm lint` и `helm test` в Kind cluster. |
| **M3 — Air-Gap + Ansible** | 4–6 недель | Ansible roles + molecule тесты + systemd + Caddy TLS + signed air-gap update bundles + admin upload/apply UI + `airgap-check` CI lint + multi-tenant SKU lifecycle | Air-gapped VM с `iptables DROP OUTPUT`: install → licensed → update cycle end-to-end. |
| **M4 — Strategic (future)** | — | White-label full implementation, ФСТЭК УД-4 path, `.rpm` / `.deb` через `nfpm`, single-binary (если появится рыночный спрос) | Отдельные планы per-track. |

---

## 12. Backward compatibility

- **`DEPLOYMENT_MODE=saas`** (default) — всё текущее поведение сохраняется. Нет изменений в SaaS code path.
- **`is_saas_operator=true`** short-circuit в [`apps/backend/internal/services/plan_feature.go:55-57`](../../apps/backend/internal/services/plan_feature.go) — остаётся. В on-prem operator-tenant получает unlimited **внутри лимитов лицензии** (которые применяются через `LicenseEntitlementsProvider`).
- **Stripe / YooKassa код нетронут**. В on-prem env-ключи не задаются → existing guards в [`apps/backend/cmd/api/main.go`](../../apps/backend/cmd/api/main.go) отключают payment providers автоматически.
- **Migration path SaaS → on-prem**:
  - Vendor CS запускает `tools/export-tenant --company-id=...` → signed `.qqbackup` (pg_dump filtered + MinIO objects).
  - On new on-prem install: `tools/import-tenant --file=tenant.qqbackup`.
  - Stripe subscription отменяется; выпускается matching лицензия с теми же features/limits.
  - Процедура — `docs/migration/saas-to-onprem.md` (новый).

---

## 13. Verification / test strategy

- **Unit tests** `apps/backend/internal/license/*_test.go`:
  - valid license → Active
  - wrong signature → verify error
  - expired license → Grace transition
  - not-yet-valid (`notBefore` в будущем) → startup error
  - fingerprint mismatch (soft) → WARN, не блокирует
  - fingerprint mismatch (hard) → Revoked
  - CRL match (online) → Revoked
  - grace period boundary → Expired после N дней
  - pubkey rotation (active + next) → обе лицензии valid
- **Integration test** `test/onprem/`:
  - GitHub Actions job.
  - `docker compose up` в network `--network none` (после pre-pull).
  - Headless chromium прогоняет setup wizard, создаёт ticket, проверяет JSON response.
- **Air-gap validation**: CI runs bundle в контейнере с `iptables -A OUTPUT -j DROP` после bootstrap → install completes → health passes → end-to-end ticket create → /export endpoints работают.
- **Upgrade test**: install v(N-1) → apply vN bundle → проверка, что public kiosk `/ws` и `/api/v1/tickets` без downtime > 10 сек (tolerate compose restart).
- **Expiry test**: issue short-lived лицензию (expires через 2 мин) → UI показывает Grace banner → через grace window переход в Expired с правильными 503-ами на admin endpoints.
- **Helm tests**: `helm unittest` + `helm test` в Kind (synthetic license via Secret).
- **Ansible molecule**: `molecule converge` + `molecule idempotence` для всех roles.

---

## 14. Критичные файлы

### Новые

- `apps/backend/internal/license/` — пакет целиком (types, verifier, loader, fingerprint, crl, heartbeat, state, service, keys/)
- `apps/backend/internal/services/entitlements/` — интерфейс `EntitlementsProvider` + `DBEntitlementsProvider` + `LicenseEntitlementsProvider`
- `apps/backend/internal/licensesrv/` — license server package (M2)
- `apps/frontend/app/[locale]/platform/license/page.tsx`
- `apps/frontend/app/[locale]/platform/setup/page.tsx`
- `deploy/onprem/compose/` — tree целиком (docker-compose.yml, install.sh, upgrade.sh, backup.sh, README.md, .env.template)
- `deploy/onprem/helm/quokkaq/` — Helm chart целиком (M2)
- `deploy/onprem/ansible/` — tree целиком (M3)
- `tools/license-signer/` — vendor CLI для выпуска `.lic`
- `tools/airgap-check/` — CI lint (M3)
- `.github/workflows/release-onprem.yml`
- `docs/arch/white-label.md`
- `docs/migration/saas-to-onprem.md`
- `docs/releases/vX.Y.Z.md` template

### Изменяемые

- [`apps/backend/cmd/api/main.go`](../../apps/backend/cmd/api/main.go) — bootstrap license service до миграций, mount `/system/license/*` и `/platform/license/*`, wire `license.Gate()` middleware
- [`apps/backend/internal/config/config.go`](../../apps/backend/internal/config/config.go) — `DEPLOYMENT_MODE`, `LICENSE_FILE_PATH`, `LICENSE_PUBLIC_KEYS_EXTRA`, `LICENSE_HEARTBEAT_ENABLED`, optional OTel endpoint
- [`apps/backend/internal/services/plan_feature.go`](../../apps/backend/internal/services/plan_feature.go) — через `EntitlementsProvider`
- [`apps/backend/internal/services/quota_service.go`](../../apps/backend/internal/services/quota_service.go) — через `EntitlementsProvider`
- `apps/backend/internal/subscriptionfeatures/gates.go` — через `EntitlementsProvider`
- [`apps/backend/internal/middleware/auth.go`](../../apps/backend/internal/middleware/auth.go) — убрать `default_secret_please_change` fallback для prod
- [`apps/backend/internal/telemetry/otel.go`](../../apps/backend/internal/telemetry/otel.go) — no-op если endpoint пуст
- `apps/backend/internal/services/stripe_webhook_handler.go` — extension для license auto-issuance
- Аналогичный YooKassa webhook handler
- [`packages/shared-types/src/index.ts`](../../packages/shared-types/src/index.ts) — `LicenseSchema`, `LicenseStatusSchema`, `LicenseCapabilitiesSchema`, extend `CompanyMeResponseSchema` полями `deploymentMode` + `license`
- [`packages/subscription-pricing/src/plan-manifest.ts`](../../packages/subscription-pricing/src/plan-manifest.ts) — добавить `tier: 'core' | 'premium'` для каждой фичи
- `apps/backend/pkg/database/*migrations*` — `--dry-run` mode
- [`apps/frontend/messages/en.json`](../../apps/frontend/messages/en.json), [`ru.json`](../../apps/frontend/messages/ru.json) — `brand.*` namespace (white-label hooks)

### Utilities для переиспользования

- [`apps/backend/internal/services/plan_feature.go:50-70`](../../apps/backend/internal/services/plan_feature.go) `CompanyHasPlanFeature` — становится `DBEntitlementsProvider.HasFeature`
- [`apps/backend/internal/services/quota_service.go:154-189`](../../apps/backend/internal/services/quota_service.go) `GetLimit` — становится `DBEntitlementsProvider.GetLimit`
- `apps/backend/internal/middleware/setup_token.go` + `deployment_setup_service.go` — первичный wizard
- `deploy/demo/` — стартовая точка для `deploy/onprem/compose/`
- Existing Stripe / YooKassa webhook handlers — extension points для auto-issuance
- `SSO_SECRETS_ENCRYPTION_KEY` + JWT infra — образец криптографического handling (но для license — чистый Ed25519)
- `is_saas_operator` flag on Company — operator-tenant marker в on-prem

---

## 15. Open risks & sales messaging

1. **Ed25519 vs ГОСТ** — блок для части госсектора. Митигация: M4 GOST crypto path (`go-gost` fork).
2. **K8s fingerprinting** — `hard` policy нереалистичен в кластерах из-за ephemeral pod machine-id. Default `soft`. Sales должны знать и объяснять.
3. **No revocation в air-gap** — by design. Sales должны указывать явно: air-gap = trust + expiration, не real-time revocation.
4. **`next/font/google` audit** — блокирующий pre-req для air-gap SKU в M1. Если какой-то компонент тянет Google Fonts CDN — self-hosted замена обязательна.
5. **OSS / source availability** — не решено: Apache 2.0 для core + BSL / commercial для premium? Это **legal / business решение** за рамками этого плана, но блокирует финальный релиз.
6. **Revenue cannibalization**: on-prem дешевле при больших масштабах → средние клиенты могут мигрировать из SaaS. Митигация через pricing (on-prem дороже per-unit в первый год, дешевле после) и через SLA (SaaS = 99.9%, on-prem = self-managed).

---

## Вне скоупа этого плана

- Конкретные цены SKU — legal / commercial sign-off.
- Контракты с resellers и white-label партнёрами.
- ФСТЭК / ФСБ сертификация — M4, отдельный план.
- Single-binary deployment — отложено.
- Полная реализация white-label — M4.
- Выделение license-server в отдельный микросервис — если и когда потребуется по нагрузке.

---

## Проверка перед merge (этого документа)

- [ ] Все ссылки `apps/backend/...` и `packages/...` — валидные пути.
- [ ] Нет TODO / TBD — все секции заполнены.
- [ ] Stakeholder review: product, engineering lead, sales engineering подтвердили Core/Premium split и SKU matrix.
- [ ] Legal review: модель лицензирования (Apache core + BSL/commercial premium?) одобрена юристом.
- [ ] Достаточно ли детализации для M1 implementation без доп-вопросов на созвоне.
- [ ] Коммит в ветку `docs/onprem-licensing-plan`, PR на ревью.

---

## Порядок работ

1. Approve этого документа (stakeholders + legal).
2. Создать подпланы M1 / M2 / M3 в `docs/plans/` по мере готовности каждой фазы: `onprem-licensing-m1-mvp.md`, `onprem-licensing-m2-helm-server.md`, `onprem-licensing-m3-airgap.md`.
3. Пример для M1: подплан детализирует Ed25519 signer CLI, точные схемы таблиц `licenses`, структуру первого Docker Compose bundle, wizard UX с скриншотами, acceptance criteria.
4. Implementation идёт по M1 → M2 → M3. Каждая фаза — своя ветка `feat/onprem-licensing-m{1,2,3}-...`, PR с zero regressions в SaaS.
