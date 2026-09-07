# Dastorkon v0.1.0-mvp release notes

- **Release name:** Dastorkon v0.1.0-mvp
- **Release type:** Stable MVP baseline

This release is the stable demonstration baseline for Dastorkon's dine-in QR
ordering workflow. It is intended for MVP demos and controlled release
validation without expanding the current product scope.

## Included in this MVP

- A bilingual customer QR menu with a session-based cart, order placement,
  order tracking, and waiter calls; no customer account is required.
- Admin pages for the dashboard, restaurant settings, categories, menu items,
  tables and QR codes, staff, orders, and statistics.
- Waiter shift management, table acceptance, waiter-call handling, ready-order
  delivery, manual order entry, and guarded table closure.
- A kitchen order board for moving orders through `NEW`, `PREPARING`, and
  `READY`.
- Persisted order numbers, item snapshots, totals, status history, and
  completed-order reporting.
- Realtime staff notifications with polling fallback.

## Supported roles

| Role | MVP responsibility |
| --- | --- |
| Admin | Manages restaurant data, staff, menu, tables, orders, and dashboard/statistics views. |
| Waiter | Opens a shift, accepts work, handles calls, delivers orders, creates manual orders, and closes resolved tables. |
| Kitchen | Receives new orders and moves them from `NEW` to `PREPARING` to `READY`. |
| Customer | Opens a table QR menu, manages a cart, places orders, follows status, and calls a waiter. |

## Main QR order lifecycle

1. A customer opens `/menu/<table-qr-token>`. This creates or resumes the
   customer visit without occupying the table.
2. The customer browses the current menu and adds available items to the cart.
3. Placing an order, or making a waiter call, activates the table session and
   changes the table to `OCCUPIED`.
4. A placed order receives a unique display number and starts in `NEW`.
5. Kitchen moves the order `NEW` -> `PREPARING` -> `READY`.
6. Waiter accepts the table as needed and marks the ready order `DELIVERED`.
7. Once orders and waiter calls are resolved, Waiter closes the table. Delivered
   orders become `COMPLETED`, the table becomes `FREE`, and the customer can
   still read the completed visit history.

## Reliability fixes included before release

- Database-backed, concurrency-safe global order numbering for customer and
  waiter-created orders.
- Decimal-safe totals based on current cart prices and immutable order-item
  price snapshots; the same persisted order total is used by customer, waiter,
  kitchen, admin, and analytics responses.
- Lifecycle guards for closing tables, ending waiter shifts, and deactivating
  waiters while active work remains.
- Server-authoritative kitchen state, including `READY` orders remaining visible
  after reload.
- Backend enforcement of the restaurant `comments_enabled` setting.
- Notification dispatch isolated from committed business transactions so a
  notification failure does not undo a successful operation.
- Business-time calculations standardized to `Asia/Bishkek`.
- Separate deployed routes for the React Admin UI and Django admin.

## Deployment routing

- The React Admin UI remains under `/admin/*` on the frontend application.
- Django admin is served separately at `/django-admin/`.
- Deployment routing must preserve that separation; `/admin/*` must not be
  forwarded to Django admin.

## Known limitations and notes

- The seeded accounts and passwords are for local demonstration only and must
  not be reused in a public environment.
- Local development uses an in-memory Channels layer. Multi-process deployment
  requires the documented Redis configuration for cross-process realtime
  delivery; polling remains a client fallback.
- Customer access and visit history depend on the browser's table session
  cookie. Use separate browser profiles or private windows for simultaneous
  staff and customer demo roles.
- Order numbers are global display numbers. Gaps should not be interpreted as
  missing revenue or as a count of completed orders.
- Order item names and prices are snapshots. Changing a menu item later does
  not rewrite an existing order or its total.
- This baseline still requires environment-specific deployment, security,
  backup, and browser validation before any public launch.

## Not included in this MVP

- Payments
- Multi-tenant SaaS management
- Native mobile applications
- Delivery ordering or dispatch
- Loyalty programs
- AI features
