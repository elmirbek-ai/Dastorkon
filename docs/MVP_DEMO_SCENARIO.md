# Dastorkon v0.1.0-mvp demo scenario

This script demonstrates the stable dine-in QR flow from customer checkout to
completed history. Run it from a clean local checkout and use separate browser
profiles or private windows for Admin, Waiter, Kitchen, and Customer so staff
sessions do not replace one another.

## 1. Prepare demo data

From the repository root, activate the Python environment and run:

```powershell
python manage.py migrate
python manage.py seed_demo
```

`seed_demo` is idempotent. It creates or refreshes the local demo restaurant,
menu, tables, and staff accounts, and prints the Table 1 QR token. Copy that
token for the customer step.

## 2. Start the backend

In the first terminal, from the repository root:

```powershell
daphne --verbosity 0 -b 127.0.0.1 -p 8000 config.asgi:application
```

The backend is available at `http://127.0.0.1:8000`.

## 3. Start the frontend

In a second terminal:

```powershell
Set-Location frontend
npm run dev
```

The frontend is available at `http://127.0.0.1:5173`.

## 4. Sign in to the staff roles

Open `http://127.0.0.1:5173/login` in separate browser profiles and use these
development-only accounts:

| Role | Username | Password |
| --- | --- | --- |
| Admin | `admin` | `admin12345` |
| Waiter | `waiter` | `waiter12345` |
| Kitchen | `kitchen` | `kitchen12345` |

Do not use these credentials outside the local demo.

## 5. Check the Admin application

1. Open the Admin dashboard at `http://127.0.0.1:5173/admin/dashboard`.
2. Confirm the dashboard loads without an error.
3. Briefly open Categories, Menu, Tables, Waiters/Profiles, and Orders to
   confirm the seeded data is available.
4. In Tables, locate Table 1 and confirm its QR link matches the token printed
   by `seed_demo`.

## 6. Open the Waiter shift

1. Open the Waiter dashboard at
   `http://127.0.0.1:5173/waiter/dashboard`.
2. Start the shift.
3. Confirm the active-shift state appears and there is no page-breaking error.

## 7. Prepare the Kitchen view

1. Open `http://127.0.0.1:5173/kitchen/orders`.
2. Leave the page visible so the new order can be observed.
3. Confirm the page loads and its realtime or polling-backed refresh remains
   active.

## 8. Open the customer QR menu

1. In a separate customer browser context, open
   `http://127.0.0.1:5173/menu/<table-qr-token>`.
2. Confirm the menu loads without a customer login.
3. Before ordering or calling a waiter, confirm Table 1 is still `FREE` in the
   Admin or Waiter view.

## 9. Place a customer order

1. Add an available menu item to the cart and adjust the quantity if desired.
2. Confirm the cart line and cart total reflect the displayed current price.
3. Place the order.
4. Record the displayed order number and total.
5. Confirm Table 1 is now `OCCUPIED` and the customer order starts in `NEW`.

## 10. Move the order through Kitchen

1. Confirm the order appears in Kitchen as `NEW` with the same order number and
   total.
2. Move it from `NEW` to `PREPARING`.
3. Move it from `PREPARING` to `READY`.
4. Reload the Kitchen page and confirm the `READY` order remains visible.

## 11. Deliver and close the table

1. In Waiter, accept Table 1 if it is still in the available-work list.
2. Confirm the waiter view shows the same order number and total.
3. Mark the `READY` order `DELIVERED`.
4. If demonstrating the waiter-call guard, create a call from the customer
   page, confirm table closure is rejected while it is unresolved, then accept
   and complete the call.
5. Close Table 1 after all orders and calls are resolved.
6. Confirm the table becomes `FREE`.

## 12. Verify customer history

1. Return to the same customer browser context.
2. Open or refresh the order history.
3. Confirm the order is `COMPLETED` and remains visible with the original order
   number, item snapshot, and total after table closure.

## 13. Finish the Admin checks

1. Open Admin Orders and find the completed order.
2. Confirm its number, items, and total match the Customer, Waiter, and Kitchen
   views.
3. Exercise the Orders date filters and confirm the order appears for the
   appropriate business date.
4. Return to the dashboard/statistics pages and confirm the KPIs load with the
   completed order included under the existing reporting rules.

## 14. Open Django admin

Open `http://127.0.0.1:8000/django-admin/` and sign in with the seeded Admin
account. Confirm Django admin loads there while the React Admin application
continues to own frontend routes under `/admin/*`.

## Demo completion criteria

The demo passes when the full QR order reaches `COMPLETED`, Table 1 returns to
`FREE`, customer history remains readable, all four role views agree on the
order number and total, and no page shows a console-breaking error.
