use std::collections::HashMap;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewUrl, WebviewWindowBuilder,
};

#[tauri::command]
fn toggle_devtools(window: tauri::WebviewWindow) {
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
}

#[tauri::command]
fn detect_game() -> Option<String> {
    let known: HashMap<&str, &str> = [
        ("cs2.exe", "Counter-Strike 2"),
        ("csgo.exe", "CS:GO"),
        ("valorant.exe", "VALORANT"),
        ("RainbowSix.exe", "Rainbow Six Siege"),
        ("FortniteClient-Win64-Shipping.exe", "Fortnite"),
        ("VALORANT-Win64-Shipping.exe", "VALORANT"),
        ("LeagueOfLegends.exe", "League of Legends"),
        ("Dota2.exe", "Dota 2"),
        ("overwatch.exe", "Overwatch 2"),
        ("destiny2.exe", "Destiny 2"),
        ("EscapeFromTarkov.exe", "Escape from Tarkov"),
        ("RustClient.exe", "Rust"),
        ("GTA5.exe", "GTA V"),
        ("Minecraft.Windows.exe", "Minecraft"),
        ("javaw.exe", "Minecraft"),
        ("eldenring.exe", "Elden Ring"),
        ("DARK SOULS III.exe", "Dark Souls III"),
        ("sekiro.exe", "Sekiro"),
        ("HorizonZeroDawn.exe", "Horizon Zero Dawn"),
        ("Cyberpunk2077.exe", "Cyberpunk 2077"),
        ("witcher3.exe", "The Witcher 3"),
        ("RocketLeague.exe", "Rocket League"),
        ("PUBG.exe", "PUBG"),
        ("WorldOfWarcraft.exe", "World of Warcraft"),
        ("ffxiv_dx11.exe", "Final Fantasy XIV"),
        ("Hearthstone.exe", "Hearthstone"),
        ("StarCraft II.exe", "StarCraft II"),
        ("Warframe.x64.exe", "Warframe"),
        ("PathOfExile.exe", "Path of Exile"),
    ]
    .into_iter()
    .collect();

    let mut cmd = std::process::Command::new("tasklist");
    cmd.args(["/FO", "CSV", "/NH"]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let output = cmd.output().ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if let Some(name) = line.split(',').next() {
            let exe = name.trim_matches('"');
            for (proc, game) in &known {
                if exe.eq_ignore_ascii_case(proc) {
                    return Some(game.to_string());
                }
            }
        }
    }
    None
}

// Prevent Windows from sleeping while in a voice call.
// Uses raw WinAPI: ES_CONTINUOUS | ES_SYSTEM_REQUIRED to keep the thread awake,
// and ES_CONTINUOUS alone to reset.
#[tauri::command]
fn set_keep_awake(enabled: bool) {
    #[cfg(target_os = "windows")]
    {
        const ES_CONTINUOUS: u32 = 0x80000000;
        const ES_SYSTEM_REQUIRED: u32 = 0x00000001;

        #[link(name = "kernel32")]
        extern "system" {
            fn SetThreadExecutionState(es_flags: u32) -> u32;
        }

        unsafe {
            if enabled {
                SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED);
            } else {
                SetThreadExecutionState(ES_CONTINUOUS);
            }
        }
    }
}

#[tauri::command]
async fn show_overlay(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(overlay) = app.get_webview_window("overlay") {
        overlay.show().map_err(|e| e.to_string())?;
        overlay.set_focus().map_err(|e| e.to_string())?;
    } else {
        let monitor = app
            .primary_monitor()
            .map_err(|e| e.to_string())?
            .unwrap_or_else(|| {
                app.available_monitors()
                    .ok()
                    .and_then(|m| m.into_iter().next())
                    .unwrap()
            });

        let scale = monitor.scale_factor();
        let screen_width = (monitor.size().width as f64 / scale) as i32;

        WebviewWindowBuilder::new(
            &app,
            "overlay",
            WebviewUrl::App("overlay".into()),
        )
        .title("Lobby Overlay")
        .inner_size(200.0, 300.0)
        .position((screen_width - 220) as f64, 80.0)
        .always_on_top(true)
        .decorations(false)
        .transparent(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(true)
        .build()
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn hide_overlay(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(overlay) = app.get_webview_window("overlay") {
        overlay.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Abrir", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("Lobby")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let updater = match tauri_plugin_updater::UpdaterExt::updater(&handle) {
                    Ok(u) => u,
                    Err(e) => {
                        eprintln!("[updater] init failed: {e}");
                        return;
                    }
                };
                match updater.check().await {
                    Ok(Some(update)) => {
                        eprintln!("[updater] update available: {}", update.version);
                        if let Err(e) = update.download_and_install(|_, _| {}, || {}).await {
                            eprintln!("[updater] install failed: {e}");
                            return;
                        }
                        handle.restart();
                    }
                    Ok(None) => eprintln!("[updater] already on latest version"),
                    Err(e) => eprintln!("[updater] check failed: {e}"),
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Overlay can be truly closed; main window hides to tray
                if window.label() == "overlay" {
                    return;
                }
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            detect_game,
            toggle_devtools,
            set_keep_awake,
            show_overlay,
            hide_overlay,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
