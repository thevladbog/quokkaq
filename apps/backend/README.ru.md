# QuokkaQ Go Backend - Документация на русском

<div align="center">
  <img src="./quokka-logo.svg" alt="QuokkaQ Logo" width="150"/>
  <h1>QuokkaQ Go Backend</h1>
  <p><strong>Высокопроизводительный бэкенд системы управления очередями на Go</strong></p>
</div>

---

## 📋 Содержание

- [Обзор](#-обзор)
- [Возможности](#-возможности)
- [Архитектура](#-архитектура)
- [Требования](#-требования)
- [Установка](#-установка)
- [Конфигурация](#-конфигурация)
- [Запуск приложения](#-запуск-приложения)
- [API документация](#-api-документация)
- [Разработка](#-разработка)
- [Структура проекта](#-структура-проекта)

---

## 🌟 Обзор

**QuokkaQ** - это современная, масштабируемая система управления очередями, разработанная для организаций, которым необходимо эффективно управлять потоками клиентов в нескольких подразделениях. Бэкенд построен на Go для обеспечения высокой производительности и надежности.

### Ключевые возможности

- **Мультитенантность**: Управление несколькими подразделениями/филиалами из одной системы
- **Обновления в реальном времени**: WebSocket-уведомления для мгновенных обновлений очереди
- **Гибкая настройка услуг**: Иерархические услуги с настраиваемыми рабочими процессами
- **Управление персоналом**: Назначение окон, отслеживание смен и мониторинг производительности
- **Система бронирования**: Интеграция предварительных записей
- **Интеграция с киоском и табло**: API для киосков самообслуживания и экранов отображения очереди
- **Email уведомления**: Система шаблонов email с управлением приглашениями
- **Файловое хранилище**: MinIO/S3-совместимое хранилище для логотипов и медиафайлов

---

## ✨ Возможности

### Основной функционал

- ✅ **Управление очередью**: Создание, вызов, перенос и завершение талонов с отслеживанием статуса
- ✅ **Настройка услуг**: Иерархическое дерево услуг с пользовательскими префиксами
- ✅ **Управление окнами**: Назначение персонала на окна, отслеживание занятости
- ✅ **Уведомления в реальном времени**: WebSocket hub для живых обновлений табло и панелей персонала
- ✅ **Управление сменами**: Отслеживание смен, генерация статистики, операции закрытия дня
- ✅ **Система приглашений**: Регистрация пользователей по токену с email-шаблонами
- ✅ **Аудит-логирование**: Комплексное отслеживание активности для соответствия требованиям
- ✅ **Управление доступом**: Гибкая система разрешений для пользователей

---

## 🏗️ Архитектура

### Слоистая архитектура

```
┌─────────────────────────────────────────┐
│       HTTP Обработчики (Handlers)       │  ← REST API Endpoints
├─────────────────────────────────────────┤
│          Слой сервисов (Services)       │  ← Бизнес-логика
├─────────────────────────────────────────┤
│      Слой репозиториев (Repository)     │  ← Доступ к данным
├─────────────────────────────────────────┤
│      База данных (PostgreSQL)           │  ← Хранение данных
└─────────────────────────────────────────┘

      ┌──────────────┐     ┌──────────────┐
      │  WebSocket   │     │ Фоновые      │
      │     Hub      │     │  задачи      │
      └──────────────┘     └──────────────┘
```

### Стек технологий

| Компонент | Технология |
|-----------|-----------|
| **Язык** | Go 1.26.2 |
| **Web Framework** | Chi Router v5 |
| **База данных** | PostgreSQL (через GORM) |
| **Real-time** | Gorilla WebSocket |
| **Аутентификация** | JWT (golang-jwt/jwt) |
| **Фоновые задачи** | Asynq (на базе Redis) |
| **Хранилище** | AWS SDK v2 (MinIO/S3) |
| **Email** | gomail v2 |
| **API Docs** | Swagger → Scalar API Reference |

---

## 📦 Требования

Перед запуском QuokkaQ Backend убедитесь, что у вас установлены:

- **Go** 1.26.2 или выше
- **PostgreSQL** 16+ (нужен для индекса `units_company_parent_code_uq` с `NULLS NOT DISTINCT`; в Docker Compose — `postgres:16-alpine`)
- **Redis** 6+ - для фоновых задач
- **MinIO** или AWS S3
- **SMTP сервер** (например, Yandex, Gmail, SendGrid) - для email-уведомлений

---

## 🚀 Установка

### 1. Клонирование репозитория

```bash
git clone https://github.com/yourusername/quokkaq-go-backend.git
cd quokkaq-go-backend
```

### 2. Установка зависимостей

```bash
go mod download
```

### 3. Настройка базы данных

Создайте базу данных PostgreSQL:

```bash
psql -U postgres
CREATE DATABASE quokkaq;
\q
```

Приложение автоматически выполнит миграции при запуске.

### 4. Настройка MinIO (для разработки)

Используя Docker:

```bash
docker run -d \
  -p 9000:9000 \
  -p 9001:9001 \
  --name minio \
  -e "MINIO_ROOT_USER=minioadmin" \
  -e "MINIO_ROOT_PASSWORD=minioadmin" \
  minio/minio server /data --console-address ":9001"
```

Откройте консоль MinIO по адресу <http://localhost:9001> и создайте bucket `quokkaq-materials`.

### 5. Настройка Redis (для фоновых задач)

Используя Docker:

```bash
docker run -d -p 6379:6379 --name redis redis:latest
```

---

## ⚙️ Конфигурация

### Переменные окружения

Создайте файл `.env` в корне проекта:

```env
# Настройка базы данных
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/quokkaq

# Настройка сервера
PORT=3001
APP_BASE_URL=http://localhost:3000

# Настройка MinIO / AWS S3
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_REGION=us-east-1
AWS_S3_BUCKET=quokkaq-materials
AWS_ENDPOINT=http://localhost:9000
# AWS_PUBLIC_ENDPOINT - Публичный URL для S3 (используется в ссылках на файлы для клиентов)
# Для продакшена с Traefik: https://s3.quokkaq.v-b.tech
# Для локальной разработки: оставьте пустым или используйте http://localhost:9000
# AWS_PUBLIC_ENDPOINT=https://s3.yourdomain.com

# Настройка SMTP
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=587
SMTP_USER=your-email@yandex.ru
SMTP_PASS=your-password
SMTP_FROM=noreply@yourdomain.ru
SMTP_SECURE=false
```

---

## 🏃 Запуск приложения

### Режим разработки

```bash
go run cmd/api/main.go
```

Сервер запустится по адресу <http://localhost:3001>

### Production сборка

```bash
go build -o quokkaq-backend cmd/api/main.go
./quokkaq-backend
```

### Использование Air (горячая перезагрузка)

Установка Air:

```bash
go install github.com/air-verse/air@latest
```

Запуск с горячей перезагрузкой:

```bash
air
```

---

## 📚 API документация

### Интерактивная документация API

После запуска сервера, откройте интерактивную документацию API:

**Scalar API Reference**: <http://localhost:3001/swagger/>

### Спецификация OpenAPI 3

Спецификация (OpenAPI 3.0 после конвертации из Swagger 2):

- **JSON (рекомендуемый URL)**: <http://localhost:3001/docs/openapi.json>
- **JSON (исторический путь)**: <http://localhost:3001/docs/swagger.json>
- **YAML**: `./docs/swagger.yaml`

### Генерация документации API

Аннотации в коде — в формате swag (Swagger 2). Публикуемая спека — OpenAPI 3:

```bash
python3 -m pip install 'PyYAML>=6.0,<7'
go run github.com/swaggo/swag/cmd/swag@v1.16.6 init -g cmd/api/main.go -o ./docs
go run ./cmd/swagger-to-openapi3
python3 scripts/post_swagger_openapi_tweaks.py
```

---

## 🛠️ Разработка

### Структура проекта

```
quokkaq-go-backend/
├── cmd/
│   ├── api/              # Точка входа приложения
│   ├── seed/             # Утилиты для заполнения БД
│   ├── test_email/       # Инструмент тестирования email
│   └── debug_email/      # Инструмент отладки email
├── internal/
│   ├── config/           # Загрузка конфигурации
│   ├── handlers/         # HTTP обработчики запросов
│   ├── middleware/       # HTTP middleware (auth, logging)
│   ├── models/           # Модели базы данных (GORM)
│   ├── repository/       # Слой доступа к данным
│   ├── services/         # Слой бизнес-логики
│   ├── jobs/             # Определения фоновых задач
│   └── ws/               # WebSocket hub и клиент
├── pkg/
│   └── database/         # Подключение к БД и утилиты
├── docs/                 # Сгенерированная API документация
├── go.mod                # Зависимости Go модуля
├── go.sum                # Контрольные суммы зависимостей
└── .env                  # Конфигурация окружения
```

### Ключевые компоненты

#### Handlers (обработчики) - `internal/handlers/`
HTTP обработчики запросов, отвечающие за парсинг запросов, вызов сервисов и возврат ответов.

#### Services (сервисы) - `internal/services/`
Слой бизнес-логики, который оркеструет вызовы репозиториев, реализует доменные правила и управляет транзакциями.

#### Repositories (репозитории) - `internal/repository/`
Слой доступа к данным, предоставляющий абстракцию над операциями с базой данных.

#### Models (модели) - `internal/models/`
GORM модели, представляющие сущности базы данных.

#### WebSocket Hub - `internal/ws/`
Hub для коммуникации в реальном времени с поддержкой комнат для обновлений, специфичных для подразделений.

#### Background Jobs (фоновые задачи) - `internal/jobs/`
Асинхронная обработка задач для операций вроде отправки email и генерации TTS.

---

## 🚢 Развертывание

### Развертывание через Docker

#### Быстрый старт с Docker Compose (Рекомендуется)

Самый простой способ запустить весь стек:

```bash
# Запуск всех сервисов (PostgreSQL, Redis, MinIO, API)
docker-compose up -d

# Просмотр логов
docker-compose logs -f backend

# Остановка всех сервисов
docker-compose down

# Остановка с удалением данных (чистая установка)
docker-compose down -v
```

После запуска сервисы будут доступны по адресам:
- **API**: <http://localhost:3001>
- **API Документация**: <http://localhost:3001/swagger/>
- **Консоль MinIO**: <http://localhost:9001> (логин: minioadmin/minioadmin)

**Первоначальная настройка:**
1. Откройте консоль MinIO по адресу <http://localhost:9001>
2. Создайте bucket с именем `quokkaq-materials`
3. API автоматически выполнит миграции при первом запуске

**Платформенный UI (`/platform`):** в `docker-compose.yml` по умолчанию **`PLATFORM_ALLOW_TENANT_ADMIN=false`** (роль tenant `admin` не может вызывать `/platform/*`, если у пользователя нет `platform_admin`). Чтобы разрешить tenant-админам `/platform` только в этом dev-стеке, задайте `PLATFORM_ALLOW_TENANT_ADMIN=true` в окружении или `.env` для Compose. Подробнее о ролях и продакшене — [SETUP.md](../../SETUP.md#saas-platform-admin-product-owner).

#### Сборка только Docker образа

```bash
# Сборка production образа
docker build -t quokkaq-backend .

# Запуск standalone (требуется внешняя БД)
docker run -p 3001:3001 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/db \
  -e AWS_ENDPOINT=http://minio:9000 \
  quokkaq-backend
```

### Рекомендации для продакшена

- ✅ Используйте reverse proxy (Nginx, Traefik)
- ✅ Включите HTTPS/TLS
- ✅ Настройте CORS для домена вашего фронтенда
- ✅ Настройте резервное копирование базы данных
- ✅ Настройте агрегацию логов
- ✅ Используйте управляемый Redis сервис
- ✅ Настройте health check endpoints
- ✅ Настройте rate limiting
- ✅ Используйте `.env` файлы для разных окружений
- ✅ Внедрите мониторинг (Prometheus, Grafana)

---

## 🤝 Участие в разработке

Мы приветствуем ваш вклад! Пожалуйста, следуйте этим рекомендациям:

1. Сделайте fork репозитория
2. Создайте ветку для функции (`git checkout -b feature/amazing-feature`)
3. Зафиксируйте изменения (`git commit -m 'Add amazing feature'`)
4. Отправьте в ветку (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

Подробнее см. в [CONTRIBUTING.md](CONTRIBUTING.md)

---

## 📄 Лицензия

Этот проект является проприетарным программным обеспечением. **Все права защищены.**

Исходный код доступен только для просмотра и оценки. Любое использование, модификация или распространение требует письменного разрешения правообладателя. Полные условия см. в файле [LICENSE](LICENSE).

Для вопросов лицензирования обращайтесь к сопровождающим проекта.

---

<div align="center">
  <p>Сделано с ❤️ командой QuokkaQ</p>
  <img src="./logo-text.svg" alt="QuokkaQ" width="120"/>
</div>
