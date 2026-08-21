# Email deployment

## Current behavior

Dastorkon writes email to the backend process console by default. This keeps
normal Windows/PyCharm development, CI, and the production-like local Docker
stack independent of an SMTP server and prevents accidental external delivery.

Django 6.1 uses the `MAILERS` setting for email backends. Dastorkon accepts the
familiar `EMAIL_*` environment variable names and maps them into
`MAILERS["default"]`. This avoids Django 6.1's deprecated legacy email settings
while keeping deployment configuration recognizable.

## Production SMTP variables

Set these values through the deployment platform or secret manager:

| Variable | Purpose | Local default |
| --- | --- | --- |
| `EMAIL_BACKEND` | Mail backend path; use `django.core.mail.backends.smtp.EmailBackend` for SMTP. | Console backend |
| `EMAIL_HOST` | SMTP server hostname. | `localhost` |
| `EMAIL_PORT` | SMTP TCP port; must be an integer from 1 to 65535. | `25` |
| `EMAIL_HOST_USER` | SMTP account or API-style username. | Empty |
| `EMAIL_HOST_PASSWORD` | SMTP password or provider-issued credential. | Empty |
| `EMAIL_USE_TLS` | Enables STARTTLS when `True`. | `False` |
| `EMAIL_USE_SSL` | Enables implicit TLS when `True`. | `False` |
| `EMAIL_TIMEOUT` | Positive integer connection timeout in seconds. | `10` |
| `DEFAULT_FROM_EMAIL` | Default visible sender for application messages. | `webmaster@localhost` |
| `SERVER_EMAIL` | Sender used for server/error messages. | `root@localhost` |

`EMAIL_USE_TLS` and `EMAIL_USE_SSL` are mutually exclusive. Configuration
fails immediately if both are enabled.

Example production shape:

```dotenv
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_HOST_USER=smtp-user
EMAIL_HOST_PASSWORD=replace-through-secret-manager
EMAIL_USE_TLS=True
EMAIL_USE_SSL=False
EMAIL_TIMEOUT=10
DEFAULT_FROM_EMAIL=noreply@example.com
SERVER_EMAIL=server-errors@example.com
```

This is only a format example. Do not copy its hostnames or placeholder
credentials into a real deployment.

## Encryption and common port patterns

- Port 587 commonly uses STARTTLS: `EMAIL_USE_TLS=True` and
  `EMAIL_USE_SSL=False`.
- Port 465 commonly uses implicit TLS: `EMAIL_USE_SSL=True` and
  `EMAIL_USE_TLS=False`.
- Port 25 is commonly reserved for a trusted local or private relay. Do not
  assume it is encrypted or allowed by a hosting provider.

Use the exact authentication and port requirements published by the selected
SMTP provider. Verify certificate validation, sender-domain ownership, SPF,
DKIM, and DMARC before public use. Dastorkon does not hardcode a provider.

## Credentials and sender addresses

SMTP usernames and passwords are secrets. Store them in a platform secret
manager or protected server environment, never in Git, Docker images, logs,
support screenshots, or committed `.env` files. Restrict the SMTP account to
the minimum required sending permissions and define a rotation and revocation
procedure.

Use verified sender addresses and domains for `DEFAULT_FROM_EMAIL` and
`SERVER_EMAIL`. The former is the normal application sender; the latter is the
identity Django uses for server-originated error messages. They may be the same
only if the provider permits it and operational ownership is clear.

`ADMINS` and `MANAGERS` are not environment-configured at this stage because
the application does not currently rely on Django's admin-error email flow.
Add them only alongside a reviewed error-reporting policy to avoid sending
sensitive exception data to unintended recipients.

## Manual SMTP test

First run the non-delivery configuration check:

```powershell
python manage.py check
python manage.py check --deploy
```

Neither command sends email. With the production SMTP environment active, the
deployment check should no longer report `mail.E001`.

To perform an intentional delivery test, use an inbox controlled by the
deployment team and run:

```powershell
python manage.py shell -c "from django.core.mail import send_mail; print(send_mail('Dastorkon SMTP test', 'Manual deployment verification.', None, ['verified-test@example.com'], fail_silently=False))"
```

That command sends a real message when SMTP is configured. Replace the example
recipient, run it only with explicit authorization, and verify delivery,
headers, reply handling, and provider logs. A result of `1` means the backend
accepted one message; it does not by itself prove inbox delivery.

## Tests and CI

Django's test runner replaces configured mailers with its in-memory test
backend. Dastorkon's email settings tests only load and inspect configuration
in isolated processes; they never call a send function or open an SMTP
connection. Keep automated tests on an in-memory or console backend, use fake
credentials, and never point CI at a production SMTP account.

## Public-launch checklist

- [ ] Select an SMTP provider and create a least-privilege production account.
- [ ] Store SMTP credentials in the deployment secret manager.
- [ ] Set the SMTP host, integer port, authentication, and exactly one TLS mode.
- [ ] Verify `DEFAULT_FROM_EMAIL` and `SERVER_EMAIL` with the provider.
- [ ] Configure and verify SPF, DKIM, and DMARC for the sender domain.
- [ ] Run `python manage.py check --deploy` and confirm `mail.E001` is absent.
- [ ] Send one authorized message to a controlled inbox and inspect headers.
- [ ] Verify timeout and failure behavior without logging credentials or message
  contents.
- [ ] Document credential rotation, provider quota monitoring, and incident
  response.
