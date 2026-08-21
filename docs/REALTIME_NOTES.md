# Dastorkon realtime notes

## WebSocket endpoint

The current Channels route is:

```text
/ws/notifications/
```

Local examples:

```text
ws://127.0.0.1:5173/ws/notifications/?token=<access_token>
ws://127.0.0.1:8000/ws/notifications/?token=<access_token>
```

The first URL passes through the Vite development proxy. Production HTTPS
deployments must use `wss://`.

## JWT authentication for the MVP

Staff WebSockets authenticate with a SimpleJWT access token in the query
string:

```text
/ws/notifications/?token=<access_token>
```

The middleware validates the access token and places the authenticated user in
the Channels scope. Missing, invalid, or expired tokens produce an anonymous
scope, and `NotificationConsumer` rejects the connection.

This query-string approach is pragmatic for the browser WebSocket API, which
does not allow an arbitrary `Authorization` header during the handshake. Query
strings can appear in proxy logs, so production logging must redact the token.

## Groups and frontend integration

Authenticated users always join `user_<id>` and also join their role group:

- Admin: `admins`
- Waiter: `waiters`
- Kitchen: `kitchen`

Kitchen Display listens for:

- `order_created`
- `order_preparing`
- `order_ready`
- `order_delivered`
- `table_session_closed`

Waiter Dashboard listens for:

- `order_created`
- `order_available`
- `order_ready`
- `order_delivered`
- `waiter_call_created`
- `waiter_call_available`
- `waiter_call_accepted`
- `waiter_call_completed`
- `table_session_assigned`
- `table_session_closed`

On a relevant event, the page calls its existing HTTP data-loading function.
The event is therefore a refresh signal; business state still comes from the
existing REST endpoints.

## Reconnection and polling fallback

The reusable React hook builds the protocol from the page URL (`http` → `ws`,
`https` → `wss`), reconnects with backoff, and closes cleanly on unmount or
token change.

| Page | Socket connected | Connecting, reconnecting, or disconnected |
| --- | --- | --- |
| Kitchen Display | Poll every 30 seconds | Poll every 7 seconds |
| Waiter Dashboard | Poll every 30 seconds | Poll every 8 seconds |

The UI exposes **Realtime**, **Reconnecting**, or **Polling** so the operator can
see which delivery path is active.

## Channel layer configuration

Local development and CI use `channels.layers.InMemoryChannelLayer` by default
and do not require a Redis server. This channel layer is process-local, so it is
reliable only when Daphne runs as one Django process. With multiple workers, a
notification published in one process may not reach sockets connected to
another process.

When `REDIS_URL` is set, Django uses
`channels_redis.core.RedisChannelLayer` instead. Standard `redis://` URLs and
TLS-enabled `rediss://` URLs are supported. Redis is required for reliable
WebSocket group delivery across multiple application processes or workers.

## Production recommendation

Before a multi-process or multi-host deployment:

1. Provision Redis and set `REDIS_URL` for every Daphne/ASGI worker.
2. Verify that WebSocket events are delivered between sockets connected to
   different workers.
3. Terminate TLS at the reverse proxy and expose the endpoint through `wss://`.
4. Configure the proxy for WebSocket upgrade headers and suitable idle
   timeouts.
5. Redact the `token` query parameter from access logs and monitoring output.
6. Keep polling enabled as a resilience fallback.
