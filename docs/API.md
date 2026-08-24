# Dastorkon API overview

This document lists the main MVP endpoint groups. Request and response fields
are intentionally summarized; the automated API tests are the source of truth
for detailed behavior.

## Conventions

- Staff endpoints use JWT authentication with an
  `Authorization: Bearer <access_token>` header.
- Role permissions apply to the Admin, Waiter, and Kitchen groups.
- Public QR endpoints allow anonymous HTTP access but cart, order, and
  waiter-call operations require the HTTP-only `customer_session_key` cookie
  created by the QR session endpoint.
- IDs shown as `<id>` are integer database IDs. `<qr_token>` is a UUID.
- API responses use JSON, except image uploads where multipart requests may be
  used.

## Authentication

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/token/` | Obtain JWT access and refresh tokens using username and password. |
| `POST` | `/api/auth/token/refresh/` | Obtain a new access token using a refresh token. |

Public registration, password reset, and email verification are not part of
the MVP.

## Admin

All routes in this section require an authenticated user with the `ADMIN`
role.

| Methods | Endpoint | Purpose |
| --- | --- | --- |
| `GET`, `POST` | `/api/admin/restaurants/` | List active restaurants or create a restaurant. |
| `GET`, `PUT`, `PATCH`, `DELETE` | `/api/admin/restaurants/<id>/` | Retrieve, update, or soft-deactivate a restaurant. |
| `GET`, `PATCH` | `/api/admin/restaurants/<id>/settings/` | Read or update settings; missing settings are created automatically. |
| `GET`, `POST` | `/api/admin/users/` | List active staff or create a staff user. |
| `GET`, `PUT`, `PATCH`, `DELETE` | `/api/admin/users/<id>/` | Retrieve, update, or soft-deactivate staff. |
| `GET`, `POST` | `/api/admin/categories/` | List or create menu categories. |
| `GET`, `PUT`, `PATCH`, `DELETE` | `/api/admin/categories/<id>/` | Retrieve, update, or soft-delete a category. |
| `GET`, `POST` | `/api/admin/menu-items/` | List or create menu items. |
| `GET`, `PUT`, `PATCH`, `DELETE` | `/api/admin/menu-items/<id>/` | Retrieve, update, or soft-delete a menu item. |
| `GET`, `POST` | `/api/admin/tables/` | List active restaurant tables or create a table and QR token. |
| `GET`, `PUT`, `PATCH`, `DELETE` | `/api/admin/tables/<id>/` | Retrieve, update, or soft-deactivate a table. |
| `GET` | `/api/admin/orders/` | Read order history with restaurant, table, waiter, status, and date filters. |
| `GET` | `/api/admin/orders/<id>/` | Read an order with item snapshots and status history. |
| `GET` | `/api/admin/statistics/summary/` | Read order, revenue, table, item, and waiter statistics. |

Restaurant, category, menu-item, table, and staff deletion is implemented as
soft deactivation/deletion where applicable.

## Public customer

The QR token determines the restaurant and table.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/public/qr/<qr_token>/session/` | Start or reuse a table session and set the customer-session cookie. |
| `GET` | `/api/public/qr/<qr_token>/menu/` | Get visible, available menu items grouped by category. |
| `GET` | `/api/public/qr/<qr_token>/cart/` | Get the current customer's cart and total. |
| `POST` | `/api/public/qr/<qr_token>/cart/items/` | Add or merge an item in the cart. |
| `PATCH`, `DELETE` | `/api/public/qr/<qr_token>/cart/items/<id>/` | Update or remove one of the current customer's cart items. |
| `GET` | `/api/public/qr/<qr_token>/orders/` | Get the current customer's orders and total. |
| `POST` | `/api/public/qr/<qr_token>/orders/` | Create an order from the current cart and clear the cart. |
| `POST` | `/api/public/qr/<qr_token>/waiter-calls/` | Request a waiter, bill, extra order, or help. |

The session endpoint is the only public endpoint that creates a
`CustomerSession`. Clients must preserve its `customer_session_key` cookie for
subsequent requests to the same active table session.

## Waiter

All routes require the `WAITER` role. Table-session, order, and waiter-call
operations also require an active waiter shift.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/waiter/shifts/start/` | Start or return the current active shift. |
| `POST` | `/api/waiter/shifts/end/` | End the current active shift. |
| `GET` | `/api/waiter/shifts/current/` | Get the active shift or `null`. |
| `GET` | `/api/waiter/manual-order/tables/` | List active tables and whether the current waiter may use them for a manual order. |
| `GET` | `/api/waiter/manual-order/menu-items/?table_id=<id>` | List visible menu items for the selected table's restaurant, including current availability. |
| `POST` | `/api/waiter/manual-order/orders/` | Create a kitchen-visible `WAITER_MANUAL` order and assign its table session to the current waiter. |
| `GET` | `/api/waiter/table-sessions/available/` | List unassigned active table sessions that have orders. |
| `GET` | `/api/waiter/table-sessions/my/` | List active table sessions assigned to the waiter. |
| `POST` | `/api/waiter/table-sessions/<id>/accept/` | Accept an available table session. |
| `POST` | `/api/waiter/table-sessions/<id>/close/` | Complete delivered orders and close the table session. |
| `GET` | `/api/waiter/orders/` | List active orders for the waiter's assigned tables. |
| `POST` | `/api/waiter/orders/<id>/delivered/` | Move a ready assigned order to delivered. |
| `GET` | `/api/waiter/calls/` | List available or assigned active waiter calls. |
| `POST` | `/api/waiter/calls/<id>/accept/` | Accept a waiter call and, if needed, its table session. |
| `POST` | `/api/waiter/calls/<id>/complete/` | Complete an accepted waiter call. |

## Kitchen

All routes require the `KITCHEN` role.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/kitchen/orders/` | List new and preparing orders, oldest first. |
| `POST` | `/api/kitchen/orders/<id>/preparing/` | Move a new order to preparing. |
| `POST` | `/api/kitchen/orders/<id>/ready/` | Move a preparing order to ready. |

## WebSocket notifications

Connect to:

```text
ws://127.0.0.1:8000/ws/notifications/
```

The current consumer requires an authenticated Django session. On connection,
the user joins a personal `user_<id>` group and the appropriate `admins`,
`waiters`, or `kitchen` role group.

Messages use this shape:

```json
{
  "type": "notification.message",
  "event": "order_created",
  "data": {}
}
```

Implemented events include `order_created`, `order_available`, `order_ready`,
`waiter_call_created`, `waiter_call_available`, `waiter_call_accepted`, and
`waiter_call_completed`. The MVP uses an in-memory channel layer, so messages
are process-local and Redis is not required.
