use serde::{Deserialize, Serialize};

/// log(x) = log10(x) = ln(x) / ln(10)
fn log10_fn(x: f64) -> f64 {
    x.ln() / 10_f64.ln()
}

fn math_context() -> meval::Context<'static> {
    let mut ctx = meval::Context::new();
    ctx.func("log", log10_fn)
        .func("log10", log10_fn);
    ctx
}

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

    let ctx = math_context();
    let func = expr
        .bind_with_context(ctx, "x")
        .map_err(|e| {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn req(formula: &str, x_min: f64, x_max: f64, step: f64) -> GraphRequest {
        GraphRequest {
            formula: formula.to_string(),
            x_min,
            x_max,
            step,
        }
    }

    #[test]
    fn test_linear() {
        let pts = calculate_graph(req("x", 0.0, 2.0, 1.0)).unwrap();
        assert_eq!(pts.len(), 3);
        assert!((pts[0].y - 0.0).abs() < 1e-10);
        assert!((pts[1].y - 1.0).abs() < 1e-10);
        assert!((pts[2].y - 2.0).abs() < 1e-10);
    }

    #[test]
    fn test_quadratic() {
        let pts = calculate_graph(req("x^2", -1.0, 1.0, 1.0)).unwrap();
        assert_eq!(pts.len(), 3);
        assert!((pts[0].y - 1.0).abs() < 1e-10);
        assert!((pts[1].y - 0.0).abs() < 1e-10);
        assert!((pts[2].y - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_sin() {
        let pts = calculate_graph(req("sin(x)", 0.0, 0.01, 0.01)).unwrap();
        assert!(!pts.is_empty());
        assert!((pts[0].y - 0.0).abs() < 1e-10);
    }

    #[test]
    fn test_log10() {
        let pts = calculate_graph(req("log(x)", 10.0, 10.01, 0.01)).unwrap();
        assert!(!pts.is_empty());
        assert!((pts[0].y - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_y_prefix_stripped() {
        let pts = calculate_graph(req("y = x", 1.0, 1.01, 0.01)).unwrap();
        assert!(!pts.is_empty());
        assert!((pts[0].y - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_empty_formula() {
        let r = calculate_graph(req("", 0.0, 1.0, 0.1));
        assert!(r.is_err());
        assert!(r.unwrap_err().contains("empty"));
    }

    #[test]
    fn test_invalid_syntax() {
        let r = calculate_graph(req("x +", 0.0, 1.0, 0.1));
        assert!(r.is_err());
        assert!(r.unwrap_err().contains("Invalid syntax"));
    }

    #[test]
    fn test_step_must_be_positive() {
        let r = calculate_graph(req("x", 0.0, 1.0, 0.0));
        assert!(r.is_err());
        assert!(r.unwrap_err().contains("positive"));
    }

    #[test]
    fn test_xmin_less_than_xmax() {
        let r = calculate_graph(req("x", 10.0, 0.0, 0.1));
        assert!(r.is_err());
        assert!(r.unwrap_err().contains("less than"));
    }

    #[test]
    fn test_inf_nan_filtered() {
        // 1/x at x=0 gives inf, should be filtered
        let pts = calculate_graph(req("1/x", -1.0, 1.0, 0.5)).unwrap();
        // x=-1, -0.5, 0, 0.5, 1 -> 0 gives inf, filtered
        assert!(pts.len() < 5);
        assert!(pts.iter().all(|p| p.y.is_finite()));
    }

    #[test]
    fn test_tan() {
        // tan(0) = 0
        let pts = calculate_graph(req("tan(x)", 0.0, 0.01, 0.01)).unwrap();
        assert!(!pts.is_empty());
        assert!((pts[0].y - 0.0).abs() < 1e-10);
    }

    #[test]
    fn test_asin() {
        // asin(0) = 0
        let pts = calculate_graph(req("asin(x)", 0.0, 0.01, 0.01)).unwrap();
        assert!(!pts.is_empty());
        assert!((pts[0].y - 0.0).abs() < 1e-10);
    }

    #[test]
    fn test_acos() {
        // acos(0) = pi/2
        let pts = calculate_graph(req("acos(x)", 0.0, 0.01, 0.01)).unwrap();
        assert!(!pts.is_empty());
        let expected = std::f64::consts::FRAC_PI_2;
        assert!((pts[0].y - expected).abs() < 1e-10);
    }

    #[test]
    fn test_atan() {
        // atan(0) = 0
        let pts = calculate_graph(req("atan(x)", 0.0, 0.01, 0.01)).unwrap();
        assert!(!pts.is_empty());
        assert!((pts[0].y - 0.0).abs() < 1e-10);
    }

    #[test]
    fn test_sinh_cosh_tanh() {
        // sinh(0)=0, cosh(0)=1, tanh(0)=0
        let pts = calculate_graph(req("sinh(x)", 0.0, 0.01, 0.01)).unwrap();
        assert!(!pts.is_empty());
        assert!((pts[0].y - 0.0).abs() < 1e-10);

        let pts = calculate_graph(req("cosh(x)", 0.0, 0.01, 0.01)).unwrap();
        assert!(!pts.is_empty());
        assert!((pts[0].y - 1.0).abs() < 1e-10);

        let pts = calculate_graph(req("tanh(x)", 0.0, 0.01, 0.01)).unwrap();
        assert!(!pts.is_empty());
        assert!((pts[0].y - 0.0).abs() < 1e-10);
    }
}
