<div align="center">
  <img src="./quokka-logo.svg" alt="Маскот QuokkaQ" width="150"/>
  <h1>QuokkaQ Монорепозиторий</h1>
  <p><strong>Современная система управления очередями - Nx монорепо с Next.js, Go и Tauri</strong></p>
  
  [![Nx](https://img.shields.io/badge/Nx-22.6.1-143055?style=flat&logo=nx)](https://nx.dev/)
  [![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
  [![Go](https://img.shields.io/badge/Go-1.26+-00ADD8?style=flat&logo=go&logoColor=white)](https://golang.org/)
  [![pnpm](https://img.shields.io/badge/pnpm-10+-F69220?style=flat&logo=pnpm&logoColor=white)](https://pnpm.io/)
  [![Next.js](https://img.shields.io/badge/Next.js-16+-000000?style=flat&logo=next.js&logoColor=white)](https://nextjs.org/)
  [![Tauri](https://img.shields.io/badge/Tauri-2.1+-FFC131?style=flat&logo=tauri&logoColor=white)](https://tauri.app/)
  [![License](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)
</div>

---

## 📋 Содержание

- [Обзор](#обзор)
- [Архитектура](#архитектура)
- [Приложения](#приложения)
- [Пакеты](#пакеты)
- [Начало работы](#начало-работы)
- [Разработка](#разработка)
- [CI/CD](#cicd)
- [Развертывание](#развертывание)
- [Решение проблем](#решение-проблем)
- [Участие в разработке](#участие-в-разработке)
- [Лицензия](#лицензия)

---

## 🌟 Обзор

**QuokkaQ** — это комплексная современная система управления очередями, разработанная для организаций, которым необходимо эффективно управлять потоками клиентов в нескольких подразделениях. Построенная как Nx монорепозиторий, QuokkaQ объединяет мощь Next.js, Go и Tauri для обеспечения бесшовного опыта на веб, API и десктопных платформах.

### Что включено

- 🌐 **Веб-приложение** - Next.js 16 с React 19, TanStack Query и shadcn/ui
- 🔧 **API Backend** - Go 1.26 с PostgreSQL, Redis, WebSocket и MinIO
- 🖥️ **Киоск Desktop** - Tauri 2.1 десктоп-приложение с поддержкой термопринтеров
- 📦 **Общие пакеты** - TypeScript типы (Zod схемы), React UI компоненты и утилиты для киоска

### Ключевые возможности

- ✅ **Мультитенантность** - Управление несколькими подразделениями/филиалами из одной системы
- ✅ **Обновления в реальном времени** - WebSocket-уведомления для мгновенных обновлений очереди
- ✅ **Киоски самообслуживания** - Десктоп-приложение для выдачи талонов с интеграцией принтера
- ✅ **Управление персоналом** - Назначение окон, отслеживание смен и мониторинг производительности
- ✅ **Система бронирования** - Предварительная запись с управлением слотами
- ✅ **Экраны отображения** - Публичное табло очереди с вызовом талонов в реальном времени
- ✅ **Панель супервизора** - Комплексный надзор за работой подразделения
- ✅ **Приглашения пользователей** - Система email-шаблонов для онбординга
- ✅ **Интернационализация** - Полная поддержка английского и русского языков

---

## 🏗️ Архитектура

### Структура монорепозитория

```mermaid
graph TB
    subgraph monorepo [QuokkaQ Монорепо]
        subgraph apps [Приложения]
            frontend[Frontend<br/>Next.js 16 + React 19<br/>Порт 3000]
            backend[Backend<br/>Go 1.26 + PostgreSQL<br/>Порт 3001]
            kiosk[Kiosk Desktop<br/>Tauri 2.1 + Rust]
        end
        
        subgraph packages [Общие пакеты]
            sharedTypes[shared-types<br/>TypeScript типы + Zod]
            uiKit[ui-kit<br/>React компоненты]
            kioskLib[kiosk-lib<br/>Утилиты киоска]
        end
        
        frontend -->|использует| sharedTypes
        frontend -->|использует| uiKit
        
        kiosk -->|использует| sharedTypes
        kiosk -->|использует| uiKit
        kiosk -->|использует| kioskLib
        
        kioskLib -->|использует| sharedTypes
        
        frontend -->|HTTP/WS| backend
        kiosk -->|HTTP/WS| backend
    end
    
    subgraph infrastructure [Инфраструктура]
        postgres[(PostgreSQL)]
        redis[(Redis)]
        minio[(MinIO/S3)]
    end
    
    backend --> postgres
    backend --> redis
    backend --> minio
```

### Стек технологий

| Компонент | Технология | Версия |
|-----------|-----------|---------|
| **Монорепо** | Nx | 22.6.1 |
| **Менеджер пакетов** | pnpm | 10+ |
| **Node.js** | Node.js | 22+ |
| **Frontend** | Next.js | 16.2.1 |
| **Frontend UI** | React | 19.2.4 |
| **Стили** | Tailwind CSS | 4+ |
| **UI компоненты** | shadcn/ui (Radix) | Latest |
| **Backend** | Go | 1.26.0 |
| **Backend фреймворк** | Chi Router | v5 |
| **Desktop** | Tauri | 2.1+ |
| **База данных** | PostgreSQL | 16+ |
| **Кэш** | Redis | 7+ |
| **Хранилище** | MinIO/S3 | Latest |
| **Real-time** | WebSocket | Native |

---

## 📱 Приложения

### Frontend (`apps/frontend/`)

**Next.js веб-приложение** для администраторов и персонала.

**Возможности:**

- 👥 **Панель администратора** - Управление подразделениями, услугами, окнами, пользователями и настройками системы
- 🎫 **Панель сотрудника** - Вызов, обслуживание и завершение талонов на сервисных окнах
- 📊 **Панель супервизора** - Мониторинг производительности подразделения и статистики очереди
- 🖥️ **Интерфейс киоска** - Самообслуживание для выдачи талонов (веб-версия)
- 📺 **Экран отображения** - Публичное табло очереди с обновлениями в реальном времени
- 🌍 **Интернационализация** - Английская и русская локали с next-intl

**Технологии:**

- Next.js 16 (App Router)
- React 19
- TypeScript 6
- Tailwind CSS 4
- shadcn/ui (Radix UI)
- TanStack Query
- Framer Motion
- next-intl

**Порт:** `3000`

**Документация:** [apps/frontend/README.md](apps/frontend/README.md)

---

### Backend (`apps/backend/`)

**Go API сервер** с интеграцией PostgreSQL, Redis и MinIO.

**Возможности:**

- 🔐 **Аутентификация** - JWT-аутентификация с ролевым контролем доступа
- 🎫 **Управление очередью** - Создание, вызов, передача и завершение талонов
- 📡 **WebSocket в реальном времени** - Комнатная трансляция обновлений подразделений
- 🔄 **Фоновые задачи** - Асинхронная обработка задач с Asynq
- 📧 **Email-система** - Шаблонные email-уведомления
- 📦 **Файловое хранилище** - MinIO/S3-совместимое хранилище для логотипов и медиа
- 🔍 **API документация** - Интерактивная справка Scalar API
- 📝 **Аудит-логирование** - Комплексное отслеживание активности

**Технологии:**

- Go 1.26
- Chi Router v5
- PostgreSQL (GORM)
- Redis (Asynq)
- Gorilla WebSocket
- MinIO/AWS SDK v2
- gomail v2

**Порт:** `3001`

**Документация:** [apps/backend/README.md](apps/backend/README.md) | [apps/backend/README.ru.md](apps/backend/README.ru.md)

---

### Kiosk Desktop (`apps/kiosk-desktop/`)

**Tauri десктоп-приложение** для киосков самообслуживания с поддержкой термопринтеров.

**Возможности:**

- 🖨️ **Термопечать** - Прямая интеграция принтера через Go-агент
- 🔒 **Режим киоска** - Полноэкранный режим блокировки для публичных терминалов
- 🎯 **Сопряжение терминала** - Безопасная регистрация устройства через коды сопряжения
- 🌍 **Многоязычность** - Сохранение выбора языка для каждого терминала
- ⚡ **Устойчивость к отключениям** - Корректная обработка проблем с сетью
- 🔊 **Звуковая обратная связь** - Опциональные звуковые эффекты для взаимодействия

**Технологии:**

- Tauri 2.1 (Rust)
- React 19
- TypeScript
- Go 1.26 (агент для принтера)
- Протокол печати ESC/POS

**Документация:** [apps/kiosk-desktop/README.md](apps/kiosk-desktop/README.md)

---

## 📦 Пакеты

### `shared-types` (`packages/shared-types/`)

TypeScript типы и Zod схемы валидации, используемые frontend и kiosk приложениями.

**Содержимое:**

- Типы API запросов/ответов
- Доменные модели (Ticket, Service, Counter, Unit и т.д.)
- Zod схемы валидации
- Type guards и утилиты

**Использование:**

```typescript
import { Ticket, TicketStatus } from '@quokkaq/shared-types';
```

---

### `ui-kit` (`packages/ui-kit/`)

Переиспользуемые React UI компоненты на основе shadcn/ui и Radix UI примитивов.

**Содержимое:**

- Компоненты форм (Button, Input, Select и т.д.)
- Компоненты макета (Card, Dialog, Popover и т.д.)
- Кастомные компоненты (Logo, ThemeToggle и т.д.)
- Конфигурация Tailwind CSS

**Использование:**

```typescript
import { Button } from '@quokkaq/ui-kit';
```

---

### `kiosk-lib` (`packages/kiosk-lib/`)

Утилиты для киоска: WebSocket соединения, печать и таймеры.

**Содержимое:**

- Обёртка WebSocket клиента
- Утилиты термопринтера
- Управление таймерами и таймаутами
- Хуки и хелперы для киоска

**Использование:**

```typescript
import { usePrinter, useKioskTimer } from '@quokkaq/kiosk-lib';
```

---

### Зависимости пакетов

```text
frontend
├── @quokkaq/shared-types
└── @quokkaq/ui-kit

kiosk-desktop
├── @quokkaq/shared-types
├── @quokkaq/ui-kit
└── @quokkaq/kiosk-lib

kiosk-lib
└── @quokkaq/shared-types
```

Nx автоматически определяет эти зависимости и:

- Собирает пакеты в правильном порядке
- Разворачивает приложения при изменении их зависимостей
- Кэширует сборки для ускорения пересборки

---

## 🚀 Начало работы

### Требования

Перед запуском QuokkaQ убедитесь, что у вас установлено:

- **Node.js** 22+ ([Скачать](https://nodejs.org/))
- **pnpm** 10+ ([Установка](https://pnpm.io/installation))
- **Go** 1.26+ ([Скачать](https://golang.org/dl/)) - для backend
- **Rust** (stable) ([Установка](https://rustup.rs/)) - для kiosk-desktop
- **Docker** ([Скачать](https://www.docker.com/)) - для инфраструктурных сервисов

---

### Установка

Клонируйте репозиторий и установите зависимости:

```bash
# Клонировать репозиторий
git clone <repository-url>
cd quokkaq

# Установить все зависимости
pnpm install
```

---

### Быстрый старт

#### Вариант 1: Запуск полного стека локально

**1. Запустите инфраструктуру backend (PostgreSQL, Redis, MinIO):**

```bash
cd apps/backend
docker-compose up -d postgres redis minio
```

**2. Создайте файл `.env` для backend:**

```bash
# Из директории apps/backend/
cp .env.example .env
# Отредактируйте .env с вашей конфигурацией
```

> ⚠️ **ПРЕДУПРЕЖДЕНИЕ БЕЗОПАСНОСТИ**: Файл `.env.example` содержит примерные значения. **Замените все секреты на сильные, случайно сгенерированные значения** перед развертыванием в production. Никогда не коммитьте реальные секреты в систему контроля версий.

**3. Запустите backend API:**

```bash
# Из директории apps/backend/
go run cmd/api/main.go
```

Backend API будет доступен по адресу <http://localhost:3001>

- Документация API: <http://localhost:3001/swagger/>
- WebSocket: ws://localhost:3001/ws

**4. Создайте файл `.env.local` для frontend:**

```bash
# Создайте .env.local из шаблона
cp apps/frontend/env.local apps/frontend/.env.local
```

Шаблон содержит:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=http://localhost:3001
```

> **Примечание:** Файл `env.local` (без точки) — это шаблон, отслеживаемый в git. Файл `.env.local` (с точкой) — ваша локальная конфигурация, которая игнорируется git.

**5. Запустите frontend:**

```bash
pnpm nx dev frontend
```

Frontend будет доступен по адресу <http://localhost:3000>

**6. (Опционально) Запустите kiosk desktop:**

```bash
# Из корня workspace - Nx автоматически соберет агент и запустит dev сервер
pnpm nx dev kiosk-desktop
```

> **Примечание:** Для kiosk desktop требуется Rust toolchain. Команда `dev` автоматически собирает Go-агент перед запуском Tauri.

---

#### Вариант 2: Запуск отдельных приложений через Nx

```bash
# Только frontend
pnpm nx dev frontend

# Backend (требуется запущенная инфраструктура)
pnpm nx serve backend

# Kiosk Desktop
pnpm nx dev kiosk-desktop
```

---

## 🛠️ Разработка

### Запуск приложений

```bash
# Запустить все приложения в dev режиме
pnpm nx run-many -t dev

# Запустить конкретное приложение
pnpm nx dev frontend
pnpm nx serve backend
pnpm nx dev kiosk-desktop
```

---

### Сборка

```bash
# Собрать все проекты
pnpm nx run-many -t build --all

# Собрать только затронутые проекты (на основе git изменений)
pnpm nx affected -t build

# Собрать конкретное приложение
pnpm nx build frontend
pnpm nx build backend
```

---

### Тестирование

```bash
# Тестировать все проекты
pnpm nx run-many -t test --all

# Тестировать только затронутые
pnpm nx affected -t test

# Тестировать конкретное приложение
pnpm nx test frontend
```

---

### Линтинг

```bash
# Линтинг всех проектов
pnpm nx run-many -t lint --all

# Линтинг только затронутых
pnpm nx affected -t lint

# Линтинг с авто-исправлением
pnpm nx run-many -t lint --all --fix
```

---

### Команды Nx

#### Граф зависимостей

Визуализация зависимостей проектов:

```bash
pnpm nx graph
```

#### Управление кэшем

Nx кэширует результаты сборки для ускорения пересборки:

```bash
# Очистить Nx кэш
pnpm nx reset

# Показать детали проекта
pnpm nx show project <имя-проекта>
```

#### Определение затронутых проектов

Посмотрите, что затронуто вашими изменениями:

```bash
# Показать затронутые проекты
pnpm nx show projects --affected

# Запустить команды только на затронутых проектах
pnpm nx affected -t test
pnpm nx affected -t build
pnpm nx affected -t lint
```

---

## 🔄 CI/CD

### Автоматизированные процессы

Монорепозиторий использует Nx affected detection для интеллектуального развертывания только измененных приложений.

#### 1. **CI Workflow** (`.github/workflows/ci.yml`)

Запускается при каждом PR и push в `main`:

- Линтинг, тестирование и сборка только затронутых проектов
- Использует Nx кэш для ускорения сборки
- Валидирует качество кода и типобезопасность

#### 2. **Deploy Frontend** (`.github/workflows/deploy-frontend.yml`)

Запускается при push в ветку **`release`**, если менялись `apps/frontend/` или `packages/`:

- Автоматически повышает версию в `apps/frontend/package.json`
- Собирает Docker-образ с Next.js standalone выводом
- Отправляет в Yandex Container Registry
- Разворачивает на Yandex Cloud VM
- Создает git тег: `vX.Y.Z-frontend`

#### 3. **Deploy Backend** (`.github/workflows/deploy-backend.yml`)

Запускается при push в **`release`**, если менялся `apps/backend/`:

- Повышает версию в `apps/backend/VERSION`
- Собирает Go-бинарник в Docker
- Отправляет в Yandex Container Registry
- Разворачивает на Yandex Cloud VM
- Создает git тег: `vX.Y.Z-backend`

#### 4. **Release Kiosk** (`.github/workflows/release-kiosk.yml`)

Запускается при push в **`release`**, если менялись `apps/kiosk-desktop/` или `packages/`:

- Повышает версию в `package.json`, `Cargo.toml` и `tauri.conf.json`
- Собирает для macOS, Windows и Linux параллельно
- Создает GitHub Release с инсталляторами
- Создает git тег: `vX.Y.Z-kiosk`

---

### Стратегия версионирования

Версии повышаются автоматически на основе commit сообщений:

| Commit сообщение | Повышение версии |
|------------------|------------------|
| `[major]` или `BREAKING CHANGE` | Major (1.0.0 → 2.0.0) |
| `[minor]` или `feat:` | Minor (1.0.0 → 1.1.0) |
| По умолчанию | Patch (1.0.0 → 1.0.1) |

**Типичный процесс:** изменения вливаются в `main` через pull request. Когда готовы к выкладке, влейте `main` в **`release`** (отдельный PR). Тип bump берётся из **последнего коммита на `release`** (часто merge commit): укажите в сообщении merge `[minor]`, `feat:` или `BREAKING CHANGE`, если нужен не только patch.

---

### Независимое версионирование

Каждое приложение поддерживает свою собственную версию:

- **Frontend**: `apps/frontend/package.json`
- **Backend**: `apps/backend/VERSION`
- **Kiosk**: `apps/kiosk-desktop/package.json`

Git теги следуют паттерну: `v1.2.3-frontend`, `v1.2.3-backend`, `v1.2.3-kiosk`

Это позволяет разворачивать приложения независимо без ненужных повышений версий.

---

## 🚢 Развертывание

### Docker развертывание

#### Backend с Docker Compose

Самый простой способ запустить backend стек:

```bash
cd apps/backend

# Запустить все сервисы (PostgreSQL, Redis, MinIO, Backend)
docker-compose up -d

# Просмотр логов
docker-compose logs -f backend

# Остановить все сервисы
docker-compose down

# Остановить и удалить volumes (чистый старт)
docker-compose down -v
```

После запуска сервисы будут доступны по адресам:

- **API**: <http://localhost:3001>
- **Документация API**: <http://localhost:3001/swagger/>
- **MinIO консоль**: <http://localhost:9001>
  - ⚠️ **СТАНДАРТНЫЕ УЧЕТНЫЕ ДАННЫЕ (ТОЛЬКО ДЛЯ РАЗРАБОТКИ)**: `minioadmin/minioadmin`
  - **НЕ ИСПОЛЬЗУЙТЕ В ПРОДАКШН** - Немедленно смените эти учетные данные в production окружении

#### Сборка Frontend Docker

```bash
cd apps/frontend

# Собрать production образ
docker build -t quokkaq-frontend .

# Запустить с переменными окружения
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=http://localhost:3001 \
  -e NEXT_PUBLIC_WS_URL=http://localhost:3001 \
  quokkaq-frontend
```

---

### Продакшн рекомендации

- ✅ Использовать reverse proxy (Nginx, Traefik)
- ✅ Включить HTTPS/TLS для всех endpoints
- ✅ Настроить CORS для вашего frontend домена
- ✅ Настроить бэкапы и репликацию базы данных
- ✅ Настроить агрегацию логов (ELK, Grafana Loki)
- ✅ Использовать управляемые сервисы Redis и PostgreSQL
- ✅ Настроить health check endpoints
- ✅ Настроить rate limiting на API endpoints
- ✅ Использовать среде-специфичные `.env` файлы
- ✅ Внедрить мониторинг (Prometheus, Grafana)
- ✅ Настроить алерты для критических ошибок

---

### Переменные окружения

#### Frontend (`.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=http://localhost:3001
```

#### Backend (`.env`)

> ⚠️ **ПРЕДУПРЕЖДЕНИЕ БЕЗОПАСНОСТИ**: Это **примерные значения только для локальной разработки**. В production:
> - Сгенерируйте сильные случайные секреты для `JWT_SECRET` (используйте `openssl rand -base64 32`)
> - Используйте безопасные пароли для всех сервисов (PostgreSQL, Redis, MinIO, SMTP)
> - Никогда не используйте стандартные учетные данные типа `postgres/postgres` или `minioadmin/minioadmin`
> - Храните секреты в защищенном хранилище (HashiCorp Vault, AWS Secrets Manager и т.д.) или в переменных окружения
> - Регулярно меняйте учетные данные

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/quokkaq?sslmode=disable
PORT=3001
APP_BASE_URL=http://localhost:3000
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_REGION=us-east-1
AWS_S3_BUCKET=quokkaq-materials
AWS_ENDPOINT=http://localhost:9000
REDIS_URL=redis://localhost:6379/0
JWT_SECRET=your-super-secret-key
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
```

Для полных примеров конфигурации см.:

- Frontend: `apps/frontend/env.local` (шаблон - скопируйте в `.env.local`)
- Backend: `apps/backend/.env.example`

---

### Необходимые GitHub Secrets

Для автоматического развертывания настройте эти секреты:

- `YC_SA_JSON_CREDENTIALS` - JSON ключ сервисного аккаунта Yandex Cloud
- `YC_REGISTRY_ID` - ID Yandex Container Registry
- `VM_HOST` - Хост сервера развертывания
- `VM_USERNAME` - Имя пользователя сервера развертывания
- `VM_SSH_KEY` - SSH приватный ключ для развертывания
- `NEXT_PUBLIC_API_URL` - URL API для frontend
- `NEXT_PUBLIC_WS_URL` - URL WebSocket для frontend
- Переменные окружения backend (POSTGRES_PASSWORD, REDIS_PASSWORD и т.д.)

---

## 🔧 Решение проблем

### Проблемы с Nx кэшем

Очистите Nx кэш если столкнулись с устаревшими сборками:

```bash
pnpm nx reset
```

---

### Проблемы с зависимостями

Переустановите все зависимости:

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install
```

---

### Ошибки сборки

Соберите пакеты в правильном порядке:

```bash
# Сначала соберите общие пакеты
pnpm nx run-many -t build --projects=shared-types,ui-kit,kiosk-lib

# Затем соберите приложения
pnpm nx run-many -t build --projects=frontend,backend,kiosk-desktop
```

---

### Проблемы с Docker

Если Docker контейнеры не запускаются:

```bash
cd apps/backend

# Остановить и удалить контейнеры
docker-compose down -v

# Перезапустить сервисы
docker-compose up -d postgres redis minio
```

---

### Конфликты портов

Если порты уже заняты:

```bash
# Проверить что использует порт 3000 (frontend)
lsof -i :3000

# Проверить что использует порт 3001 (backend)
lsof -i :3001

# Убить процесс если нужно
kill -9 <PID>
```

---

## 🤝 Участие в разработке

Мы приветствуем вклад! Пожалуйста, следуйте этим рекомендациям:

### Рекомендации по разработке

1. **Стиль кода**
   - Следуйте существующим соглашениям кода
   - Используйте TypeScript для всего frontend/kiosk кода
   - Следуйте best practices Go для backend
   - Запускайте форматтеры перед коммитом

2. **Тестирование**
   - Пишите тесты для новых функций
   - Убедитесь что существующие тесты проходят
   - Запустите `pnpm nx affected -t test`

3. **Pull Requests**
   - Создайте feature ветку от `main`
   - Делайте фокусированные, атомарные коммиты
   - Пишите понятные commit сообщения
   - Обновляйте документацию при необходимости
   - Запросите ревью у мейнтейнеров

4. **Commit сообщения**
   - Используйте формат conventional commits
   - Включайте scope когда применимо
   - Примеры:
     - `feat(frontend): добавить страницу профиля пользователя`
     - `fix(backend): исправить логику статуса талона`
     - `docs: обновить инструкции установки`

### Процесс PR

1. Форкните репозиторий
2. Создайте feature ветку (`git checkout -b feature/amazing-feature`)
3. Внесите изменения
4. Запустите тесты и линтинг
5. Закоммитьте изменения (`git commit -m 'feat: добавить классную функцию'`)
6. Отправьте в ветку (`git push origin feature/amazing-feature`)
7. Откройте Pull Request

CI автоматически:

- Протестирует только затронутые проекты
- Запустит линтинг и проверку типов
- Соберет затронутые приложения
- Сообщит статус проверок

После merge в `main` на транке проходит CI. Чтобы развернуть приложения или выпустить киоск, влейте `main` в **`release`** — тогда сработают релизные workflow (bump, теги, деплой).

---

## 📄 Лицензия

Этот проект является проприетарным программным обеспечением. **Все права защищены.**

Исходный код предоставляется для просмотра и оценки только. Любое использование, модификация или распространение требует явного письменного разрешения от правообладателя.

Для получения полных условий лицензии см.:
- Корневая лицензия: [LICENSE](LICENSE) | [LICENSE.ru](LICENSE.ru)
- Лицензии приложений: [Frontend](apps/frontend/LICENSE) | [Backend](apps/backend/LICENSE) | [Kiosk](apps/kiosk-desktop/LICENSE)

---

## 🙏 Благодарности

### Frontend

- Построен с [Next.js](https://nextjs.org/)
- UI компоненты от [shadcn/ui](https://ui.shadcn.com/)
- Стилизация с [Tailwind CSS](https://tailwindcss.com/)

### Backend

- Построен с [Chi Router](https://github.com/go-chi/chi)
- WebSockets от [Gorilla WebSocket](https://github.com/gorilla/websocket)
- Database ORM от [GORM](https://gorm.io/)
- Фоновые задачи с [Asynq](https://github.com/hibiken/asynq)

### Desktop

- Построен с [Tauri](https://tauri.app/)
- Работает на [Rust](https://www.rust-lang.org/)

### Монорепо

- Управляется [Nx](https://nx.dev/)
- Менеджмент пакетов от [pnpm](https://pnpm.io/)

---

## 📚 Дополнительные ресурсы

- [Документация Frontend](apps/frontend/README.md)
- [Документация Backend](apps/backend/README.md) | [Русская](apps/backend/README.ru.md)
- [Документация Kiosk](apps/kiosk-desktop/README.md)
- [Чеклист миграции](MIGRATION-CHECKLIST.md)
- [Руководство по настройке](SETUP.md)

---

<div align="center">
  <p>Сделано ❤️ Владиславом Богатырёвым</p>
  <img src="./logo-text.svg" alt="QuokkaQ" width="120"/>
</div>
