# QuokkaQ SaaS — инфраструктура и контуры

Техническая сводка по развёртыванию: компоненты, контуры **demo** / **stage** / **prod** (продуктовый стек) и отдельно **маркетинг** (только **prod**). Биллинг и платежи см. [BILLING.md](./BILLING.md).

В репозитории прод описан через **Docker Compose** на VM, а не через Kubernetes; ниже «поды» используются как удобная аналогия к репликам в K8s или долгоживущим контейнерам.

---

## Логические компоненты (полный перечень)

| Компонент | Роль | Где в репозитории / артефакт |
|-----------|------|------------------------------|
| **PostgreSQL** | Основная БД приложения | Сервис `postgres` в [`apps/backend/docker-compose.prod.yml`](../../apps/backend/docker-compose.prod.yml) (и dev — [`apps/backend/docker-compose.yml`](../../apps/backend/docker-compose.yml)) |
| **Redis** | Очереди и фоновые задачи | `redis` в backend Compose |
| **MinIO** | S3-совместимое объектное хранилище (материалы, файлы) | `minio` в backend Compose |
| **minio-init** | Создание бакета и политики доступа (одноразовый сценарий) | `minio-init` в backend Compose |
| **Backend API** | Go API, биллинг, WebSocket и т.д. | `backend` в backend Compose; образ из container registry |
| **Traefik** | Reverse proxy, TLS (Let’s Encrypt), маршрутизация к API, MinIO, frontend | Отдельный сервис `traefik` в **обоих** prod compose-файлах (backend и frontend) |
| **Frontend (продукт)** | Next.js веб-приложение | `frontend` в [`apps/frontend/docker-compose.prod.yml`](../../apps/frontend/docker-compose.prod.yml) |
| **Маркетинг** | Публичный лендинг (Next.js), тарифы с API, лиды | Код: [`apps/marketing`](../../apps/marketing). **Не** входит в текущие `docker-compose.prod.yml`; деплой отдельно (контейнер, PaaS и т.п.). Контуры: **только prod** (см. раздел ниже). |

**Важно по топологии:** в prod в репозитории заданы **два** compose-файла, в каждом свой **Traefik** на портах 80/443. Их нужно разносить по **разным хостам** (или объединять в один compose с одним Traefik и явными маршрутами — вручную, с единым reverse proxy).

---

## Терминология: «поды» и реплики

| Термин в документе | Значение |
|--------------------|----------|
| **Под / реплика (steady state)** | Один долгоживущий инстанс stateless-сервиса (`backend`, `frontend`, `traefik`) или один инстанс stateful (`postgres`, `redis`, `minio`) в модели «один контейнер ≈ один под» в Kubernetes. |
| **Kubernetes** | В манифестах это соответствовало бы `Deployment`/`StatefulSet` и полю `replicas`. |
| **minio-init** | Задача типа **Job/CronJob**: после успешного завершения в running-кластере **0** реплик. |

---

## Продуктовый стек: матрица по контурам

Ниже — ориентиры для планирования ёмкости. Фактические лимиты зависят от нагрузки, SLA и региона.

### Контур **demo**

| Критерий | Минимальный | Оптимальный |
|----------|-------------|-------------|
| **Назначение** | Демо для продаж/презентаций, низкая стоимость | Более стабильное демо, запас по ресурсам |
| **Узлы** | 1 VM (возможно совмещённый frontend+backend **только** при одном ingress/reverse proxy и согласованных маршрутах) | 2 VM: отдельно стек API+данные и стек UI — ближе к prod |
| **Backend-стек (в т.ч. PostgreSQL, Redis, MinIO, API, Traefik)** | 4 vCPU, 8 GB RAM, 40 GB диск (условно один узел) | 4–8 vCPU, 16 GB RAM, 80 GB+ диск или разнесение stateful на отдельный узел |
| **Frontend-стек (продукт + Traefik)** | Если на отдельной VM: 2 vCPU, 4 GB RAM, 20 GB диск | 2–4 vCPU, 8 GB RAM, 40 GB диск |
| **Реплики (поды) backend** | 1 | 1–2 (за балансировщиком, если 2+ узла API) |
| **Реплики frontend** | 1 | 1–2 |
| **PostgreSQL / Redis / MinIO** | По 1 инстансу (в составе demo) | Как в минимальном; при росте — вынести в managed/отдельные узлы (целевое **оптимальное**, не обязательство текущего compose) |
| **Traefik** | 1 на хост с публичным ingress | 1 на каждый публичный ingress-узел |
| **Внешние зависимости** | SMTP можно упростить (тестовый ящик / mock); Stripe — тестовые ключи; DNS/TLS по месту | Как prod-подобная схема, тестовые ключи процессора |

Автоматическое обновление образов демо-стека на VM (без сброса БД): GitHub Actions — [`.github/workflows/deploy-demo.yml`](../../.github/workflows/deploy-demo.yml); подробнее — [`deploy/demo/README.md`](../../deploy/demo/README.md) и [`apps/backend/docs/DEMO_DEPLOYMENT.md`](../../apps/backend/docs/DEMO_DEPLOYMENT.md).

### Контур **stage**

| Критерий | Минимальный | Оптимальный |
|----------|-------------|-------------|
| **Назначение** | Предпрод: регрессия, интеграции, копия схемы prod | Тот же контур с запасом и наблюдаемостью |
| **Узлы** | 2 VM: backend- и frontend-стеки разделены (как в целевой prod-топологии) | 2+ VM или те же 2 с большим CPU/RAM |
| **Backend-стек** | 2 vCPU, 8 GB RAM, 60 GB диск | 4–8 vCPU, 16 GB RAM, 100 GB+ диск |
| **Frontend-стек** | 2 vCPU, 4 GB RAM, 30 GB диск | 4 vCPU, 8 GB RAM, 40 GB диск |
| **Реплики backend / frontend** | 1 / 1 | 1–2 / 1–2 при необходимости нагрузочных прогонов |
| **Данные** | Тестовые, изолированные от prod | Регулярное обновление, синтетические данные или клон по политике команды |
| **Внешние зависимости** | SMTP (stage), Stripe test mode, отдельные URL от prod | Мониторинг/алерты, секреты вне репозитория |

### Контур **prod**

| Критерий | Минимальный | Оптимальный |
|----------|-------------|-------------|
| **Назначение** | Рабочая конфигурация как в [`docker-compose.prod.yml`](../../apps/backend/docker-compose.prod.yml) (single-node на VM) | Отказоустойчивость, масштабирование, управляемые сервисы |
| **Узлы** | VM под backend-стек + VM под frontend-стек (типично); см. [yandex-cloud-setup.md](../../apps/backend/docs/yandex-cloud-setup.md) (ориентир **≥2 vCPU, ≥4 GB RAM, ≥20 GB** диска на узел — минимум из документа) | Несколько зон/узлов, внешний L7/L4 load balancer |
| **Backend-стек** | По одному инстансу: `postgres`, `redis`, `minio`, `backend`, `traefik`; `minio-init` — до успешного exit | Managed PostgreSQL; Redis с репликацией / managed; объектное хранилище (S3-совместимое облако или кластер MinIO); **2+** реплики `backend` за балансировщиком |
| **Frontend-стек** | `frontend` (1), `traefik` (1) | **2+** реплики frontend за балансировщиком; отдельный edge при необходимости |
| **Реплики (ориентир steady state)** | Backend API: **1**; Frontend: **1**; DB/Redis/MinIO: **1** каждый; Traefik: **1** на каждый из двух хостов (backend VM и frontend VM) | Backend: **2+**; Frontend: **2+**; stateful — по политике HA (кластер/managed) |
| **Наблюдаемость и эксплуатация** | Базовые health (`/health/live` и т.д.), бэкапы по регламенту команды | Централизованные логи, метрики, алерты, проверки бэкапов и восстановления |

**Целевые улучшения (оптимальный prod), не зашитые в текущий compose:** георезервирование, отдельные кластеры БД, секреты в KMS, WAF по политике безопасности.

---

## Маркетинг (только prod)

Отдельные контуры **demo** и **stage** для маркетинга **не предусмотрены**: лендинг разворачивается сразу в **prod**.

| Критерий | Минимальный | Оптимальный |
|----------|-------------|-------------|
| **Компонент** | Next.js приложение [`apps/marketing`](../../apps/marketing) | То же |
| **Реплики / поды** | 1 инстанс (один контейнер или один инстанс PaaS) | 2+ за балансировщиком / edge |
| **Ресурсы (ориентир)** | 1–2 vCPU, 2 GB RAM на инстанс | 2 vCPU, 4 GB RAM на реплику; горизонтальное масштабирование по нагрузке |
| **Связь с API** | Серверные запросы к API прод-контура (тарифы и публичные эндпоинты); переменные окружения — см. [`apps/marketing/.env.example`](../../apps/marketing/.env.example) (`MARKETING_API_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, канонический URL сайта) | Кэширование ответов API (например, `revalidate` для server fetch), CDN для статики и страниц, мониторинг доступности |
| **TLS и домен** | HTTPS, отдельный домен лендинга | CDN с TLS на edge, корректные `NEXT_PUBLIC_MARKETING_SITE_URL` / metadata для SEO |

CORS на API должен разрешать origin маркетингового сайта; детали контракта API — в правилах приложения (в т.ч. Orval и тег `subscriptions`).

---

## Кратко о различиях контуров (продукт)

- **demo** — минимальная стоимость, часто один узел; объединение frontend и backend на одной машине допустимо только с **одним** reverse proxy и явной маршрутизацией (иначе конфликт двух Traefik на 80/443).
- **stage** — изолированное от prod окружение, та же **логическая** наборка сервисов, меньше ресурсов и обычно по **1** реплике stateless; тестовые данные и ключи процессора (test mode).
- **prod** — эталон для клиентов; текущий репозиторий задаёт single-replica compose на VM; **оптимальный** вариант подразумевает HA, managed data plane и несколько реплик приложения за балансировщиком.

---

## Ссылки

| Документ / артефакт | Назначение |
|---------------------|------------|
| [`apps/backend/docker-compose.prod.yml`](../../apps/backend/docker-compose.prod.yml) | Prod backend: БД, Redis, MinIO, API, Traefik |
| [`apps/frontend/docker-compose.prod.yml`](../../apps/frontend/docker-compose.prod.yml) | Prod продуктовый frontend и Traefik |
| [`apps/backend/docs/yandex-cloud-setup.md`](../../apps/backend/docs/yandex-cloud-setup.md) | Пример настройки VM и registry под деплой |
| [`apps/backend/docs/DEPLOYMENT.md`](../../apps/backend/docs/DEPLOYMENT.md) | Автоматизированный деплой backend (CI) |
| [`apps/marketing/.env.example`](../../apps/marketing/.env.example) | Переменные маркетинга для prod |
