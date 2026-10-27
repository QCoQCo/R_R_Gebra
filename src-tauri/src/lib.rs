mod math_engine;

use math_engine::{GraphRequest, ImplicitRequest, Point};

// 동기 커맨드는 메인 스레드에서 실행되어 계산 동안 창이 멈춘다.
// async 커맨드 + spawn_blocking 으로 계산을 블로킹 전용 스레드에서 돌린다.

#[tauri::command]
async fn calculate_graph(request: GraphRequest) -> Result<Vec<Vec<Point>>, String> {
    tauri::async_runtime::spawn_blocking(move || math_engine::calculate_graph(request))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn calculate_implicit(request: ImplicitRequest) -> Result<Vec<Vec<Point>>, String> {
    tauri::async_runtime::spawn_blocking(move || math_engine::calculate_implicit(request))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![calculate_graph, calculate_implicit])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
