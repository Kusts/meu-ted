/**
 * notification_tools â€” Pi tools facade for notifications
 * Delegates to generated authenticated HTTP adapters (OpenAPI â†’ API).
 */
import {
  configureNotificationTool as generatedConfigure,
  listNotificationsTool as generatedList,
} from "../generated/http-tools.js";
import { Type } from "@sinclair/typebox";
import { capabilityDisabled } from "./api-tool-helpers.js";

export const configureNotification = Object.assign(generatedConfigure, { name: "configure_notification" });
export const listNotifications = Object.assign(generatedList, { name: "list_notifications" });

export const configureNotificationTool = configureNotification;
export const listNotificationsTool = listNotifications;

export const deleteNotification = {
  name: "delete_notification",
  description: "Remove a notification setting",
  parameters: Type.Object({}),
  execute: async () => capabilityDisabled("delete_notification") ?? { success: false, reason: "delete_notification route not implemented" },
};

export const processNotifications = {
  name: "process_notifications",
  description: "Process pending notifications for delivery",
  parameters: Type.Object({}),
  execute: async () => capabilityDisabled("process_notifications") ?? { success: false, reason: "process_notifications route not implemented" },
};

export const getNotificationLog = {
  name: "get_notification_log",
  description: "Read sent notification history",
  parameters: Type.Object({}),
  execute: async () => capabilityDisabled("get_notification_log") ?? { success: false, reason: "get_notification_log route not implemented" },
};

export const testNotification = {
  name: "test_notification",
  description: "Preview a notification without sending",
  parameters: Type.Object({}),
  execute: async () => capabilityDisabled("test_notification") ?? { success: false, reason: "test_notification route not implemented" },
};
