# G6.1.1 — iOS Web Push acceptance evidence

**Recorded:** 2026-08-12T13:05:12Z
**Device:** physical iPhone
**iOS:** 26.6 (reported by tester)
**Safari:** Safari version not separately reported; tester indicates it follows iOS 26.6
**Deployment URL:** api.synkroo.com.br / production PWA
**Push sent:** 2026-08-12T13:12:27Z — API returned HTTP 202 `{ "sent": 3, "removed": 0 }`

## Observed flow

- PWA was installed through Safari's **Share → Add to Home Screen** flow.
- The native iOS permission sheet appeared after tapping **Ativar notificações**.
- Tester tapped **Permitir**.
- The PWA displayed **Notificações ativas**.

## Subscription evidence

Authenticated production database check for the target workspace: 3 subscription rows; 3 HTTPS endpoints; 3 non-empty `p256dh` values; 3 non-empty `auth` values. No endpoint, key, or VAPID private material was recorded.

## Delivery confirmation

- Tester confirmed the test notification arrived on the physical iPhone.
  The automated browser test is not treated as proof of the native iOS sheet: it separately checks that permission starts as `default` and that the explicit button gesture invokes `Notification.requestPermission()` with `navigator.userActivation.isActive === true`.
