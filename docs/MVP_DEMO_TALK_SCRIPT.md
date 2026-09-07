# Dastorkon v0.1.0-mvp demo talk script

Use this as a concise presenter track alongside the
[MVP demo scenario](MVP_DEMO_SCENARIO.md). The complete walkthrough should use
separate browser contexts for Admin, Waiter, Kitchen, and Customer.

## 30-second introduction

> Dastorkon is a QR-based dine-in ordering system for cafes and restaurants.
> A customer scans the QR code at their table, opens the menu, and places an
> order without creating an account or waiting for a waiter to take it. The
> order moves through separate Kitchen and Waiter screens, while Admin controls
> the menu, tables, staff, orders, and statistics. Everyone works with the same
> table and order state from one system.

## Problem statement

> In many cafes, waiters must manually take every order, including small repeat
> orders. Kitchen and waiter updates can be delayed or misunderstood, and it is
> difficult to see which tables and orders still need attention. Paper tickets
> or other manual tracking make order history and reporting harder to maintain.

The MVP focuses on four practical problems:

- Reducing repeated manual order taking.
- Making kitchen-to-waiter handoff visible.
- Keeping table and order status clear for staff.
- Replacing paper-only tracking with a shared order record.

## MVP solution

> Dastorkon gives the customer a table-specific QR menu with a cart and direct
> order placement. Kitchen receives the order and moves it from `NEW` to
> `PREPARING` to `READY`. Waiter delivers it and closes the table when all work
> is resolved. Admin manages the menu, tables, orders, staff, and statistics
> from a separate control interface.

## Live demo script

### 1. Admin dashboard

**Show:** Open the React Admin dashboard under `/admin/*`. Briefly show the
menu, categories, tables, waiter profiles, orders, and dashboard statistics.

**Say:** "This is the operating view for the restaurant. Admin controls the
menu and tables, manages staff, reviews orders, and sees the current business
summary."

### 2. Waiter shift

**Show:** Open the Waiter dashboard and start the demo waiter's shift.

**Say:** "The waiter starts a shift before accepting active work. This screen
brings together available tables, assigned tables, ready orders, and customer
calls."

### 3. Kitchen orders

**Show:** Open the Kitchen orders page and leave it visible.

**Say:** "Kitchen has its own focused queue. New customer orders appear here,
without requiring the kitchen team to work from the Admin or Waiter screen."

### 4. Customer QR order

**Show:** Scan or open the Table 1 QR link, browse the menu, add an item to the
cart, and place the order. Point out the order number and total.

**Say:** "The customer opens the table menu without logging in. Simply opening
the QR menu does not occupy the table. The table becomes occupied only when the
customer places an order or calls a waiter."

### 5. Kitchen: `NEW` -> `PREPARING` -> `READY`

**Show:** Confirm the same order appears as `NEW`, then move it to `PREPARING`
and `READY`. Reload once while it is ready.

**Say:** "Kitchen now owns the preparation flow. The order number, items, and
total are consistent with the customer view, and the ready state remains
visible after a reload."

### 6. Waiter: `DELIVERED` -> close table

**Show:** Accept the table if needed, confirm the ready order, mark it
`DELIVERED`, and close the table after all work is resolved.

**Say:** "The waiter receives the ready handoff, delivers the order, and closes
the table only when there are no unfinished orders or unresolved calls. Closing
completes the visit and returns the table to `FREE`."

### 7. Customer completed history

**Show:** Return to the same customer browser and open or refresh order history.

**Say:** "Closing the table does not remove the customer's result. The completed
order remains visible with its original item and price snapshot."

### 8. Admin orders and dashboard

**Show:** Find the completed order in Admin Orders, use the date filters, and
return to the dashboard or statistics page.

**Say:** "Admin can review the completed order and its persisted total, then see
it reflected in the existing dashboard and reporting rules. The same order data
has followed the full customer, kitchen, waiter, and admin flow."

### 9. Django admin

**Show:** Open `/django-admin/` on the backend server.

**Say:** "The product's React Admin interface stays under `/admin/*`. Django's
technical administration site is deliberately separated at `/django-admin/`
so the two interfaces do not conflict in deployment."

## Closing pitch

> Dastorkon v0.1.0-mvp is a stable baseline for demonstrating the complete
> dine-in QR order lifecycle. It is not yet a full SaaS product. The next step
> is to run a pilot in a real cafe, validate a production deployment, and use
> staff and customer feedback to prioritize focused v0.2 improvements.

## 30-second pitch in Kyrgyz

> Dastorkon — кафе жана ресторандар үчүн столдогу QR-код аркылуу заказ берүү
> системасы. Кардар аккаунт ачпай эле QR-кодду скандап, менюну көрүп, себетке
> тамак кошуп, заказ берет. Заказ ашкана экранына түшөт, официант даяр тамакты
> жеткирип, столду жабат, ал эми администратор менюну, столдорду, заказдарды
> жана статистиканы башкарат. Ошентип, бардык ролдор бирдиктүү жана так абал
> менен иштейт.

## 30-second pitch in Russian

> Dastorkon — это система заказов по QR-коду за столом для кафе и ресторанов.
> Гость без регистрации сканирует QR-код, открывает меню, добавляет блюда в
> корзину и оформляет заказ. Заказ поступает на экран кухни, официант доставляет
> готовые блюда и закрывает стол, а администратор управляет меню, столами,
> заказами и статистикой. Все роли работают с единым и понятным состоянием
> заказа.
