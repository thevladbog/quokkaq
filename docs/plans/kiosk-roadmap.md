# Киоск для получения талонов: анализ мировых практик и план развития

## Текущая реализация

QuokkaQ уже реализует функциональное ядро:

**Что работает:**
- Tauri 2 десктоп-оболочка с попарингом терминала (код → JWT + профиль)
- Веб-интерфейс: выбор юнита → дерево услуг → создание талона
- Богатая ESC/POS-печать: логотип, заголовок/футер, крупный номер (canvas), QR-код, кириллица (CP1251)
- Поддержка сетевых и системных принтеров (TCP direct + Go-агент через CUPS/Windows)
- WebSocket: real-time ETA от `queue.snapshot`
- Предварительная регистрация (redemption по 6-значному коду)
- Идентификация посетителя по номеру телефона (опционально)
- Заморозка киоска во время EOD
- Смена языка (en/ru), настраиваемые цвета/тексты
- PIN-доступ к настройкам (5 кликов на часы)

**Заглушки / не реализовано:**
- `KioskSettingsSheet` — PIN открывает, но форм редактирования нет
- `LockScreen` — оверлей есть, логика разблокировки минимальна
- `emitKioskReady` / `emitScreenReady` — закомментированы, бэкенд не обрабатывает
- Изображения услуг (`imageUrl`) не отображаются в тайлах
- Нет мониторинга принтера (paper-out, статус)

---

## Мировые практики: ключевые выводы

На основе анализа Qmatic, Wavetec, SEDCO, Q-Nomy, Tensator, Skiplino, Moviik:

| Категория | Мировой стандарт | Статус в QuokkaQ |
|---|---|---|
| Получение талона | ≤3 тапа до талона | ✅ Реализовано |
| Тепловая печать | Номер, услуга, ETA, QR | ✅ Реализовано |
| Мультиязычность | ≥2 языка | ✅ en/ru |
| Электронная очередь | SMS-уведомления (транзакционные) | ✅ welcome-SMS + вызов / «вы следующий», гибрид platform + tenant |
| Запись на приём | Отдельный check-in поток | ❌ Нет |
| Доступность | ADA/WCAG 2.1 AA | ⚠️ панель a11y на киоске (TTS, контраст, шрифт) — в развитии |
| Виртуальная очередь | QR без физического киоска | ✅ `/[locale]/queue/{unitId}`, `POST /units/{unitId}/virtual-queue` |
| Сканирование ID | Авто-заполнение данных | ❌ Нет |
| Обратная связь | Опрос после обслуживания | ⚠️ Отдельный компонент |
| Аналитика | Real-time KPI дашборд | ⚠️ Частично |
| Мониторинг принтера | Paper-out → алерт персоналу | ❌ Нет |
| Оффлайн-режим | Кэш + очередь на отправку | ❌ Нет |

---

## Приоритизированный план развития

### Фаза 1 — UX-улучшения и завершение базовых фич (1–2 спринта)

Цель: довести текущую реализацию до production-ready без новой инфраструктуры.

#### 1.1 Панель настроек киоска (KioskSettingsSheet)

**Проблема:** PIN-доступ открывает пустую панель без возможности редактирования.

**Решение:** Форма с секциями:
- Внешний вид: цвета, заголовок/футер, логотип URL, текст приветствия
- Принтер: тип подключения, IP/порт или имя системного принтера, тест-печать
- Функции: включить/выключить предрегистрацию, идентификацию по телефону
- Сведения: версия приложения, ID терминала, юнит, статус подключения

**Реализация:**
- `PATCH /units/{unitId}/kiosk-config` уже существует — нужна только форма на фронте
- Компоненты: `apps/frontend/src/app/[locale]/kiosk/[unitId]/`
- Хук `useUpdateKioskConfig()` (через Orval-генерацию)

#### 1.2 Изображения и иконки услуг

**Проблема:** `Service.imageUrl`, `backgroundColor`, `textColor` объявлены в модели, но не отображаются в тайлах.

**Решение:**
- Показывать `imageUrl` как фон/иконку тайла (с заглушкой)
- Применять `backgroundColor`/`textColor` из конфига услуги
- Добавить поддержку emoji/SVG-иконок как альтернативу картинке

**Эффект:** Визуальная дифференциация услуг, снижение когнитивной нагрузки (данные Wavetec UX-исследований: +20% к скорости выбора)

#### 1.3 Обогащение талона — «люди впереди» и зона

**Проблема:** Талон не показывает позицию в очереди на момент создания.

**Решение:**
- Добавить в `POST /units/{unitId}/tickets` response: `positionInQueue`, `zone`/`counterHint`
- Обновить `buildKioskTicketEscPos()` в `packages/kiosk-lib/src/kiosk-ticket-escpos.ts`
- Добавить на успех-модал: «Впереди вас: N человек»

#### 1.4 Таймаут сессии с предупреждением

**Проблема:** Нет автосброса при бездействии — посетитель может оставить киоск в «потерянном» состоянии.

**Решение:**
- Таймер бездействия 45 сек → показать предупреждение с обратным отсчётом (15 сек)
- Если нет действия — сброс на главный экран
- Применяется на экране выбора услуги, но НЕ на экране успеха (там уже есть 5-сек закрытие)

#### 1.5 Мониторинг принтера и paper-out

**Проблема:** Принтер может закончить бумагу — киоск молча перестаёт печатать.

**Решение:**
- Периодический `list_printers()` (каждые 30 сек) + проверка статуса
- При ошибке печати: UI-оповещение + запись в лог
- Бэкенд: новый WebSocket-ивент `kiosk.printer_error` → оповещение персоналу в дашборде
- Альтернатива: POST в `/units/{unitId}/alerts`

---

### Фаза 2 — Доступность (Accessibility) (1–2 спринта)

Цель: соответствие ADA/WCAG 2.1 AA — требование для государственных заказчиков в США и ЕС (DOJ ввёл обязательность с апреля 2024 с окном соответствия 2–3 года).

#### 2.1 Увеличенный текст и высококонтрастный режим

- Кнопка A+ на главном экране → увеличивает шрифт на 150–200%
- Кнопка «контраст» → инвертирует тему (dark mode с усиленным контрастом ≥7:1)
- Состояние хранится в `localStorage` на время сессии
- Затрагивает: `KioskTopBar`, `KioskServiceTile`, `KioskWelcomeHero`

#### 2.2 Минимальные размеры touch-целей

- Все интерактивные элементы: ≥48×48px (WCAG 2.5.5 Enhanced: 44px minimum, рекомендуется 48px для кiosков)
- Особое внимание: кнопки в `PinCodeModal`, тайлы услуг при большом числе элементов

#### 2.3 Аудио-guidance (TTS)

- Опция «Аудио-помощь» → включает Web Speech API (TTS)
- Озвучивает: текущий экран, подсказки к тайлам при фокусе, содержимое успех-модала
- Headphone jack mode: активируется при подключении наушников (Tauri: detect audio device event)
- Требует добавления разрешений в Tauri capabilities

#### 2.4 Уменьшение анимации (Reduced Motion)

- `prefers-reduced-motion` media query → отключает Framer Motion анимации
- Применяется ко всем transition/animation в kiosk-UI

#### 2.5 WCAG-совместимые цветовые контрасты

- Аудит всех кастомных цветов (`isCustomColorsEnabled`) на соответствие 4.5:1
- Предупреждение в KioskSettingsSheet при выборе цвета с низким контрастом

---

### Фаза 3 — Уведомления и виртуальная очередь (2–3 спринта)

Цель: снизить физическую нагрузку на зал ожидания, повысить NPS. **Статус: реализовано (кроме WhatsApp).**

#### 3.1 SMS-талон

**Флоу (факт):**
- Транзакционные SMS: **welcome** при выдаче талона (если известен телефон / после `POST /tickets/{id}/phone`); **вызов** / **позиция** — по существующему `NotificationService`.
- Трекинг-страница: ссылка в SMS и в QR; короткие ссылки: **`GET /l/{code}`** → редирект на публичную страницу талона.
- **Гибрид SMS:** развёртывание (platform) + `company.settings.visitorSms` (BYOK) с полем `resolvedSource` (tenant|platform|log) в доставке; **настройка тенанта:** `GET/PUT /companies/me/visitor-sms`, тест `POST /companies/me/visitor-sms/test` (нужен план `visitor_notifications` для теста).
- **Киоск (обязательный шаг):** если у талона ещё нет телефона, а план и SMS-канал разрешают — публичный `GET/POST` возвращают `smsPostTicketStepRequired: true` (и в ответе на `POST /units/{unitId}/tickets` тоже). Согласие + телефон или `POST /tickets/{id}/visitor-sms-skip` с `X-Visitor-Token`. В KioskConfig: `config.kiosk.visitorSmsAfterTicket: false` отключает **обязательный** шаг.
- **Наблюдаемость:** `GET /companies/me/visitor-notification-stats` — агрегаты статусов SMS-задач за 7 суток (pending/sent/failed); события в `queue_funnel_events` (в т.ч. `kiosk_sms_step_declined`).

*Примечание:* отдельного `POST /tickets/{id}/notify` **нет** — публично используются `…/phone`, трекер и воркер `sms:send`.


#### 3.2 WhatsApp-уведомления

- Аналогично SMS, но через WhatsApp Business API
- Преимущество: rich-форматирование, подтверждение доставки, двусторонний диалог (отмена талона)
- Требует: WhatsApp Business API аккаунт (Wavetec использует на 975 ветках Banorte)

#### 3.3 Страница трекинга талона (/ticket/{id})

- QR на талоне уже ссылается на `/ticket/{ticketId}` — реализовать полноценную страницу
- Контент: позиция в очереди, ETA, статус (ожидает / вызван / обслужен)
- Обновление через WebSocket (уже есть ивент `ticket.updated`)
- Кнопка «Отменить талон» (если пользователь не может прийти)

#### 3.4 Виртуальная очередь — QR без киоска

- **Факт в коде:** публичная страница **`/[locale]/queue/[unitId]`** (а не устаревший путь `join` из старой редакции roadmap).
- API: **`POST /units/{unitId}/virtual-queue`**; требуется `virtualQueue.enabled` в конфиге юнита и feature **`virtual_queue`**. На публичный `POST` действуют **rate limit** (в т.ч. `VirtualQueueJoinRateLimit` + `PublicAPIRateLimit`).
- Талон в браузере; телефон — по политике; конверсия/воронка — `queue_funnel_events`, в т.ч. `public_virtual_queue_joined`.

#### 3.5 PWA (посетитель)

- **Манифест** приложения Next.js: `apps/frontend/app/manifest.ts` (иконки, display standalone) — installability с `/` и публичных маршрутов.
- (Продукт: web push / отдельная политика — вне обязательного кода в этом документе.)

#### 3.6 E-mail

- Поддержка `visitorNotificationEmail` на талоне + приветственное письмо **при согласовании в бэкенде** (см. `NotificationService`).

---

### Фаза 4 — Запись и check-in (2 спринта)

Цель: разгрузить пиковые часы, сократить время ожидания для клиентов с записью.

#### 4.1 Check-in по записи (Appointment Check-in)

**Проблема:** Существует pre-registration (redemption по коду), но нет полноценного потока для клиентов с записью на конкретное время.

**Флоу:**
Кнопка «У меня запись» на главном экране →
- Вариант A: Ввод кода из email/SMS → lookup appointment → выдать талон с приоритетом
- Вариант B: QR-скан с телефона (из письма) → автоматический check-in
- Вариант C: Ввод номера телефона → список активных записей → выбрать → check-in

**Бэкенд:** Новый endpoint `POST /appointments/{id}/checkin` → создаёт талон с `priority: "appointment"`, `appointmentId`

**KioskConfig:** флаг `isAppointmentCheckinEnabled`

#### 4.2 QR-скан на киоске (Camera/Scanner)

- Tauri: поддержка USB-сканера штрихкодов (HID keyboard input → перехват в web UI)
- Или: камера через Tauri camera plugin / getUserMedia
- Сценарии: сканирование QR из email записи, кода предрегистрации (замена ручного ввода)

#### 4.3 Управление записями (Admin)

- В KioskSettingsSheet: просмотр сегодняшних записей на этот юнит
- Массовое уведомление записанных клиентов (аналог Qmatic bulk SMS, 2025)

---

### Фаза 5 — Расширенные возможности (3+ спринтов)

Цель: дифференциация, аналитика, AI-функции.

**Поставка (текущий план фазы 5):** **5.1–5.5** — **полный** заявленный объём, **без** дробления на «MVP/потом» (см. [kiosk-phase5-delivery.md](kiosk-phase5-delivery.md)). **5.6 (оплата на киоске) в эту поставку не входит** — **отдельная** проработка; черновик — [`docs/plan/kiosk-payment-future.md`](../plan/kiosk-payment-future.md).

**Тарифы и `plan features`:** для **5.1–5.5** — отдельные boolean-ключи (как `counter_guest_survey` в [`plan_feature.go`](../../apps/backend/internal/services/plan_feature.go)), `CompanyHasPlanFeature` + UI. **5.6 / `kiosk_visitor_payment`** — при **старте** инициативы 5.6, не в составе 5.1–5.5. Сводка: [kiosk-payment-future.md#plan-feature-keys](../plan/kiosk-payment-future.md#plan-feature-keys) и фиксация в [`PRICING.md`](../saas/PRICING.md) по факту внедрения.

#### 5.1 Аналитика киоска — Kiosk Operations Dashboard

**KPI для отслеживания:**
- Талонов выдано за период (по часам/дням)
- Распределение по услугам
- Abandonment rate: взял талон / был обслужен
- Доля с SMS-уведомлением, с записью vs. walk-in
- Средний ETA на момент выдачи

**Реализация:**
- Новая модель `kiosk_events` или расширение существующих логов
- Endpoint `/units/{unitId}/kiosk-analytics` с агрегатами
- Виджет в менеджерском дашборде

#### 5.2 Интеллектуальная оценка времени ожидания

- Текущий ETA: статичный расчёт из `queue.snapshot`
- Улучшение: ML-модель на основе исторических данных (Go бэкенд)
  - Учитывает день недели, час дня, тип услуги, число активных операторов
  - Wavetec/Qmatic: точность ETA выше на 30–40% vs. статичный расчёт
- На талоне: «~12 мин» — меньше разочарований при отклонении

#### 5.3 Сбор обратной связи после обслуживания

- 1–5 звёзд + кнопки с эмодзи (😊/😐/😞) на экране после закрытия талона
- Связка с конкретным талоном, оператором, временем обслуживания
- Уже есть модель `counter_guest_survey` в `DesktopTerminal` — расширить на kiosk-контекст
- Real-time алерт менеджеру при оценке 1–2 звезды

#### 5.4 Сканирование документа / ID

- USB/camera сканер → OCR → автозаполнение полей (имя, номер ID)
- Применимо: банки, МФЦ, госуслуги, медицина; сокращает время взаимодействия с ~60 сек до ~10 сек
- Tauri: Tesseract-WASM или Rust OCR crate
- Данные не сохраняются после сессии (GDPR/152-ФЗ)

#### 5.5 Оффлайн-режим

**Проблема:** Если API недоступен — киоск полностью перестаёт работать.

**Решение:**
- Tauri: кэшировать `unit config` + `services tree` локально (SQLite через tauri-plugin-sql)
- При недоступности API: работать из кэша, выдавать талоны с временными локальными номерами
- Синхронизация при восстановлении связи
- Индикатор оффлайн-режима в `KioskTopBar`

#### 5.6 Оплата на киоске

**Вне** текущей **исполняемой** поставки фазы 5 (5.1–5.5): требуется **самостоятельная** проработка. Сбор идеи, развод с SaaS-инвойсингом, будущий **`kiosk_visitor_payment`** — в **[`docs/plan/kiosk-payment-future.md`](../plan/kiosk-payment-future.md)**. После появления 5.5 учитывать **совместимость** (например, гостевую оплату **не** предлагать в **offline** — при проектировании 5.6).

---

## Матрица приоритетов

| # | Фича | Ценность | Сложность | Приоритет |
|---|---|---|---|---|
| 1.1 | Панель настроек (KioskSettingsSheet) | Высокая | Низкая | 🔴 Срочно |
| 1.4 | Таймаут сессии | Высокая | Низкая | 🔴 Срочно |
| 1.2 | Изображения услуг | Средняя | Низкая | 🟡 Скоро |
| 1.3 | «Люди впереди» на талоне | Средняя | Низкая | 🟡 Скоро |
| 1.5 | Мониторинг принтера | Высокая | Средняя | 🟡 Скоро |
| 2.1 | Большой текст / контраст | Высокая | Средняя | 🟡 Скоро |
| 2.2 | Touch-цели ≥48px | Средняя | Низкая | 🟡 Скоро |
| 3.1 | SMS-талон | Высокая | Средняя | 🟢 Сделано |
| 3.3 | Страница трекинга талона | Высокая | Средняя | 🟢 Сделано |
| 4.1 | Check-in по записи | Высокая | Высокая | 🟡 Скоро |
| 2.3 | TTS аудио-guidance | Средняя | Высокая | 🟢 Backlog |
| 2.4 | Reduced motion | Низкая | Низкая | 🟢 Backlog |
| 3.2 | WhatsApp-уведомления | Средняя | Высокая | 🟢 Backlog |
| 3.4 | Виртуальная очередь QR | Средняя | Высокая | 🟢 Сделано |
| 4.2 | QR-скан на киоске | Средняя | Высокая | 🟢 Backlog |
| 4.3 | Управление записями (Admin) | Средняя | Средняя | 🟢 Backlog |
| 5.1 | Аналитика киоска | Высокая | Высокая | [Фаза 5 — полная поставка](kiosk-phase5-delivery.md) |
| 5.2 | ETA: перцентили + batch ML | Средняя | Высокая | [Фаза 5 — полная поставка](kiosk-phase5-delivery.md) |
| 5.3 | Обратная связь post-service | Высокая | Средняя | [Фаза 5 — полная поставка](kiosk-phase5-delivery.md) |
| 5.4 | Сканирование ID | Средняя | Высокая | [Фаза 5 — полная поставка](kiosk-phase5-delivery.md) |
| 5.5 | Оффлайн-режим (outbox+sync) | Высокая | Высокая | [Фаза 5 — полная поставка](kiosk-phase5-delivery.md) |
| 5.6 | Оплата на киоске | Средняя | Высокая | Отдельно: [kiosk-payment-future](../plan/kiosk-payment-future.md) |

---

## Источники

- [Qmatic Self-Service Kiosks](https://www.qmatic.com/products/self-service-kiosks/) + [Product Updates 2024–2025](https://www.qmatic.com/product-updates/2024-recap)
- [Wavetec Queue Management System](https://www.wavetec.com/solutions/queue-management-system/)
- [Wavetec QR Code Kiosk Check-In](https://www.wavetec.com/blog/how-qr-code-scanning-speeds-up-kiosk-check-in/)
- [Wavetec Virtual Queuing](https://www.wavetec.com/solutions/queue-management-system/virtual-queuing/)
- [Q-Nomy Queue Management](https://www.qnomy.com/queue-management)
- [Skiplino Best QMS 2025](https://skiplino.com/best-queue-management-systems-in-2025-complete-guide-to-digital-queue-solutions/)
- [ADA Compliant Kiosk Guide 2025](https://shimetadevice.com/ada-compliant-kiosk-accessibility-guide/)
- [WCAG Kiosk Accessibility — Level Access](https://www.levelaccess.com/blog/unlocking-kiosk-accessibility-tips-for-inclusive-compliant-self-service-experiences/)
- [Kiosk UX/UI Design Checklist — AVIXA](https://xchange.avixa.org/posts/kiosk-ux-ui-design-checklist)
- [Moviik Kiosks](https://www.moviik.com/kiosks)
- [QMS Market Report $1.33B by 2031 — PR Newswire](https://www.prnewswire.com/news-releases/queue-management-system-market-skyrockets-to-1-331-48-million-by-2031-dominated-by-tech-giants---q-matic-group-ab-qminder-ltd-and-q-nomy-inc--the-insight-partners-302314003.html)
