//! OS-level reminder scheduling so toasts can fire after the process exits.

const MAX_OS_REMINDERS: usize = 48;
const MAX_AHEAD_MS: u64 = 90 * 24 * 60 * 60 * 1000;
#[cfg(windows)]
const AUMID: &str = "com.minimal.todo";
#[cfg(target_os = "macos")]
const LABEL_PREFIX: &str = "com.minimal.todo.reminder.";

#[derive(Clone)]
pub struct OsReminder {
    pub id: String,
    pub title: String,
    pub body: String,
    pub fire_at_ms: u64,
}

pub fn sync(reminders: &[OsReminder]) -> bool {
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let mut upcoming: Vec<OsReminder> = reminders
        .iter()
        .filter(|item| item.fire_at_ms > now_ms && item.fire_at_ms <= now_ms + MAX_AHEAD_MS)
        .cloned()
        .collect();
    upcoming.sort_by_key(|item| item.fire_at_ms);
    upcoming.truncate(MAX_OS_REMINDERS);
    match sync_platform(&upcoming) {
        Ok(()) => true,
        Err(error) => {
            eprintln!("os reminders: {error}");
            false
        }
    }
}

#[cfg(windows)]
fn sync_platform(reminders: &[OsReminder]) -> Result<(), String> {
    windows_sync(reminders)
}

#[cfg(target_os = "macos")]
fn sync_platform(reminders: &[OsReminder]) -> Result<(), String> {
    macos_sync(reminders)
}

#[cfg(not(any(windows, target_os = "macos")))]
fn sync_platform(_reminders: &[OsReminder]) -> Result<(), String> {
    Err("os reminders unsupported on this platform".into())
}

#[cfg(any(windows, target_os = "macos"))]
fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(any(windows, target_os = "macos"))]
fn compact_id(reminder_id: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    reminder_id.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

#[cfg(windows)]
fn windows_sync(reminders: &[OsReminder]) -> Result<(), String> {
    use windows::core::HSTRING;
    use windows::Data::Xml::Dom::XmlDocument;
    use windows::Foundation::DateTime;
    use windows::UI::Notifications::{
        ScheduledToastNotification, ToastNotificationManager,
    };
    use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;

    let aumid = HSTRING::from(AUMID);
    unsafe {
        SetCurrentProcessExplicitAppUserModelID(&aumid).map_err(|e| e.to_string())?;
    }
    let notifier = ToastNotificationManager::CreateToastNotifierWithId(&aumid)
        .map_err(|e| e.to_string())?;
    if let Ok(existing) = notifier.GetScheduledToastNotifications() {
        let count = existing.Size().unwrap_or(0);
        for index in 0..count {
            if let Ok(item) = existing.GetAt(index) {
                let _ = notifier.RemoveFromSchedule(&item);
            }
        }
    }
    for item in reminders {
        let payload = format!(
            "<toast><visual><binding template=\"ToastGeneric\"><text>{}</text><text>{}</text></binding></visual></toast>",
            xml_escape(&item.title),
            xml_escape(&item.body),
        );
        let xml = XmlDocument::new().map_err(|e| e.to_string())?;
        xml.LoadXml(&HSTRING::from(payload)).map_err(|e| e.to_string())?;
        let delivery = DateTime {
            UniversalTime: unix_ms_to_windows_ticks(item.fire_at_ms),
        };
        let scheduled = ScheduledToastNotification::CreateScheduledToastNotification(&xml, delivery)
            .map_err(|e| e.to_string())?;
        scheduled
            .SetId(&HSTRING::from(compact_id(&item.id)))
            .map_err(|e| e.to_string())?;
        notifier
            .AddToSchedule(&scheduled)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(windows)]
fn unix_ms_to_windows_ticks(ms: u64) -> i64 {
    const EPOCH_OFFSET_MS: i64 = 11_644_473_600_000;
    (ms as i64 + EPOCH_OFFSET_MS) * 10_000
}

#[cfg(target_os = "macos")]
fn macos_sync(reminders: &[OsReminder]) -> Result<(), String> {
    use std::fs;
    use std::path::PathBuf;
    use std::process::Command;

    let home = std::env::var("HOME").map_err(|_| "missing HOME".to_string())?;
    let agents = PathBuf::from(home).join("Library/LaunchAgents");
    fs::create_dir_all(&agents).map_err(|e| e.to_string())?;
    let uid = macos_uid()?;
    let domain = format!("gui/{uid}");

    if let Ok(entries) = fs::read_dir(&agents) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if !name.starts_with(LABEL_PREFIX) {
                continue;
            }
            let label = name.trim_end_matches(".plist").trim_end_matches(".sh");
            let _ = Command::new("launchctl")
                .args(["bootout", &format!("{domain}/{label}")])
                .status();
            let _ = fs::remove_file(entry.path());
        }
    }

    for item in reminders {
        let label = format!("{LABEL_PREFIX}{}", compact_id(&item.id));
        let plist_path = agents.join(format!("{label}.plist"));
        let script_path = agents.join(format!("{label}.sh"));
        let (year, month, day, hour, minute) = unix_ms_to_local_parts(item.fire_at_ms);
        let script = format!(
            "#!/bin/bash\n/usr/bin/osascript -e {}\n/bin/launchctl bootout {domain}/{label} >/dev/null 2>&1\n/bin/rm -f {} {}\n",
            applescript_literal(&format!(
                "display notification \"{}\" with title \"{}\"",
                applescript_escape(&item.body),
                applescript_escape(&item.title),
            )),
            sh_single(&script_path.to_string_lossy()),
            sh_single(&plist_path.to_string_lossy()),
        );
        fs::write(&script_path, script).map_err(|e| e.to_string())?;
        let _ = Command::new("chmod").args(["+x", &script_path.to_string_lossy()]).status();
        let plist = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>{label}</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>{}</string></array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Month</key><integer>{month}</integer>
    <key>Day</key><integer>{day}</integer>
    <key>Hour</key><integer>{hour}</integer>
    <key>Minute</key><integer>{minute}</integer>
  </dict>
  <key>RunAtLoad</key><false/>
</dict></plist>
"#,
            xml_escape(&script_path.to_string_lossy()),
        );
        let _ = year;
        fs::write(&plist_path, plist).map_err(|e| e.to_string())?;
        let status = Command::new("launchctl")
            .args(["bootstrap", &domain, &plist_path.to_string_lossy()])
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            let _ = Command::new("launchctl")
                .args(["load", "-w", &plist_path.to_string_lossy()])
                .status();
        }
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn macos_uid() -> Result<u32, String> {
    let output = std::process::Command::new("id")
        .arg("-u")
        .output()
        .map_err(|e| e.to_string())?;
    String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse()
        .map_err(|_| "invalid uid".into())
}

#[cfg(target_os = "macos")]
fn unix_ms_to_local_parts(ms: u64) -> (i32, u32, u32, u32, u32) {
    let secs = (ms / 1000) as i64;
    let output = std::process::Command::new("date")
        .args(["-r", &secs.to_string(), "+%Y %m %d %H %M"])
        .output()
        .ok()
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .unwrap_or_default();
    let parts: Vec<u32> = output.split_whitespace().filter_map(|p| p.parse().ok()).collect();
    if parts.len() >= 5 {
        (
            parts[0] as i32,
            parts[1],
            parts[2],
            parts[3],
            parts[4],
        )
    } else {
        (1970, 1, 1, 0, 0)
    }
}

#[cfg(target_os = "macos")]
fn applescript_escape(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

#[cfg(target_os = "macos")]
fn applescript_literal(script: &str) -> String {
    format!("'{}'", script.replace('\'', "'\\''"))
}

#[cfg(target_os = "macos")]
fn sh_single(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}
