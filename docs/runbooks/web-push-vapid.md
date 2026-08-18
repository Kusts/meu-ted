# Web Push / VAPID

## Generate keys

Run locally and keep the private key out of git:

```bash
pnpm dlx web-push generate-vapid-keys
```

Configure the API environment:

```dotenv
VAPID_SUBJECT=mailto:ops@example.com
VAPID_PUBLIC_KEY=<public key>
VAPID_PRIVATE_KEY=<private key>
```

`VAPID_PUBLIC_KEY` is returned only through the authenticated `GET /push/vapid-public-key` route. `VAPID_PRIVATE_KEY` is server-only and must never be sent to the PWA, logged, or committed.

## Flow

1. The PWA registers `/sw.js` and asks for permission only after the user presses **Ativar notificações**.
2. On iOS Safari, the user must first use **Compartilhar → Adicionar à Tela de Início** and open the installed app.
3. The PWA obtains the public key and posts the browser subscription to `/push/subscriptions` with the workspace context and an idempotency key.
4. Removing a subscription uses `DELETE /push/subscriptions`; the API scopes the deletion to the authenticated workspace actor.
5. An authenticated producer can call `POST /push/notifications` with `{title, body?, url?}`; the API fans out through the configured VAPID sender and removes stale 404/410 endpoints.

If VAPID is not configured, the API returns `push.vapid_unavailable`; it never exposes a placeholder key in production.

## iOS installed-device acceptance check

Run this check on a physical iPhone using Safari; do not pre-grant notification permission:

1. Open the deployed PWA in Safari and confirm **Notificações** explains **Compartilhar → Adicionar à Tela de Início** when the app is not installed.
2. Install it, open the new Home Screen icon, and return to **Notificações**.
3. Tap **Ativar notificações** once. The native iOS permission prompt must appear only after this tap.
4. Tap **Permitir**. Confirm the card changes to **Notificações ativas** and the API receives `POST /push/subscriptions` with a non-empty endpoint and keys.
5. Send a test notification through the authenticated producer route and confirm it appears while the installed PWA is backgrounded.
6. Record the iOS version, Safari version, deployment URL, timestamp, prompt result, and subscription endpoint suffix in the release evidence; never record VAPID private material.
