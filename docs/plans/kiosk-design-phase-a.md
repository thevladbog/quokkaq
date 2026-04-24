# Киоск UX — фаза A (срочные правки)

Отдельный исполнимый план по матрице приоритетов из [kiosk-design.md](./kiosk-design.md) (дизайн 3, 6, 7 и частично 5). Общий роадмап фаз B–F остаётся в основном плане киоск UX в Cursor (`kiosk_ux_design_rollout`).

**Цель:** улучшить обратную связь касания, различимость «лист / ветвь», размеры цифровых клавиатур и читаемость экрана успеха без полноэкранного редизайна (он — фаза C).

**Оценка:** 1–2 коротких итерации, только фронтенд + схема `KioskConfig` в shared-types и подписи в админке.

---

## A1 — Индикатор «лист» vs «ветвь»

**Проблема:** тайлы категории и конечной услуги выглядят одинаково ([kiosk-design.md](./kiosk-design.md) § дизайн 3).

**Решение:**

1. Расширить [`apps/frontend/components/kiosk/kiosk-service-tile.tsx`](apps/frontend/components/kiosk/kiosk-service-tile.tsx) пропом, например `tileKind: 'leaf' | 'branch'` (или `isLeaf: boolean`), по умолчанию совместимый с текущим вызовом.
2. В [`apps/frontend/app/[locale]/kiosk/[unitId]/page.tsx`](apps/frontend/app/[locale]/kiosk/[unitId]/page.tsx) при рендере `KioskServiceTile` передавать значение из `service.isLeaf` (уже используется в `handleServiceSelection`).
3. UI:
   - **ветвь** (`isLeaf === false`): шеврон `›` или `ChevronRight` в правом нижнем углу;
   - **лист** (`isLeaf === true`): компактная иконка (например `Ticket` или галка) в том же углу.
4. Стиль индикатора: приглушённый (`text-kiosk-ink/40` или аналог в HC), не перекрывать заголовок.
5. **Доступность:** декоративные иконки с `aria-hidden`; смысл по-прежнему из названия услуги и кнопки/роли.

**Критерий готовности:** на киоске визуально отличимы услуги с подменю и услуги, ведущие к талону/идентификации.

---

## A2 — Touch feedback на тайлах

**Проблема:** `active:scale-[0.99]` почти незаметен (дизайн 6).

**Решение в** `kiosk-service-tile.tsx` (`cardClassBase`):

- Заменить на `active:scale-[0.96]`.
- Добавить `active:brightness-[0.93]` (или сопоставимый `filter`), для тайлов с кастомным `backgroundColor` допустимо оставить один общий приём, если отдельный «darken 7%» избыточен в первой итерации.
- Расширить transition: `transition-[transform,box-shadow,filter]` (сейчас без `filter`).

**Критерий готовности:** на реальном тач-экране или эмуляции нажатие явно «отзывается», без ломания `prefers-reduced-motion` (анимация scale — по желанию отключить в `@media (prefers-reduced-motion: reduce)` тем же способом, что в проекте для других kiosk-анимаций).

---

## A3 — Высота кнопок numpad (телефон / код / SMS)

**Проблема:** ~52px и ниже рекомендаций по физическому размеру цели (дизайн 7).

**Файлы (минимум по документу):**

- [`apps/frontend/components/kiosk/kiosk-phone-identification-modal.tsx`](apps/frontend/components/kiosk/kiosk-phone-identification-modal.tsx) — сетка цифр (`h-[3.25rem]` и рядом).
- [`apps/frontend/components/kiosk/PreRegRedemptionModal.tsx`](apps/frontend/components/kiosk/PreRegRedemptionModal.tsx) — аналогичные кнопки.
- [`apps/frontend/app/[locale]/kiosk/[unitId]/page.tsx`](apps/frontend/app/[locale]/kiosk/[unitId]/page.tsx) — блок post-ticket SMS: `Button` в `grid-cols-3` с `h-10` / `sm:h-12`.

**Целевые классы (ориентир из kiosk-design.md):** `h-[4.5rem] sm:h-[5rem]` для ячеек цифр, `gap-2 sm:gap-3` для сетки; шрифт цифр не обрезать (`text-3xl sm:text-4xl` где уже есть — проверить после увеличения высоты).

**Опционально в той же задаче:** выровнять [`pin-code-modal.tsx`](apps/frontend/components/kiosk/pin-code-modal.tsx) (`h-12`) к тем же целям для единообразия PIN-ввода на киоске.

**Критерий готовности:** кнопки цифр в указанных модалах и SMS-numpad на странице киоска визуально крупнее; модал не ломается на узкой ширине (sm breakpoint).

---

## A4 — Успех талона: таймер автозакрытия и крупнее номер / QR (в рамках Dialog)

**Проблема:** 5 секунд мало; номер ~72px слабоват на большом экране до полноэкранной фазы C (дизайн 5).

**Решение:**

1. **Конфиг:** добавить в [`packages/shared-types/src/index.ts`](packages/shared-types/src/index.ts) в `KioskConfigSchema` (и тип `KioskConfig`) поле, например `ticketSuccessAutoCloseSec: z.number().int().positive().max(120).optional()` с семантикой «секунды до автозакрытия success-диалога, когда не блокирует SMS».
2. **Дефолт:** **12** секунд, если поле не задано (явно задокументировать смену поведения с текущих фиксированных 5 с).
3. **Страница киоска:** в `scheduleTicketModalAutoClose` и начальном `setCountdown` использовать значение из `unit?.config?.kiosk?.ticketSuccessAutoCloseSec ?? 12`.
4. **Админка:** в [`apps/frontend/components/admin/units/kiosk-settings.tsx`](apps/frontend/components/admin/units/kiosk-settings.tsx) — поле ввода с подсказкой (рядом с другими kiosk-таймингами, например session idle).
5. **Типографика в том же `Dialog`:** номер очереди — `text-8xl` / `sm:text-9xl` (или ближайший эквивалент); QR — **~200px** (`size={200}` у `QRCode`).
6. **Тесты схемы:** обновить при необходимости [`packages/shared-types/src/schemas.test.ts`](packages/shared-types/src/schemas.test.ts) для нового ключа.

**Критерий готовности:** после выдачи талона отсчёт и авто-закрытие соответствуют конфигу; без конфига — 12 с; номер и QR заметно крупнее.

---

## Вне скоупа фазы A

- Attract screen, bottom-bar session idle, full-screen success, auto-layout, дефолтные иконки по категориям, базовые темы — фазы B–F.

---

## Проверка перед merge

- [x] Ручной прогон: киоск → ветвь/лист, тайл, телефон, pre-reg код, success + SMS numpad.
- [x] `pnpm nx run frontend:lint` (или целевой lint проекта).
- [x] Нет регрессий i18n: новые подписи админки — через существующие namespaces переводов.

---

## Порядок работ внутри фазы A (рекомендуемый)

1. A2 (один файл, низкий риск).  
2. A1.  
3. A3.  
4. A4 (схема → страница → админка → визуальные классы).

После завершения фазы A основной план можно двигать к фазе B без возврата к этим пунктам.
