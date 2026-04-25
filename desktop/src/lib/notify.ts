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
