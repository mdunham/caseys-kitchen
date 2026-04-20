# Critical Inventory + Ordering Flows (Current Behavior)

This document captures the **current** flow behavior from the app’s existing render/state logic in `index.html`.

Scope requested:
- create count
- save count
- generate order
- log order
- receive order
- confirm receipt

> Note: this is documentation-only. No render logic or state behavior was changed.

## Shared state model used by all flows

Primary in-memory state is the `S` object. Flow-relevant keys:

- Count lifecycle: `S.countFormActive`, `S.countView`, `S.draft`, `S.walkIndex`, `S.countDraftSession`, `S.countDraftPrompt`, `S.historyMode`.
- Order lifecycle: `S.sessions`, `S.orders`, `S.orderView`, `S.orderWalkIndex`, `S.orderListHideScanned`.
- Receive lifecycle: order `status` transitions (`pending` -> `received`) plus `order_notes` and `confirmed_map`.
- Sync/error UX: `S.syncing`, `S.syncError`, `S.progressMessage`, `S.progressOnly`.

Render routing is centralized in `render()` and switches content by `S.tab`, plus count sub-mode (`historyMode`, `initialSetupActive`).

---

## 1) Create count

### Entry point
- User action: **Start new count** from Count lock modal or Count History view.
- Function: `startNewCountSession(opts={})`.

### Expected state transitions

#### A. Existing draft present (no `force`)
1. `S.countFormActive = true`
2. `S.countDraftPrompt = true`
3. `S.historyMode = false`
4. `S.editSessionId = null`, `S.editDraft = {}`
5. `S.countView = 'list'`
6. `render()` (resume prompt modal shown)

#### B. Fresh start (or force reset)
1. `S.historyMode = false`
2. Clear edit state (`S.editSessionId`, `S.editDraft`)
3. Require non-empty item catalog (`flattenWalkItems(...)` guard)
4. `S.countFormActive = true`
5. `S.countDraftPrompt = false`
6. `enterWalkCount(true)`:
   - resets `S.draft = {}`
   - resets `S.walkIndex = 0`
   - clears manual order adjustments
   - clears draft session state
   - sets `S.countView = 'walk'`
   - renders + focuses walk quantity input
7. `ensureCountDraftSession()` creates `status:'draft'` session (if needed)
8. `queueCountDraftSave({ immediate:true })`

### Key UI states from current render functions

In `renderCount()`:
- **Locked form state** (`!S.countFormActive`): modal with “Start new count” and “Previous counts”.
- **Resume draft prompt** (`S.countDraftPrompt && hasActiveCountDraft()`): modal with:
  - “Continue where I left off”
  - “Delete and start over”
- **Count view mode**: segmented control (`Full list` vs `Walk-through`).
- Header badge shows progress `counted/total`.

---

## 2) Save count

### Entry point
- User action: **Save Count** button in the Count tab's sticky footer (alongside the date display).
- Function: `completeInventory()`.
- Visibility: the footer Save Count button is only rendered when the count form is active (`!formLocked`); it is hidden while the start-new-count lock modal or resume-draft prompt is shown.

### Expected state transitions

1. Guard: return early when app is busy.
2. Resolve session ID:
   - use active draft ID if present, else create `sess_*` ID.
3. Build final count payload:
   - `counted_at = now`
   - `counts[item.id] = parseFloat(S.draft[item.id]) || 0`
   - local session object uses `status:'final'`.
4. Attempt DB save via `db.saveSession(...)`.
5. Both success and fallback-catch paths currently:
   - prepend session to `S.sessions`
   - persist sessions to local cache
   - clear draft session (`setCountDraftSessionState(null,{clearDraft:true})`)
   - reset count UI mode:
     - `S.countView = 'list'`
     - `S.countDraftPrompt = false`
     - `S.countManualOrderOpen = false`
   - run `syncCountFormAvailability()`
6. Success path:
   - sync state set ok
   - success banner
   - `setTab('order')` (automatic handoff to order generation screen)
7. Catch path:
   - sync error set
   - render current state

### Key UI states from current render functions

- Save Count button lives in the sticky footer and is disabled when `counted===0`. Its `disabled` state is live-updated by `setDraft()` via `#count-save-btn`.
- Progress bar reflects counted percent; when 100% it gets `.done` styling.
- Sync error banner is shown inline in Count view when `S.syncError` exists.

---

## 3) Generate order

### Entry point
- User action: open **Order** tab after a saved count (or via tab nav).
- Function: `renderOrder()`; data derives from `computeOrder()` and related filters.

### Expected state transitions (render-driven; no committed mutation)

1. Feature gate check (`renderFeatureGateBanner('order')`).
2. If no sessions: render empty state (“Take an inventory count first…”).
3. Read latest count context: `last = S.sessions[0]`.
4. Compute recommendations: `rawRecommended = computeOrder()`.
5. Resolve pending-order context:
   - `pendingForLatest = pendingOrderForLatestCount()`
   - `otherPending` = pending orders from older sessions
6. Resolve removable lines for current count when no pending exists:
   - `orderItems = rawRecommended` minus excluded set
   - `removedFromOrder` = excluded subset
7. Compute summary for display:
   - line count
   - qty total
   - scanned count (`getOrderAckFlags(...)`)

### Key UI states from current render functions

- Countdown card (deadline + truck arrival).
- “Based on count from …” banner.
- Pending order banners:
  - green success-style banner for same-count pending order (with delete/open receive actions)
  - warning banner for older pending orders
- Empty/special cases:
  - no recommendations -> “all items at or above par”
  - all lines excluded -> restore-only view, disabled “Log Order Placed”
- Two order modes:
  - `Full list`
  - `Walk-through`
- Scanned UX:
  - per-line scanned toggle
  - optional hide-scanned checkbox in list mode

---

## 4) Log order

### Entry point
- User action: **Log Order Placed** footer button in Order tab.
- Function: `logOrder()`.

### Expected state transitions

1. Guard: return if app busy.
2. Guard: if pending order already exists for latest count -> warning banner + return.
3. Build order lines from `recommendedOrderLines()`.
4. Guard: if zero lines -> warning banner + return.
5. Read scan-ack flags; if not all scanned, require confirm prompt to continue.
6. Construct order payload:
   - id `ord_*`
   - `ordered_at = now`
   - `session_id = S.sessions[0]?.id`
   - `status:'pending'`
   - each line as `{ recommended, received:null }`
7. Attempt DB save `db.saveOrder(...)`.
8. Success path:
   - prepend to `S.orders`
   - persist orders local cache
   - clear stored order scan ack state
   - clear manual order adjustments + line exclusions for that session
   - success banner
   - `setTab('receive')`
9. Catch path:
   - still prepends locally and stores cache
   - sets sync error
   - `render()`

### Key UI states from current render functions

- Footer “Log Order Placed” button disabled when same-count pending order exists.
- Banner warns if user tries to log with unresolved constraints.
- Post-success flow intentionally redirects to Receive tab.

---

## 5) Receive order

### Entry point
- User action: open **Receive** tab.
- Function: `renderReceive()`.

### Expected state transitions (render-driven)

1. Feature gate check (`renderFeatureGateBanner('receive')`).
2. Render truck schedule card (arrival and countdown).
3. Compute pending orders: `S.orders.filter(o=>o.status==='pending')`.
4. If none: empty state (“No pending orders…”).
5. Use most recent pending order (`pending[0]`) as active receipt.
6. Normalize receipt structure in-memory: `normalizeOrderReceiptData(order)`.
7. Load per-line confirm toggles: `getReceiveConfirmFlags(order)`.
8. Build UI sections:
   - original order lines (ordered qty + received input + per-line confirm button)
   - extra lines section (add/remove non-ordered items)
   - receipt notes textarea (`order.order_notes` prefilled)
   - sticky footer actions:
     - delete pending order
     - confirm receipt

### Key UI states from current render functions

- Warning banner when multiple pending orders exist; only most recent is shown.
- Confirmed rows get visual success styling (`recv-confirmed`).
- Extras section displays addable catalog items or explanatory terminal states.

---

## 6) Confirm receipt

### Entry point
- User action: **Confirm Receipt** button in Receive footer.
- Function: `confirmReceive(orderId)`.

### Expected state transitions

1. Guard: return if busy.
2. Find target order in `S.orders`.
3. Normalize order receipt structure (`normalizeOrderReceiptData(order)`).
4. Build `receivedMap` from UI inputs via logic helper `buildReceivedQuantitiesMap(...)`.
5. Read receipt notes from `#recv-notes-input`.
6. Snapshot line confirm flags (`confirmedMap`).
7. Attempt DB write via `db.confirmReceipt(orderId, receivedMap, order.items, { orderNotes, confirmedMap })`.
8. On success:
   - `order.status = 'received'`
   - `order.received_at = now`
   - `order.order_notes = orderNotes`
   - `order.confirmed_map = confirmedMap`
   - write each `receivedMap` value into `order.items[id].received`
   - persist `S.orders`
   - sync ok
   - success banner (“Truck order received…”) 
9. On failure:
   - set sync error
10. Final step always: `render()`

### Key UI states from current render functions

- Per-line receive inputs use ordered amount as placeholder.
- Per-line “Confirmed” toggles are persisted and rehydrated.
- Receipt note persists with the order after confirmation.
- After confirmation, order no longer appears in pending-only Receive list.

---

## End-to-end lifecycle summary (happy path)

1. Start new count -> draft session exists.
2. Enter quantities in walk/list -> draft autosaves.
3. Save Count -> final session added and user routed to Order.
4. Review generated recommendations -> log order.
5. Order becomes `pending` and user routed to Receive.
6. Enter received values / confirmations / notes -> confirm receipt.
7. Order transitions to `received` and leaves pending queue.
