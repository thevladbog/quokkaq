# Киоск: дизайн и UX — анализ и план улучшений

## Текущий дизайн: что есть

### Сетка услуг
- **Режим manual:** фиксированная матрица **8×8 = 64 ячейки**, позиции через `gridRow` / `gridCol` / `gridRowSpan` / `gridColSpan`.
- **Режим auto:** `KioskConfig.serviceGridLayout === 'auto'` — раскладка и пагинация на фронтенде ([`service-grid-autolayout.ts`](../../apps/frontend/lib/service-grid-autolayout.ts)); без скролла, кнопки «Назад» / «Далее».
- Зазоры: `gap-1.5` → `gap-2` → `gap-3`.

### Тайл услуги
- Форма: `rounded-3xl` (24px)
- Фон: кастомный `backgroundColor` из карточки услуги, иначе тёплый cream `oklch(0.98 0.01 75)` (для **базовой** палитры без кастомных цветов также учитывается `kioskBaseTheme` — см. [Дизайн 9](#дизайн-9--тема-для-яркоготёмного-окружения))
- Тень: двухслойная, тёплые тона `rgba(29,27,25, 0.08/0.06)`
- Типографика: fluid `clamp()` + `@container/kiosk-tile` — заголовок и описание
- **Touch feedback:** `active:scale-[0.96]`, `active:brightness-[0.93]`, `transition-[transform,box-shadow,filter]`; на **очень тёмном** кастомном фоне — посветление вместо затемнения (см. [`kiosk-service-tile.tsx`](../../apps/frontend/components/kiosk/kiosk-service-tile.tsx))
- **Лист / ветвь:** угол — шеврон vs иконка талона ([`KioskTileKindIndicator`](../../apps/frontend/components/kiosk/kiosk-service-tile.tsx))
- Если есть изображение / emoji: двухколоночный layout (42% / 58%) при ширине тайла ≥15rem, иначе стек. Без `imageUrl` — текст и **опциональная** иконка/аватар по `iconKey` (см. [Дизайн 4](#дизайн-4--иконки-по-умолчанию-для-услуг))

### Топ-бар
- Высота: 4.5rem (mobile) → 5rem (sm+)
- Фон: из эффективного `headerColor` (кастом или базовая тема; HC — отдельная палитра)
- Содержимое: логотип, юнит, доступность, пре-рег, язык, часы

### Экран после выдачи талона
- **Полноэкранный** overlay [`kiosk-ticket-success-overlay.tsx`](../../apps/frontend/components/kiosk/kiosk-ticket-success-overlay.tsx) (`fixed inset-0`)
- Номер — fluid `clamp` по viewport
- `ticketSuccessAutoCloseSec` в `KioskConfig` (значение по умолчанию 12s в клиенте, если не задано)
- Сложные анимации входа (checkmark draw, stagger) — по желанию, отдельный backlog; `prefers-reduced-motion` в компонентах учитывается

### Палитра и базовая тема
- Дефолт: тёплые нейтрали и токены `--color-kiosk-ink*`, `--color-kiosk-border` в `globals.css`
- Режим высокого контраста (доступность): принудительные тёмные/светлые поверхности, **не** путать с пресетом `kioskBaseTheme: 'high-contrast-preset'`

### Доступность
- TopBar: шрифт 1×/1.12×/1.22×, HC, TTS, аудио-выход
- Focus rings, `.kiosk-touch-min`, `prefers-reduced-motion` на критичных анимациях

### Что ещё в backlog
- Анимации «галочка + появление номера» на success (как в [Дизайн 5](#дизайн-5--полноэкранный-confirmation--success-state)) — уточнение, не блокируя текущий full-screen
- Опционально: цветовой индикатор загруженности в топ-баре (см. [Дизайн 10](#дизайн-10--индикатор-очереди-на-attract-screen-и-сетке))

---

## Анализ vs мировые практики

| Аспект | Мировой стандарт | QuokkaQ (актуально) | Оценка |
|---|---|---|---|
| Сетка | 2×2–3×3, auto | 8×8 **manual** или **auto** + пагинация | ✅ / ⚠️ |
| Attract | Да | `KioskAttractScreen`, конфиги inactivity, signage | ✅ |
| Touch feedback | ~0.93–0.96 + яркость | 0.96 + brightness, filter transition | ✅ |
| Success | Крупный номер | Full-screen, fluid размер | ✅ |
| Авто-закрытие | 10–15 с | Настраиваемо, дефолт 12s | ✅ |
| Иконка + текст | Часто | `iconKey` + аватар буква при отсутствии картинки | ✅ / в развитии |
| Лист vs ветвь | Шеврон / талон | Индикатор в углу | ✅ |
| Numpad | крупные кнопки | `h-[4.5rem] sm:h-[5rem]` в phone flow | ✅ |
| Размер касания | 20мм+ | `kiosk-touch-min` 48px — см. гайд WCAG, отдельный вопрос для 1080p | ⚠️ |

---

## Рекомендации по улучшениям

### Дизайн 1 — Attract / Idle screen

**Статус: реализовано** — компонент, сессия через нижнюю полосу, варианты `kioskAttractInactivityMode`, signage, `showQueueDepthOnAttract`. Детали — [Дизайн 10](#дизайн-10) и [kiosk-attract-screen.tsx](../../apps/frontend/components/kiosk/kiosk-attract-screen.tsx).

### Дизайн 2 — Auto-layout

**Статус: реализовано** — `serviceGridLayout: 'manual' | 'auto'`, `service-grid-autolayout`. По умолчанию в **схеме** при отсутствии поля — `manual` (см. комментарий в `KioskConfigSchema`); бизнес-логика «по умолчанию auto для новых» может задаваться при создании юнита.

### Дизайн 3 — Лист vs ветвь

**Статус: реализовано** — `tileKind` + индикатор.

### Дизайн 4 — Иконки по умолчанию для услуг

- Поле **`iconKey`** (опционально) + маппинг Lucide; без картинки и без ключа — **круг** с первой буквой названия
- Реализация: тайл без `imageUrl`, API и админ (выбор ключа) — в коде

### Дизайн 5 — Full-screen success

**Статус: по layout — сделано** (full-screen overlay, крупный номер). **Анимации** (checkmark draw, stagger) — в backlog, отключаемые через `prefers-reduced-motion`.

### Дизайн 6 — Touch-feedback

**Статус: сделано** в [`kiosk-service-tile`](../../apps/frontend/components/kiosk/kiosk-service-tile.tsx); доработка для тёмных кастомных фонов — в том же компоненте.

### Дизайн 7 — Numpad

**Статус: сделано** в phone-related модалках (`h-[4.5rem] sm:h-[5rem]`).

### Дизайн 8 — Плавный attract

**Статус: реализовано** (bottom bar + `session_then_attract` + attract, см. [Дизайн 1](#дизайн-1--attract--idle-screen-экран-ожидания) и [Дизайн 10](#дизайн-10--индикатор-очереди-на-attract-screen-и-сетке)).

### Дизайн 9 — Базовые темы

Поле **`kioskBaseTheme`**: `warm-light` | `cool-light` | `dark` | `high-contrast-preset` — в `KioskConfig`. Если `isCustomColorsEnabled` — по-прежнему действуют **ручные** `header` / `body` / `grid` цвета. Имя `high-contrast-**preset**` отличает пресет от a11y «высокий контраст».

| Тема | Ориентир фона (без кастомных цветов) | Окружение |
|------|----------------------------------------|-----------|
| `warm-light` | #fff9f4 / #fef8f3 / #f2ebe6 | Офис, МФЦ |
| `cool-light` | #f8faff / #f0f4ff / #e8eef6 | Банк, госсектор |
| `dark` | #0f0f0f / #1a1a1a / #141414 | Тусклый зал, ночь |
| `high-contrast-preset` | #000 / #111 / #0a0a0a | Солнце, витрина |

### Дизайн 10 — Очередь на attract

**Статус: сделано (фаза B).** В `KioskConfig` зафиксированы `kioskAttractInactivityMode` (`session_then_attract` | `attract_only` | `off`, по умолчанию `session_then_attract`), `showAttractAfterSessionEnd` (по умолчанию `true`), `attractIdleSec` (10–600, по умолчанию 60, для `attract_only`) и `showQueueDepthOnAttract` (по умолчанию `true`). Сессия: нижняя полоса вместо модалки; при `session_then_attract` после отсчёта — attract при необходимости. Нижняя полоса: `NEXT_PUBLIC_APP_VERSION` + бейдж сети/заморозки. **Attract+signage:** в шапке (лого + время) / центр / CTA; контент слайдера — как у публичного дисплея: активный плейлист `getActivePlaylist` иначе `adScreen.activeMaterialIds` + `ContentPlayer`; без слайдов — ETA и кнопка; тап — без рекламы на весь экран, со слайдами — по кнопке.

---

## Матрица приоритетов (обновлено)

| # | Улучшение | Статус / примечание |
|---|-----------|---------------------|
| 1 | Attract | ✅ |
| 2 | Auto-layout | ✅ |
| 3 | Лист vs ветвь | ✅ |
| 4 | Иконки + `iconKey` | ✅ (поддержка в продукте) |
| 5 | Full-screen + крупный номер | ✅ layout; анимации — backlog |
| 6 | Touch | ✅ |
| 7 | Numpad | ✅ |
| 8 | Bottom-bar + attract | ✅ |
| 9 | Базовые темы `kioskBaseTheme` | ✅ |
| 10 | Очередь / ETA на attract | ✅ |

---

## Что НЕ менять

- Fluid typography + container queries на тайлах
- Rounded-3xl, тени по умолчанию (кроме согласованных вариаций в тёмных темах)
- 8×8 **manual** как опция
- a11y: font steps, TTS, HC, тесты регрессии

---

## Источники

- [Nielsen Norman Group — Large Touchscreens: What's Different?](https://www.nngroup.com/articles/large-touchscreens/)
- [Qmatic Kiosk Product Line](https://www.qmatic.com/products/self-service-kiosks/)
- [Moviik Tiik 15 & Tiik 7](https://www.moviik.com/kiosks)
- [Wavetec UX Design Challenges](https://www.wavetec.com/blog/challenges-in-ux-design-of-self-service-kiosks/)
- [SEDCO Bank & Healthcare Kiosks](https://www.sedco.co/en/solutions/self-service-kiosk)
- [KIOSK Information Systems — UI Design Tips](https://kiosk.com/kiosk-ui/)
- [ADA Kiosk Multi-Point Checklist 2024](https://kioskindustry.org/ada-kiosk-accessibility-multi-point-checklist-draft-2024/)
- [WCAG 2.5.8 Target Size](https://www.allaccessible.org/blog/wcag-258-target-size-minimum-implementation-guide)
- [Frank Mayer Associates — Kiosk UI Design](https://www.frankmayer.com/blog/user-interface-design-for-kiosks/)
- [FLYX — Kiosk UX/UI](https://www.flyx.cloud/en/blog/effective-ux-ui-for-self-service-kiosks-best-practices-tips/)
