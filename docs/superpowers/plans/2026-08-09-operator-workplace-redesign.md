# Operator Workplace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перестроить `/staff/[unitId]/[counterId]` в фиксированное desktop-рабочее место «Фокус + очередь», где активный талон, одно главное действие, выбранный scope услуг, ФИО и время ожидания видны без прокрутки страницы.

**Architecture:** Маршрут остаётся координатором query, WebSocket и мутаций. Чистые вычисления очереди, call-next scope и доступных действий выносятся в `lib`; существующие крупные компоненты получают узкие view-props. Desktop shell занимает доступную высоту viewport, а прокрутка остаётся только в очереди и правом Sheet подробностей. Сведения о передаче берутся только из существующего `useClientVisits` с тем же query key, который уже использует история посетителя.

**Tech Stack:** Next.js 16.2+, React 19, TypeScript 6, Tailwind CSS 4, TanStack Query v5, next-intl, Radix/shadcn UI, Vitest, Testing Library, jest-axe.

## Global Constraints

- Реализовать согласованную спецификацию: `docs/superpowers/specs/2026-08-09-operator-workplace-redesign-design.md`.
- Не менять backend, OpenAPI, Orval-клиенты и алгоритм серверного выбора следующего талона.
- Не показывать сотрудника, передавшего талон: такого поля нет в `ClientVisitTransferEvent`.
- Не выполнять `clientVisits`-запросы для строк общей очереди; сводка передачи допустима только для активного неанонимного посетителя.
- Сохранить текущий ключ scope: `staff-service-scope:${unitId}:${counterId}`.
- Сохранить `onlyMyZone` как persisted-настройку. Режим «Показать все талоны» сделать временным состоянием текущего mount и не записывать в `localStorage`.
- На desktop 1366×768 и 1440×900 не должно быть page scroll. Внутренний scroll разрешён списку очереди и Sheet подробностей. Ниже desktop breakpoint допустим обычный поток страницы.
- Высота главных кнопок — не менее 44 px, вторичных desktop-контролов — не менее 36 px. Цветовой SLA-сигнал всегда сопровождается текстом/маркером.
- Сохранять все существующие операции: call next, pick конкретного талона, start, complete, recall, no-show, return, transfer, break/resume, release counter, create ticket, visitor linking, tags, notes and history.
- Каждый task начинается с падающего теста, затем минимальная реализация и повторный прогон. Не смешивать несвязанные рефакторинги.

---

### Task 1: Зафиксировать чистую модель scope, очереди и главного действия

**Files:**

- Create: `apps/frontend/lib/staff-workstation-view.ts`
- Create: `apps/frontend/lib/staff-workstation-view.test.ts`

- [ ] **Step 1: Написать падающие тесты вычисления очереди**

Создать фабрику минимального `Ticket` через `TicketModelSchema.parse` и покрыть порядок применения фильтров: сначала зона, затем выбранные услуги, затем временный full-list override.

```ts
it("keeps call-next scope while temporarily showing the full zone queue", () => {
  const result = deriveStaffQueueView({
    waitingTickets: [ticket("a", "service-a", "zone-1"), ticket("b", "service-b", "zone-1")],
    serviceScopeStatus: "ready",
    selectedServiceIds: ["service-a"],
    allLeafServiceIds: ["service-a", "service-b"],
    onlyMyZone: true,
    counterServiceZoneId: "zone-1",
    showAllTemporarily: true,
  });

  expect(result.scopedWaiting.map((item) => item.id)).toEqual(["a"]);
  expect(result.visibleWaiting.map((item) => item.id)).toEqual(["a", "b"]);
  expect(result.callNextServiceIds).toEqual(["service-a"]);
});
```

Добавить случаи:

- all leaf services → `callNextServiceIds === undefined`;
- один выбранный service → отфильтрованный список и массив с одним id;
- `onlyMyZone` исключает другую зону до service-filter;
- пустой набор leaf services не отбрасывает очередь и даёт `undefined` для API;
- результат сортируется от самого раннего `createdAt` к позднему;
- `showAllTemporarily: false` возвращает только scoped rows.

- [ ] **Step 2: Запустить unit-тест и убедиться, что он падает из-за отсутствующего модуля**

Run: `pnpm --dir apps/frontend vitest run lib/staff-workstation-view.test.ts`

Expected: FAIL с `Cannot find module './staff-workstation-view'`.

- [ ] **Step 3: Реализовать чистые функции с явными контрактами**

```ts
import type { Ticket } from "@/lib/api";

export type StaffPrimaryAction = "call_next" | "start_service" | "complete" | "resume" | "blocked";

export type StaffServiceScopeStatus = "pending" | "error" | "hydrating" | "ready";

export interface StaffQueueViewInput {
  waitingTickets: readonly Ticket[];
  serviceScopeStatus: StaffServiceScopeStatus;
  selectedServiceIds: readonly string[];
  allLeafServiceIds: readonly string[];
  onlyMyZone: boolean;
  counterServiceZoneId?: string | null;
  showAllTemporarily: boolean;
}

export interface StaffQueueView {
  serviceScopeReady: boolean;
  zoneWaiting: Ticket[];
  scopedWaiting: Ticket[];
  visibleWaiting: Ticket[];
  callNextServiceIds: string[] | undefined;
}

export function deriveStaffQueueView(input: StaffQueueViewInput): StaffQueueView;

export function getStaffPrimaryAction(ticketStatus: string | undefined, workstationOnBreak: boolean): StaffPrimaryAction;

export function summarizeServiceScope(leaves: readonly { id: string; label: string }[], selectedIds: readonly string[]): { kind: "all" | "single" | "multiple"; labels: string[]; count: number };
```

Правила `getStaffPrimaryAction`: break → `resume`, no ticket → `call_next`, `called` → `start_service`, `in_service` → `complete`, неожиданный статус активного талона → `blocked`. `call_next` разрешён только когда активного талона фактически нет. Пока `serviceScopeStatus !== 'ready'`, view model возвращает `serviceScopeReady: false`, пустые очереди и не допускает вызов следующего талона.

- [ ] **Step 4: Дописать тесты primary action и summary scope**

Проверить четыре состояния действия, «все услуги», одну услугу и компактное `multiple`-резюме с точным `count`.

- [ ] **Step 5: Запустить тесты и type-aware frontend lint для файла**

Run: `pnpm --dir apps/frontend vitest run lib/staff-workstation-view.test.ts`

Expected: PASS.

Run: `pnpm --dir apps/frontend exec eslint lib/staff-workstation-view.ts lib/staff-workstation-view.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/lib/staff-workstation-view.ts apps/frontend/lib/staff-workstation-view.test.ts
git commit -m "test(staff): define workstation view model"
```

---

### Task 2: Сделать фиксированный desktop shell без влияния на остальные маршруты

**Files:**

- Create: `apps/frontend/components/staff/StaffWorkstationShell.tsx`
- Create: `apps/frontend/components/staff/StaffWorkstationShell.test.tsx`
- Modify: `apps/frontend/components/ProtectedSidebarLayout.tsx`
- Modify: `apps/frontend/components/ConditionalLayout.tsx`
- Test: `apps/frontend/components/ConditionalLayout.test.tsx` (create if absent)

- [ ] **Step 1: Написать падающий тест shell**

Замокать `useSidebar`, отрендерить header/main/queue slots и проверить:

- `setOpen(false)` вызывается один раз после mount;
- shell имеет `data-testid="staff-workstation-shell"`;
- desktop root содержит `md:h-full`, `md:min-h-0` и `md:overflow-hidden`;
- main и queue slots имеют `min-h-0`, queue slot — отдельную высотную область;
- заголовок, unit/counter name и status controls остаются в DOM.

- [ ] **Step 2: Запустить тест и получить ожидаемый FAIL**

Run: `pnpm --dir apps/frontend vitest run components/staff/StaffWorkstationShell.test.tsx`

Expected: FAIL из-за отсутствующего компонента.

- [ ] **Step 3: Реализовать shell как layout-only компонент**

Интерфейс:

```ts
export interface StaffWorkstationShellProps {
  unitName: string;
  counterName: string;
  operatorName: string;
  statusControls: ReactNode;
  main: ReactNode;
  queue: ReactNode;
}
```

Структура desktop:

```tsx
<section data-testid="staff-workstation-shell" className="flex min-w-0 flex-col gap-3 min-[1366px]:h-full min-[1366px]:min-h-0 min-[1366px]:overflow-hidden">
  <header className="flex shrink-0 items-center justify-between gap-3">
    <div className="min-w-0">
      <p className="truncate text-xs">{unitName}</p>
      <h1 className="truncate text-xl font-bold">{counterName}</h1>
      <p className="text-muted-foreground truncate text-xs">{operatorName}</p>
    </div>
    <div className="shrink-0">{statusControls}</div>
  </header>
  <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_25rem]">
    <main className="min-h-0 min-w-0">{main}</main>
    <aside className="min-h-0 min-w-0">{queue}</aside>
  </div>
</section>
```

В `useEffect` вызвать `setOpen(false)` один раз при первом mount. Не закрывать sidebar повторно при ручном раскрытии.

- [ ] **Step 4: Передать route-specific content class через layout chain**

Добавить `contentClassName?: string` в `ProtectedSidebarLayoutProps` и передать в `SidebarInsetShell`.

В `ConditionalLayout` вычислить:

```ts
const isStaffWorkstationPath = /^\/staff\/[^/]+\/[^/]+$/.test(pathWithoutLocale);
```

Только для этого route передать:

```ts
contentClassName={
  isStaffWorkstationPath
    ? 'min-[1366px]:h-dvh min-[1366px]:min-h-0 min-[1366px]:overflow-hidden min-[1366px]:p-3'
    : undefined
}
```

Не менять padding/overflow для `/staff`, `/staff/support` и остальных routes.

- [ ] **Step 5: Добавить route regression test**

Проверить exact workplace path и соседние пути. Вынести predicate в именованный export `isStaffWorkstationPath(path: string): boolean`, чтобы тест не зависел от полного auth/sidebar дерева.

- [ ] **Step 6: Запустить тесты и lint**

Run: `pnpm --dir apps/frontend vitest run components/staff/StaffWorkstationShell.test.tsx components/ConditionalLayout.test.tsx`

Expected: PASS.

Run: `pnpm --dir apps/frontend exec eslint components/staff/StaffWorkstationShell.tsx components/staff/StaffWorkstationShell.test.tsx components/ProtectedSidebarLayout.tsx components/ConditionalLayout.tsx components/ConditionalLayout.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/components/staff/StaffWorkstationShell.tsx apps/frontend/components/staff/StaffWorkstationShell.test.tsx apps/frontend/components/ProtectedSidebarLayout.tsx apps/frontend/components/ConditionalLayout.tsx apps/frontend/components/ConditionalLayout.test.tsx
git commit -m "feat(staff): add fixed workstation shell"
```

---

### Task 3: Свести action panel к одному главному действию по состоянию

**Files:**

- Modify: `apps/frontend/components/staff/StaffWorkstationActionPanel.tsx`
- Create: `apps/frontend/components/staff/StaffWorkstationActionPanel.test.tsx`
- Modify: `apps/frontend/messages/ru.json`
- Modify: `apps/frontend/messages/en.json`

- [ ] **Step 1: Написать table-driven component tests**

Проверить доступные кнопки и единственный `data-variant="primary-workflow"`:

| Input        | Primary        | Secondary                               |
| ------------ | -------------- | --------------------------------------- |
| no ticket    | `callNext`     | none in panel                           |
| `called`     | `startService` | recall, noShow, returnToQueue, transfer |
| `in_service` | `complete`     | transfer, returnToQueue                 |
| break        | `resume`       | release counter lives in header         |

Отдельно проверить:

- pending primary имеет `aria-busy="true"` и повторный click не вызывает handler;
- no waiting tickets disables call-next и показывает текст причины;
- `actionError` рендерится в `role="alert"`;
- скрытые для статуса действия отсутствуют, а не остаются disabled clutter.

- [ ] **Step 2: Запустить тест и получить FAIL на текущей равновесной панели кнопок**

Run: `pnpm --dir apps/frontend vitest run components/staff/StaffWorkstationActionPanel.test.tsx`

Expected: FAIL на количестве primary controls и status-specific visibility.

- [ ] **Step 3: Обновить props без переноса бизнес-логики в компонент**

```ts
export interface StaffWorkstationActionPanelProps {
  t: TFn;
  workstationOnBreak?: boolean;
  currentTicket: Ticket | undefined;
  waitingCount: number;
  actionError?: string | null;
  resumePending?: boolean;
  releasePending?: boolean;
  callNextPending: boolean;
  confirmArrivalPending: boolean;
  completePending: boolean;
  transferPending: boolean;
  noShowPending: boolean;
  returnToQueuePending?: boolean;
  recallPending?: boolean;
  onResume?: () => void;
  onCallNext: () => void;
  onConfirmArrival: () => void;
  onComplete: () => void;
  onOpenTransfer: () => void;
  onNoShow: () => void;
  onReturnToQueue?: () => void;
  onRecall?: () => void;
}
```

Главную кнопку рендерить из `getStaffPrimaryAction`; высота `h-11`, full-width в основной колонке. Вторичные действия — `h-9`. На break панель показывает только Resume; release остаётся в header shell.

- [ ] **Step 4: Добавить понятные причины блокировки и inline error copy**

Добавить RU/EN ключи под `staff.actions`:

- `call_next_empty_reason`;
- `disabled_on_break_reason`;
- `action_error`;
- `processing_action`.

Не удалять существующие ключи, чтобы не ломать другие consumers.

- [ ] **Step 5: Запустить тест, a11y assertion и lint**

В тесте прогнать `axe(container)` для idle/called/break и ожидать отсутствие violations.

Run: `pnpm --dir apps/frontend vitest run components/staff/StaffWorkstationActionPanel.test.tsx`

Expected: PASS.

Run: `pnpm --dir apps/frontend exec eslint components/staff/StaffWorkstationActionPanel.tsx components/staff/StaffWorkstationActionPanel.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/components/staff/StaffWorkstationActionPanel.tsx apps/frontend/components/staff/StaffWorkstationActionPanel.test.tsx apps/frontend/messages/ru.json apps/frontend/messages/en.json
git commit -m "feat(staff): prioritize workstation actions by state"
```

---

### Task 4: Перестроить очередь в постоянную колонку с единым service scope

**Files:**

- Modify: `apps/frontend/components/staff/StaffQueuePanel.tsx`
- Modify: `apps/frontend/components/staff/StaffServiceScopeSelector.tsx`
- Create: `apps/frontend/components/staff/StaffQueuePanel.test.tsx`
- Create: `apps/frontend/components/staff/StaffServiceScopeSelector.test.tsx`
- Modify: `apps/frontend/messages/ru.json`
- Modify: `apps/frontend/messages/en.json`

- [ ] **Step 1: Написать тесты service selector**

Проверить:

- снять последнюю услугу нельзя;
- `select_all` возвращает все ids;
- одна выбранная услуга показывает её label в summary;
- несколько показывают первый label и счётчик остальных;
- полный scope показывает `scope.all_services`.

Добавить props:

```ts
summary?: { kind: 'all' | 'single' | 'multiple'; labels: string[]; count: number };
waitingCount?: number;
```

Summary — постоянный компактный блок над списком, dialog продолжает содержать multi-select.

- [ ] **Step 2: Написать тесты queue states**

Проверить row fields: номер, ФИО, fallback `queue.no_name`, service, live wait label, SLA `queue.sla_warning`/`queue.sla_overdue`, Call button.

Проверить panel states:

- loading показывает 5 skeleton rows и сохраняет header;
- error показывает `role="alert"` и Retry;
- empty scoped state упоминает выбранные услуги;
- long list находится в единственном `data-testid="staff-queue-scroll"` с `overflow-y-auto`;
- full-list override показывает постоянное предупреждение и не меняет summary scope;
- current ticket/break блокируют row Call, но строки остаются видимыми.

- [ ] **Step 3: Запустить оба теста и получить FAIL**

Run: `pnpm --dir apps/frontend vitest run components/staff/StaffServiceScopeSelector.test.tsx components/staff/StaffQueuePanel.test.tsx`

Expected: FAIL на новых props/states.

- [ ] **Step 4: Обновить контракт очереди**

```ts
export interface StaffQueuePanelProps {
  t: TFn;
  unitId: string;
  canReadUserData: boolean;
  counterOnBreak?: boolean;
  waitingTickets: Ticket[];
  scopedWaitingCount: number;
  queuePending: boolean;
  queueRefreshing: boolean;
  queueError?: Error | null;
  onRetryQueue: () => void;
  showAllTicketsInQueue: boolean;
  onShowAllTicketsInQueueChange: (value: boolean) => void;
  onlyMyZone?: boolean;
  onOnlyMyZoneChange?: (value: boolean) => void;
  serviceNames: Record<string, string>;
  leafServicesForCreate: { id: string; label: string }[];
  createTicketPending: boolean;
  onCreateTicket: (input: { serviceId: string; clientId?: string }) => Promise<void>;
  scopeLeaves: { id: string; label: string }[];
  selectedScopeIds: string[];
  scopeSummary: { kind: "all" | "single" | "multiple"; labels: string[]; count: number };
  onScopeChange: (ids: string[]) => void;
  pickPending: boolean;
  inProgressTicketId: string | null;
  setInProgressTicketId: (id: string | null) => void;
  currentTicket: Ticket | undefined;
  onPickTicket: (ticket: Ticket) => Promise<void>;
  onShowDetails: (ticket: Ticket) => void;
  services: Service[];
}
```

Header и filter controls — `shrink-0`; список — `min-h-0 flex-1 overflow-y-auto`; внешний Card — `flex h-full min-h-0 flex-col overflow-hidden`. Удалить sticky/max-height формулы, потому что высоту задаёт shell.

Переместить `show all` и `only my zone` в компактное filter popover/dialog. При `showAllTicketsInQueue` держать warning между header и scroll list. `show all` остаётся управляемым prop и не пишет storage.

- [ ] **Step 5: Обновить row sizes и SLA semantics**

Call: `h-9`; info control: `size-9`. Добавить текстовый badge `SLA` + warning/overdue copy, не полагаться только на красную/янтарную border.

Исправить дублированную декларацию `onCall` в `StaffQueueTicketRow` props во время этого локального изменения.

- [ ] **Step 6: Добавить RU/EN copy**

Под `staff.scope`: `all_services`, `selected_one`, `selected_many`, `matching_count`.

Под `staff.queue`: `filters`, `temporary_all_warning`, `empty_scoped`, `retry`, `loading`, `refreshing`, `sla_warning`, `sla_overdue`.

- [ ] **Step 7: Запустить tests, a11y и lint**

Run: `pnpm --dir apps/frontend vitest run components/staff/StaffServiceScopeSelector.test.tsx components/staff/StaffQueuePanel.test.tsx`

Expected: PASS; `axe` не находит violations в populated, empty и error states.

Run: `pnpm --dir apps/frontend exec eslint components/staff/StaffQueuePanel.tsx components/staff/StaffQueuePanel.test.tsx components/staff/StaffServiceScopeSelector.tsx components/staff/StaffServiceScopeSelector.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/components/staff/StaffQueuePanel.tsx apps/frontend/components/staff/StaffQueuePanel.test.tsx apps/frontend/components/staff/StaffServiceScopeSelector.tsx apps/frontend/components/staff/StaffServiceScopeSelector.test.tsx apps/frontend/messages/ru.json apps/frontend/messages/en.json
git commit -m "feat(staff): make queue scope permanently visible"
```

---

### Task 5: Показать последнюю доступную передачу активного талона

**Files:**

- Create: `apps/frontend/lib/visit-transfer-display.ts`
- Create: `apps/frontend/lib/visit-transfer-display.test.ts`
- Modify: `apps/frontend/components/visitors/VisitTransferTrail.tsx`
- Create: `apps/frontend/components/staff/StaffCurrentTransferSummary.tsx`
- Create: `apps/frontend/components/staff/StaffCurrentTransferSummary.test.tsx`
- Modify: `apps/frontend/components/staff/StaffCurrentTicketHero.tsx`
- Modify: `apps/frontend/messages/ru.json`
- Modify: `apps/frontend/messages/en.json`

- [ ] **Step 1: Написать падающие formatter tests**

Контракт:

```ts
export interface TransferDisplayLine {
  kind: "service" | "counter" | "zone";
  from: string;
  to: string;
}

export function localizedTransferServiceName(event: ClientVisitTransferEvent, side: "from" | "to", locale: string): string | null;

export function getTransferDisplayLines(event: ClientVisitTransferEvent, locale: string): TransferDisplayLine[];

export function getLatestTransfer(trail: readonly ClientVisitTransferEvent[] | undefined): ClientVisitTransferEvent | null;
```

Проверить RU/EN fallback, сортировку latest по `at`, отсутствие пустых строк и zone-transfer-to-queue без выдуманного destination counter.

- [ ] **Step 2: Запустить formatter test и получить FAIL**

Run: `pnpm --dir apps/frontend vitest run lib/visit-transfer-display.test.ts`

Expected: FAIL из-за отсутствующего файла.

- [ ] **Step 3: Перенести существующую локализацию из `VisitTransferTrail` в общий formatter**

`VisitTransferTrail` должен импортировать функции из `lib/visit-transfer-display.ts` и сохранить текущий внешний вид/ключи. Formatter возвращает `null`, а не `—`, если поле полностью отсутствует; placeholder добавляется только там, где существующий полный trail требует его для читаемости.

- [ ] **Step 4: Написать component test summary**

Проверить:

- пустой trail → компонент возвращает `null`;
- показывается только latest event;
- отображаются только заполненные service/counter/zone lines;
- employee name нигде не появляется;
- `onOpenFullTrail` вызывается по кнопке `visitor_context.transfer_show_all`;
- время имеет `<time dateTime={event.at}>`.

- [ ] **Step 5: Реализовать `StaffCurrentTransferSummary` и подключить к hero**

Props:

```ts
export interface StaffCurrentTransferSummaryProps {
  trail: ClientVisitTransferEvent[] | undefined;
  locale: string;
  t: TFn;
  onOpenFullTrail: () => void;
}
```

Расширить `StaffCurrentTicketHeroProps`:

```ts
transferTrail?: ClientVisitTransferEvent[];
locale: string;
onOpenVisitorDetails: () => void;
```

`onShowDetails` оставить для pre-registration/document modal; новая кнопка `visitor_context.open_details` открывает visitor Sheet. Summary размещается ниже основных ticket metrics и не резервирует место при отсутствии trail.

- [ ] **Step 6: Добавить RU/EN copy и прогнать tests**

Ключи: `visitor_context.last_transfer`, `visitor_context.transfer_show_all`, `visitor_context.open_details`, `visitor_context.transferred_at`.

Run: `pnpm --dir apps/frontend vitest run lib/visit-transfer-display.test.ts components/staff/StaffCurrentTransferSummary.test.tsx`

Expected: PASS.

Run: `pnpm --dir apps/frontend exec eslint lib/visit-transfer-display.ts lib/visit-transfer-display.test.ts components/visitors/VisitTransferTrail.tsx components/staff/StaffCurrentTransferSummary.tsx components/staff/StaffCurrentTransferSummary.test.tsx components/staff/StaffCurrentTicketHero.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/lib/visit-transfer-display.ts apps/frontend/lib/visit-transfer-display.test.ts apps/frontend/components/visitors/VisitTransferTrail.tsx apps/frontend/components/staff/StaffCurrentTransferSummary.tsx apps/frontend/components/staff/StaffCurrentTransferSummary.test.tsx apps/frontend/components/staff/StaffCurrentTicketHero.tsx apps/frontend/messages/ru.json apps/frontend/messages/en.json
git commit -m "feat(staff): show available ticket transfer summary"
```

---

### Task 6: Перенести заметки и историю посетителя в правый Sheet

**Files:**

- Create: `apps/frontend/components/staff/StaffVisitorDetailsSheet.tsx`
- Create: `apps/frontend/components/staff/StaffVisitorDetailsSheet.test.tsx`
- Modify: `apps/frontend/components/staff/StaffVisitorContextPanel.tsx`
- Modify: `apps/frontend/messages/ru.json`
- Modify: `apps/frontend/messages/en.json`

- [ ] **Step 1: Написать падающий Sheet test**

Проверить:

- closed Sheet не показывает panel content;
- trigger/open prop показывает title и panel;
- content закреплён справа и имеет внутренний `overflow-y-auto`;
- Escape закрывает Sheet и focus возвращается на trigger;
- active ticket change закрывает старый Sheet на уровне route integration (Task 7);
- `axe` не возвращает violations.

- [ ] **Step 2: Запустить test и получить FAIL**

Run: `pnpm --dir apps/frontend vitest run components/staff/StaffVisitorDetailsSheet.test.tsx`

Expected: FAIL из-за отсутствующего компонента.

- [ ] **Step 3: Добавить embedded variant существующей visitor panel**

Добавить в `StaffVisitorContextPanel` prop `variant?: 'card' | 'sheet'`. В `sheet` убрать внешний border/card chrome и ограничения высоты, но не менять hooks, mutations, dialogs, query key или business operations.

- [ ] **Step 4: Реализовать управляемый Sheet**

```ts
export interface StaffVisitorDetailsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId: string;
  ticket: Ticket | undefined;
  locale: string;
  t: TFn;
}
```

Использовать существующие `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription`. `SheetContent` — `w-full overflow-hidden sm:max-w-xl`; дочерний body — `min-h-0 flex-1 overflow-y-auto`. При `ticket === undefined` Sheet не открывать.

- [ ] **Step 5: Добавить copy, прогнать test/lint**

Добавить `visitor_context.details_title` и `visitor_context.details_description` в RU/EN.

Run: `pnpm --dir apps/frontend vitest run components/staff/StaffVisitorDetailsSheet.test.tsx`

Expected: PASS.

Run: `pnpm --dir apps/frontend exec eslint components/staff/StaffVisitorDetailsSheet.tsx components/staff/StaffVisitorDetailsSheet.test.tsx components/staff/StaffVisitorContextPanel.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/components/staff/StaffVisitorDetailsSheet.tsx apps/frontend/components/staff/StaffVisitorDetailsSheet.test.tsx apps/frontend/components/staff/StaffVisitorContextPanel.tsx apps/frontend/messages/ru.json apps/frontend/messages/en.json
git commit -m "feat(staff): move visitor context into details sheet"
```

---

### Task 7: Интегрировать shell, data states и существующие операции в route

**Files:**

- Modify: `apps/frontend/app/[locale]/staff/[unitId]/[counterId]/page.tsx`
- Modify: `apps/frontend/components/staff/StaffIdleWorkstationHero.tsx`
- Create: `apps/frontend/app/[locale]/staff/[unitId]/[counterId]/page.test.tsx`
- Modify: `apps/frontend/messages/ru.json`
- Modify: `apps/frontend/messages/en.json`

- [ ] **Step 1: Написать route integration tests с моками hooks/API**

Покрыть отдельными тестами:

1. idle: visible queue и primary Call next;
2. selected service: одна и та же `selectedServiceIds` фильтрует rows и попадает в `callNextMutation.mutateAsync({ counterId, serviceIds })`;
3. temporary show-all: row другой услуги видим, но call-next payload остаётся scoped;
4. called: Start primary, recall/no-show/return/transfer secondary;
5. in_service: Complete primary, transfer/return secondary;
6. break: queue видима, row actions disabled, Resume primary;
7. query pending: stable card/queue skeletons;
8. refetch error with cached data: cached active ticket остаётся, inline Retry видим;
9. action failure: inline `role="alert"` и toast оба вызываются;
10. linked active visitor: route и Sheet используют одинаковый query key `['clientVisits', unitId, clientId]`, поэтому TanStack Query делит один cache/network request между потребителями; текущий visit находится по `ticket.id`, latest trail передаётся hero;
11. anonymous/no client: client-visits query disabled, transfer summary отсутствует;
12. visitor details Sheet открывается из hero и закрывается при смене active ticket id.

- [ ] **Step 2: Запустить route test и получить FAIL**

Run: `pnpm --dir apps/frontend vitest run 'app/[locale]/staff/[unitId]/[counterId]/page.test.tsx'`

Expected: FAIL на старом layout/state behavior.

- [ ] **Step 3: Заменить локальные queue calculations на view model**

Деструктурировать ticket query:

```ts
const {
  data: ticketsData,
  error: ticketsError,
  isPending: ticketsPending,
  isFetching: ticketsFetching,
  refetch,
} = useTickets(unitId, {
  enabled: Boolean(unitId),
  refetchInterval: 12_000,
});
```

Удалить `queueViewAllKey`, чтение/запись `staff-queue-show-all:*` и связанный `skipQueuePrefsPersistRef`. Оставить `showAllQueueTickets` обычным `useState(false)`. `onlyMyZone` продолжает загружаться и сохраняться отдельно.

Использовать:

```ts
const queueView = useMemo(
  () =>
    deriveStaffQueueView({
      waitingTickets,
      serviceScopeStatus,
      selectedServiceIds: scopeForFilter,
      allLeafServiceIds: leafServiceIds,
      onlyMyZone,
      counterServiceZoneId: myCounter?.serviceZoneId,
      showAllTemporarily: showAllQueueTickets,
    }),
  [waitingTickets, serviceScopeStatus, scopeForFilter, leafServiceIds, onlyMyZone, myCounter?.serviceZoneId, showAllQueueTickets],
);
```

`handleCallNext` использует только `queueView.callNextServiceIds` и завершается без мутации, пока `queueView.serviceScopeReady === false`. `waitingCount` главной кнопки — `queueView.scopedWaiting.length`, никогда не `visibleWaiting.length`.

- [ ] **Step 4: Подключить client visits без N+1**

```ts
const activeClientId = currentTicket?.client && !currentTicket.client.isAnonymous ? currentTicket.client.id : undefined;

const { data: activeClientVisits } = useClientVisits(unitId, activeClientId, {
  enabled: Boolean(activeClientId),
});

const activeVisitTransferTrail = useMemo(() => activeClientVisits?.items.find((visit) => visit.id === currentTicket?.id)?.transferTrail, [activeClientVisits?.items, currentTicket?.id]);
```

Не копировать query logic в queue rows. `StaffVisitorContextPanel` внутри Sheet продолжает вызывать тот же hook/key; TanStack Query переиспользует cache.

- [ ] **Step 5: Добавить inline action error orchestration**

Создать `const [actionError, setActionError] = useState<string | null>(null)`. Перед каждой action mutation очищать его. В каждом `catch` устанавливать локализованный понятный текст и оставлять существующий toast. При success очищать error. Transfer validation errors также показывать в dialog или action group, не только toast.

- [ ] **Step 6: Собрать page через новые компоненты**

Убрать ранний return, который заменяет весь экран при `error`; ticket error передать зонам, сохраняя cached data.

`StaffWorkstationShell` получает:

- header: unit, counter, operator, break/status, Release;
- main: current/idle/break hero + action panel;
- queue: обновлённый `StaffQueuePanel` с `queueView.visibleWaiting`;
- sibling overlay: transfer Dialog, pre-registration modal, visitor details Sheet.

Основная карточка: `flex h-full min-h-0 flex-col overflow-hidden`; visitor panel больше не рендерится inline. Break hero остаётся в main, очередь остаётся справа.

При смене `currentTicket?.id` выполнить `setVisitorDetailsOpen(false)`, чтобы не показывать устаревший визит.

- [ ] **Step 7: Уточнить idle/loading/error copy**

`StaffIdleWorkstationHero` получает `scopeSummary` или готовую строку и объясняет, сколько талонов подходит выбранным услугам. Добавить недостающие RU/EN ключи `current.loading`, `current.load_error`, `current.retry`, `current.scope_empty_hint`, `workstation.status_active`.

- [ ] **Step 8: Запустить route/component regression tests**

Run: `pnpm --dir apps/frontend vitest run 'app/[locale]/staff/[unitId]/[counterId]/page.test.tsx' components/staff/StaffWorkstationActionPanel.test.tsx components/staff/StaffQueuePanel.test.tsx components/staff/StaffVisitorDetailsSheet.test.tsx components/staff/StaffCurrentTransferSummary.test.tsx`

Expected: PASS.

Run: `pnpm --dir apps/frontend exec eslint 'app/[locale]/staff/[unitId]/[counterId]/page.tsx' 'app/[locale]/staff/[unitId]/[counterId]/page.test.tsx' components/staff/StaffIdleWorkstationHero.tsx`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add 'apps/frontend/app/[locale]/staff/[unitId]/[counterId]/page.tsx' 'apps/frontend/app/[locale]/staff/[unitId]/[counterId]/page.test.tsx' apps/frontend/components/staff/StaffIdleWorkstationHero.tsx apps/frontend/messages/ru.json apps/frontend/messages/en.json
git commit -m "feat(staff): integrate focused operator workplace"
```

---

### Task 8: Провести полную автоматическую и viewport-проверку

**Files:**

- Modify only if a failing check exposes an operator-workplace regression; add the narrowest test beside the affected code before the fix.

- [ ] **Step 1: Format all touched files**

Run: `pnpm nx run frontend:format:fix`

Run: `pnpm nx run frontend:format:check`

Expected: command exits 0.

- [ ] **Step 2: Run focused staff suite**

Run: `pnpm --dir apps/frontend vitest run lib/staff-workstation-view.test.ts lib/visit-transfer-display.test.ts components/staff/StaffWorkstationShell.test.tsx components/staff/StaffWorkstationActionPanel.test.tsx components/staff/StaffQueuePanel.test.tsx components/staff/StaffServiceScopeSelector.test.tsx components/staff/StaffCurrentTransferSummary.test.tsx components/staff/StaffVisitorDetailsSheet.test.tsx 'app/[locale]/staff/[unitId]/[counterId]/page.test.tsx'`

Expected: PASS.

- [ ] **Step 3: Run frontend project gates**

Run: `pnpm nx run frontend:test`

Expected: PASS.

Run: `pnpm nx run frontend:lint`

Expected: PASS.

Run: `pnpm nx build frontend`

Expected: PASS.

- [ ] **Step 4: Start the existing local frontend and open a real staff workplace route**

Run: `pnpm nx dev frontend`

Expected: Next.js dev server starts on the configured local port. Reuse existing backend/session/test data; do not stop unrelated services or overwrite local env.

- [ ] **Step 5: Verify 1366×768 and 1440×900 in a rendered browser**

For both viewports record:

```js
({
  viewport: [window.innerWidth, window.innerHeight],
  pageScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  bodyScroll: document.body.scrollHeight - document.body.clientHeight,
  queueScroll: document.querySelector('[data-testid="staff-queue-scroll"]')?.scrollHeight - document.querySelector('[data-testid="staff-queue-scroll"]')?.clientHeight,
});
```

Expected:

- `pageScroll === 0` and `bodyScroll === 0`;
- active/idle hero, primary action, scope summary, queue count and first queue rows visible;
- long queue has positive internal `queueScroll` and can scroll without moving page;
- no clipped focus rings, buttons or translated labels.

- [ ] **Step 6: Exercise representative states and operations**

Проверить с реальными/seeded данными:

- idle → call next;
- selected single service → visible rows and call next both scoped;
- temporary show-all warning → rows expand, call next scope unchanged;
- called → start, recall, no-show, return, transfer dialog;
- in service → complete, return, transfer;
- break → queue visible, actions disabled, resume;
- create ticket;
- visitor Sheet: link/change visitor, tags, note save, history;
- linked visitor with transfer trail and visitor without trail;
- WebSocket update and 12-second polling refresh;
- loading, empty, cached-data refresh error and action error.

Expected: existing workflows remain usable; only queue and Sheet scroll internally.

- [ ] **Step 7: Add regression tests before fixing any discovered defect**

For each defect found in Steps 3–6, first reproduce it in the nearest unit/component/route test, confirm FAIL, make the smallest in-scope fix, then rerun the focused and affected full gate.

- [ ] **Step 8: Commit verification fixes if any**

If no fixes were needed, skip this commit. Otherwise inspect `git diff --name-only`, stage only the exact operator-workplace files changed by the verified defect, then run `git commit -m "fix(staff): resolve workstation verification findings"`. Do not use `git add -A` or stage unrelated local files.

- [ ] **Step 9: Report acceptance boundaries**

Отдельно зафиксировать:

- automated tests/lint/build status;
- browser viewport evidence for 1366×768 and 1440×900;
- manual operation coverage;
- неподтверждённые внешние условия. Browser-проверку не называть реальной эксплуатационной приёмкой сотрудником.
