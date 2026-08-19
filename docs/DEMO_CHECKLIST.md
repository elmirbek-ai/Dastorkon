# Dastorkon MVP demo checklist

This checklist demonstrates the complete Customer → Kitchen → Waiter workflow.
Use separate browser windows or profiles for each role so the staff JWTs do not
replace one another.

## Before the demo

- [ ] Run `python manage.py migrate` and `python manage.py seed_demo`.
- [ ] Start Django with
  `daphne -b 127.0.0.1 -p 8000 config.asgi:application`.
- [ ] Start Vite from `frontend` with `npm run dev`.
- [ ] Log in to Kitchen with `kitchen / kitchen12345` and open the Kitchen
  Display.
- [ ] Log in to Waiter with `waiter / waiter12345`, open the dashboard, and
  start the shift.
- [ ] Confirm the Kitchen and Waiter connection badges show **Realtime**.
- [ ] Open Admin with `admin / admin12345`, go to **Tables**, and use the Table
  1 QR code. The `seed_demo` output also prints the same QR token.

## Full demo scenario

> A successful waiter call must happen while the table session is active.
> Closing the table intentionally deactivates the Customer session, so the call
> step is demonstrated before final closure. An optional post-close check is
> included at the end.

### 1. Customer scans the QR code

- **Action:** Scan Table 1's QR code or open
  `http://127.0.0.1:5173/menu/<table-qr-token>`.
- **Expected:** The bilingual Customer menu opens for Table 1, and the customer
  session cookie is created without a Customer login.

### 2. Customer places an order

- **Action:** Add one or more available dishes, review the cart, and submit the
  order.
- **Expected:** Checkout succeeds, the cart clears, and **My Orders** shows a
  new order at **Accepted / Кабыл алынды / Принят**.

### 3. Kitchen receives the order in realtime

- **Action:** Watch the already-open Kitchen Display without refreshing it.
- **Expected:** The new order appears in the **New** column promptly. In Chrome
  DevTools → Network → WS, `/ws/notifications/?token=...` remains connected.

### 4. Waiter accepts the table

- **Action:** In the Waiter dashboard, open the available/new tables area and
  accept Table 1.
- **Expected:** Table 1 moves to the waiter's own tables, disappears from the
  available list, and its orders become assigned to that waiter.

### 5. Kitchen marks the order preparing and ready

- **Action:** On Kitchen Display, move the order from **New** to **Preparing**,
  then from **Preparing** to **Ready**.
- **Expected:** Each status change succeeds. The ready order appears promptly
  in the Waiter dashboard, and the Customer order progress advances when My
  Orders reloads.

### 6. Waiter delivers the order

- **Action:** In the Waiter dashboard, click the delivery action for the ready
  order.
- **Expected:** The order becomes `DELIVERED`, leaves the active ready queue,
  and Kitchen/Waiter data refresh through the realtime event.

### 7. Customer calls the waiter

- **Action:** While Table 1 is still active, use **Call Waiter** from the
  Customer menu or My Orders and choose a reason.
- **Expected:** The request succeeds and appears promptly in the Waiter
  dashboard. The waiter can accept and complete it; completed calls disappear
  from the active call list.

### 8. Waiter closes the table

- **Action:** Confirm no order remains in `NEW`, `PREPARING`, or `READY`, then
  close Table 1 from the Waiter dashboard.
- **Expected:** Delivered orders are completed, the active table session closes,
  Customer sessions are deactivated, and the restaurant table becomes free.

### 9. Optional post-close safety check

- **Action:** From the old Customer tab, attempt to call the waiter again.
- **Expected:** The request is rejected because the table/customer session is
  closed. Scanning the QR again starts or reuses a new active table session.

## Realtime fallback check

- [ ] Stop Daphne or temporarily disable the connection.
- [ ] Confirm the badge changes to **Reconnecting** and the UI continues polling
  (Kitchen every 7 seconds; Waiter every 8 seconds).
- [ ] Restart Daphne and confirm the socket reconnects, the badge returns to
  **Realtime**, and connected polling slows to 30 seconds.
