# Голосовые объявления талонов (TTS): анализ и план реализации

## Текущее состояние

Система вызова талонов работает через WebSocket-ивент `ticket.called`, который принимает экран
(`apps/frontend/src/app/[locale]/screen/[unitId]/page.tsx`). Экран — обычный браузер Next.js,
без Tauri. Никакого звука при вызове сейчас нет.

**Что уже есть в коде:**
- `apps/backend/internal/services/tts_service.go` — заглушка: симулирует 1 сек задержку,
  возвращает фиктивный аудио-URL
- `TTSUrl *string` на модели талона (`apps/backend/internal/models/ticket.go`) — поле под
  URL к аудиофайлу
- `apps/frontend/hooks/use-sla-alerts.ts` — единственный существующий аудио-паттерн:
  `new Audio('/sounds/sla-alert.mp3')`, volume 0.6, мягкий fallback при autoplay-блокировке
- `packages/kiosk-lib/src/socket.ts` → `onTicketCalled(callback)` — событие уже принимается

---

## Анализ вариантов

| Движок | Качество | Зависимости | Оффлайн | Лицензия | Применимость к экрану |
|---|---|---|---|---|---|
| Web Speech API | 3–4/5 (Windows: Irina, macOS: Milena) | 0 MB | ✅ (только localService) | ОС | ✅ Работает в браузере |
| sherpa-onnx + Piper VITS | 3.5–4/5 | ~50 MB модель | ✅ | Apache 2.0 | Только на сервере |
| Silero TTS v5 | 4.5/5 | ~120 MB PyTorch | ✅ | MIT/кастом | Требует Python сайдкар |
| eSpeak-ng WASM | 1.5/5 | ~5 MB | ✅ | GPL | ❌ Непригодно (роботизированный) |
| RHVoice | 3/5 | FFI | ✅ | CC BY-NC-ND | ❌ Non-commercial only |

**Ключевой факт:** экран — браузер, не Tauri. Sherpa-onnx нельзя запустить в браузере напрямую.
Единственный способ получить хорошее качество голоса на экране — генерировать аудио на **бэкенде**
и доставлять готовый URL на экран отдельным WebSocket-событием после генерации (см. контракт ниже).

---

## Рекомендуемая архитектура

### Основной путь — бэкенд-генерация (sherpa-onnx в Go)

```text
ticket.called (бэкенд, сразу после смены статуса)
    │
    ├─→ UI экрана обновляет талон (ttsUrl в payload может отсутствовать)
    │
    └─→ параллельно tts_service.go:
          1. prepareText("А-047", "окно 3") → "А ноль сорок семь, пройдите к окну три"
          2. sherpa-onnx (CGO или subprocess) генерирует WAV
          3. Upload в MinIO → URL = tts-{ticketId}.mp3
          4. Запись в ticket.TTSUrl
          5. WebSocket ticket.tts_ready { ticketId, ttsUrl } (или эквивалентный payload)

Экран (браузер) на ticket.tts_ready:
    new Audio(ttsUrl).play()  ← тот же паттерн, что use-sla-alerts.ts
```

**Контракт (зафиксировано в плане):** не блокировать вызов талона ожиданием TTS. Событие `ticket.called`
отправляется сразу; когда аудио готово и `ticket.TTSUrl` записан — отдельное событие **`ticket.tts_ready`**
с `ttsUrl` (и идентификатором талона). Экран подписывается на оба: отображение по `ticket.called`, воспроизведение по `ticket.tts_ready`. Если TTS отключён или не удался — `ticket.tts_ready` не шлём (или шлём с пустым `ttsUrl`), экран использует Web Speech API fallback.

**Почему этот путь:**
- `tts_service.go` и `TTSUrl` уже созданы — нужна только реализация
- Единый источник истины: один качественный движок для всех экранов
- Работает на любом устройстве с браузером (умный телевизор, планшет, ПК)
- Вызов талона остаётся быстрым; задержка TTS переносится на `ticket.tts_ready` без блокировки UI

**Go + sherpa-onnx:**
- Go-биндинг: `github.com/k2-fsa/sherpa-onnx/go/sherpa_onnx` (официальный, Apache 2.0)
- Модель: `vits-piper-ru_RU-irina-medium` (~50 MB, Apache 2.0) — женский голос, качество 3.5/5
- Или `vits-piper-ru_RU-denis-medium` — мужской вариант
- Модель скачивается при деплое (не в репозитории), путь задаётся переменной окружения

### Резервный путь — Web Speech API на экране

Для сред без настроенного TTS-сервиса на бэкенде (dev-среда, SaaS с отключённым TTS):
- Если `ticket.tts_ready` не пришло или `ttsUrl` пуст → экран пробует `window.speechSynthesis`
- Фильтрует `voice.lang === 'ru-RU' && voice.localService === true`
- Если голоса нет — беззвучно (не блокирует отображение талона)

---

## Критически важно: нормализация текста

Ни один из движков не озвучивает коды талонов и номера окон корректно без preprocessing.

| Исходная строка | Ожидаемая озвучка | Обработанная строка |
|---|---|---|
| `А-047` | «А ноль сорок семь» | `А ноль сорок семь` |
| `Б-12` | «Б двенадцать» | `Б двенадцать` |
| `окно 3` | «окно три» | `окно три` |
| `позиция 1` | «позиция один» | `позиция один` |

Нужна утилита `PrepareTTSAnnouncement(ticketNumber, counterNumber string) string` в Go:
- Разбирает буквенный префикс и числовую часть кода талона через regexp
- Раскладывает число в слова («ноль сорок семь»)
- Номер окна — порядковое числительное («к окну три», «к окну двенадцати»)

Шаблон фразы (конфигурируемый через `UnitConfig`):
> «Талон {ticketNumber}, пройдите к окну {counter}»

---

## Что реализовать

### Бэкенд (`apps/backend/`)

**1. Нормализатор текста**
- Файл: `internal/services/tts_normalize.go`
- Функция: `PrepareTTSAnnouncement(ticketNumber, counterNumber string) string`

**2. Реализация `tts_service.go`**
- Заменить заглушку на реальный вызов sherpa-onnx Go API
- Конфигурация через env: `TTS_MODEL_PATH`, `TTS_ENABLED` (bool)
- Если `TTS_ENABLED=false` — silent mode (текущее поведение заглушки, без ошибок)
- Генерировать WAV → конвертировать в MP3 (через `ffmpeg` subprocess или Go-библиотеку) → upload MinIO

**3. Интеграция с WebSocket**
- При вызове талона (`PATCH /tickets/{id}/call` / существующий путь `CallNext` и т.п.) — сразу broadcast `ticket.called` (как сейчас)
- Параллельно запустить генерацию TTS; по завершении — запись `ticket.TTSUrl` и broadcast **`ticket.tts_ready`** с `ttsUrl` (не ждать TTS в HTTP-обработчике)

### Фронтенд (`apps/frontend/`)

**4. Хук `useTicketAnnouncement`**
- Файл: `hooks/use-ticket-announcement.ts`
- Подписка на `onTicketTtsReady` (новый) из kiosk-lib socket; при `ttsUrl` → `new Audio(ttsUrl).play()` (паттерн из `use-sla-alerts.ts`)
- Опционально: при `ticket.called` без аудио — не играть; fallback на `speechSynthesis` только если за таймаут не пришёл `ticket.tts_ready` или `ttsUrl` пуст
- Экспортирует `isAudioEnabled: boolean` для опционального UI-индикатора

**5. Подключение к экрану**
- Файл: `src/app/[locale]/screen/[unitId]/page.tsx` или дочерний компонент
- Добавить `useTicketAnnouncement(unitId)` — одна строка

### Инфраструктура

**6. Модель и деплой**
- Скрипт загрузки модели: `scripts/download-tts-model.sh`
- Docker: `RUN ./scripts/download-tts-model.sh` в `apps/backend/Dockerfile`
- `.env.example`: добавить `TTS_ENABLED=false`, `TTS_MODEL_PATH=`

---

## Матрица приоритетов

| Шаг | Сложность | Примечание |
|---|---|---|
| Нормализатор текста (Go) | Низкая | Блокирует шаг 2 |
| Web Speech API fallback (фронт) | Низкая | Независим, даёт быстрый результат |
| `tts_service.go` с sherpa-onnx | Высокая | Требует CGO или subprocess setup |
| `useTicketAnnouncement` хук | Низкая | Блокируется шагом 3 для primary path |
| Событие `ticket.tts_ready` + клиент | Низкая | Нужен для primary path (не блокировать `ticket.called`) |
| Docker + скрипт модели | Средняя | Нужен для деплоя |

**Быстрый старт (без sherpa-onnx):** шаги 2 + 4 + 5 дают Web Speech API fallback за ~2 часа.  
**Полное решение:** все 6 шагов, ~2–3 дня.

---

## Конфигурация в UnitConfig

```typescript
tts?: {
  enabled: boolean;             // включить TTS для этого юнита
  announcementTemplate?: string; // "Талон {number}, пройдите к окну {counter}"
  volume?: number;              // 0.0–1.0, дефолт 0.8
}
```

---

## Источники

- [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) — официальный Go-биндинг, Apache 2.0
- [rhasspy/piper](https://github.com/rhasspy/piper) — VITS Russian voice models
- [Piper voice ru_RU-irina-medium](https://huggingface.co/rhasspy/piper-voices/tree/main/ru/ru_RU/irina/medium)
- [MDN Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [snakers4/silero-models](https://github.com/snakers4/silero-models) — лучшее качество по-русски (референс)
