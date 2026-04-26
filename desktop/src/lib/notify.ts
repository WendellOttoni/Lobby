import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

let permissionChecked = false;
let permissionGranted = false;

export async function notify(title: string, body: string) {
  if (!permissionChecked) {
    permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      permissionGranted = (await requestPermission()) === "granted";
    }
    permissionChecked = true;
  }
  if (permissionGranted) sendNotification({ title, body });
}

const MENTION_NOTIFY_KEY = "lobby_mention_notify";

export function isMentionNotifyEnabled(): boolean {
  return localStorage.getItem(MENTION_NOTIFY_KEY) !== "false";
}

export function setMentionNotifyEnabled(enabled: boolean) {
  localStorage.setItem(MENTION_NOTIFY_KEY, enabled ? "true" : "false");
}
