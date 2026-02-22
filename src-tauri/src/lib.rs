mod math_engine;

use math_engine::{GraphRequest, ImplicitRequest};

#[tauri::command]
fn calculate_graph(request: GraphRequest) -> Result<Vec<math_engine::Point>, String> {
    math_engine::calculate_graph(request)
}

#[tauri::command]
fn calculate_implicit(request: ImplicitRequest) -> Result<Vec<Vec<math_engine::Point>>, String> {
    math_engine::calculate_implicit(request)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![calculate_graph, calculate_implicit])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
