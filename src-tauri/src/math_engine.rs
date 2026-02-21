use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Deserialize)]
pub struct GraphRequest {
    pub formula: String,
    pub x_min: f64,
    pub x_max: f64,
    pub step: f64,
}

/// Parses formula string, optionally stripping "y = " prefix.
/// Evaluates for each x in range and returns points.
/// Skips points where y is inf/nan.
pub fn calculate_graph(request: GraphRequest) -> Result<Vec<Point>, String> {
    let formula = request
        .formula
        .trim()
        .strip_prefix("y")
        .and_then(|s| s.trim_start().strip_prefix('='))
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| request.formula.trim().to_string());

    if formula.is_empty() {
        return Err("Formula cannot be empty".to_string());
    }

    let expr: meval::Expr = formula.parse().map_err(|e| {
        format!("Invalid syntax: {}", e)
    })?;

    let func = expr.bind("x").map_err(|e| {
        format!("Invalid expression (use 'x' as variable): {}", e)
    })?;

    if request.step <= 0.0 {
        return Err("Step must be positive".to_string());
    }

    if request.x_min >= request.x_max {
        return Err("x_min must be less than x_max".to_string());
    }

    let mut points = Vec::new();
    let mut x = request.x_min;

    while x <= request.x_max {
        let y = func(x);
        if y.is_finite() {
            points.push(Point { x, y });
        }
        x += request.step;
    }

    Ok(points)
}
