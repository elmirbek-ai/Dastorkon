# ORM performance notes

## N+1 regression coverage

`apps/common/tests/test_query_performance.py` exercises each high-traffic read
endpoint twice: first with a small result set, then with a larger result set.
The test captures SQL with Django's `CaptureQueriesContext` and requires the
query count to remain unchanged as rows and nested children are added.

The larger fixtures include:

- five menu categories with five items each;
- five orders with three items each;
- multiple table sessions and waiter calls;
- an order detail with 15 items and 10 status-history records;
- larger admin table, menu-item, and user collections.

The following routes are protected:

- `GET /api/public/qr/<qr_token>/menu/`
- `GET /api/public/qr/<qr_token>/orders/`
- `GET /api/public/qr/<qr_token>/cart/`
- `GET /api/waiter/table-sessions/available/`
- `GET /api/waiter/table-sessions/my/`
- `GET /api/waiter/orders/`
- `GET /api/waiter/calls/`
- `GET /api/kitchen/orders/`
- `GET /api/admin/orders/`
- `GET /api/admin/orders/<id>/`
- `GET /api/admin/tables/`
- `GET /api/admin/menu-items/`
- `GET /api/admin/users/`

The public routes above are the repository's current equivalents of the
`/api/public/tables/<qr_token>/...` route wording used during the audit.

## Audit findings

No result-size-dependent N+1 query was found in the audited endpoints. The
existing queryset loading matches the serializers:

- public menu categories use a filtered `Prefetch` into `public_items`;
- public, waiter, and kitchen order lists prefetch nested order items;
- waiter table sessions select their table, restaurant, and assigned waiter,
  and annotate order count and total in SQL;
- waiter calls select their table session, table, and assigned waiter;
- admin order lists select nested foreign keys and annotate item counts;
- admin order detail prefetches items, status history, and history users.

Because the regression tests did not reveal an N+1, no endpoint queryset was
expanded with speculative or unused prefetches.

## Known fixed-cost queries

Some requests intentionally perform additional queries whose count does not
grow with the number of returned rows:

- JWT authentication normally loads the authenticated user once. Performance
  tests use DRF's `force_authenticate` so authentication cost does not obscure
  serializer/queryset regressions.
- waiter reads perform one active-shift lookup in their permission flow;
- public QR reads resolve the table first; public menu then lazily loads its
  restaurant once;
- public cart evaluates a menu-item-joined cart queryset once for the response
  and once for the total calculation;
- public orders use a separate aggregate query for the non-cancelled total;
- admin order detail uses separate, bounded prefetch queries for items, status
  history, and users referenced by that history.

Notification payload builders were also reviewed. They are called once per
state-changing operation, not from collection serialization loops. A payload
can perform bounded lazy lookups for its table and item count when the caller
does not already have those relations loaded. If notifications are batched in
the future, callers should load orders with
`select_related("table_session__table")` and `prefetch_related("items")`, and
apply equivalent relation loading for waiter calls or table sessions.
