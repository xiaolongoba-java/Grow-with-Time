// This is a desktop GUI app; never create a console host window on Windows.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

fn main() {
    minimal_todo_lib::run()
}
