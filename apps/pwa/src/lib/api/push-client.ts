import { z } from "zod";
import { apiFetch } from "./client";

const vapidKeySchema = z.object({ publicKey: z.string().min(1) });
const pushSubscriptionSchema = z.object({
  id: z.string(),
  endpoint: z.string().url(),
  active: z.boolean(),
  updatedAt: z.string(),
});

export type PushSubscriptionResult = z.infer<typeof pushSubscriptionSchema>;
export type PushState = "unsupported" | "install-required" | "ready" | "active" | "denied";

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

export function isStandalonePwa(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const standaloneNavigator = (navigator as Navigator & { standalone?: boolean }).standalone;
  return standaloneNavigator === true || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  const registration = existing ?? await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

export async function getPushState(): Promise<PushState> {
  if (typeof Notification === "undefined") return "unsupported";
  if (isIosDevice() && !isStandalonePwa()) return "install-required";
  if (Notification.permission === "denied") return "denied";
  const registration = await getRegistration();
  if (!registration || !("pushManager" in registration)) return "unsupported";
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? "active" : "ready";
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64Url(value: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(value));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function enablePush(workspaceId: string): Promise<PushSubscriptionResult> {
  if (typeof Notification === "undefined" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    throw new Error("Este navegador não oferece notificações push.");
  }
  if (isIosDevice() && !isStandalonePwa()) throw new Error("Instale o Pi na Tela de Início antes de ativar notificações.");
  if (Notification.permission === "denied") throw new Error("Notificações bloqueadas. Reative-as nos ajustes do navegador.");

  // Must be invoked before the first await: iOS ties the permission prompt to this click activation.
  const permissionPromise = Notification.permission === "granted"
    ? Promise.resolve<NotificationPermission>("granted")
    : Notification.requestPermission();
  const permission = await permissionPromise;
  if (permission !== "granted") throw new Error("Permissão para notificações não concedida.");

  const registration = await getRegistration();
  if (!registration || !("pushManager" in registration)) throw new Error("Service Worker indisponível.");

  const key = vapidKeySchema.parse(await apiFetch<unknown>("/push/vapid-public-key", {
    headers: { "X-Workspace-Id": workspaceId },
  }));
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeBase64Url(key.publicKey) as unknown as BufferSource,
  });
  const p256dh = subscription.getKey("p256dh");
  const auth = subscription.getKey("auth");
  if (!p256dh || !auth) throw new Error("Subscription push inválida.");
  return pushSubscriptionSchema.parse(await apiFetch<unknown>("/push/subscriptions", {
    method: "POST",
    idempotencyKey: crypto.randomUUID(),
    headers: { "X-Workspace-Id": workspaceId },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: { p256dh: encodeBase64Url(p256dh), auth: encodeBase64Url(auth) },
      userAgent: navigator.userAgent,
    }),
  }));
}

export async function disablePush(workspaceId: string): Promise<void> {
  const registration = await getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await apiFetch<unknown>("/push/subscriptions", {
    method: "DELETE",
    idempotencyKey: crypto.randomUUID(),
    headers: { "X-Workspace-Id": workspaceId },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  await subscription.unsubscribe();
}
