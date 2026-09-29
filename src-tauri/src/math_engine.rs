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
pub struct ImplicitRequest {
    pub formula: String,
    pub x_min: f64,
    pub x_max: f64,
    pub y_min: f64,
    pub y_max: f64,
    pub grid_size: u32,
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

/// Marching squares lookup: case_index -> list of (edge_a, edge_b) pairs for segments.
/// Edges: 0=top, 1=right, 2=bottom, 3=left. Corners: 0=bl, 1=br, 2=tr, 3=tl.
/// Case index: bit0=bl, bit1=br, bit2=tr, bit3=tl (1 = above threshold).
const MS_EDGES: &[&[(u8, u8)]] = &[
    &[],              // 0: all below
    &[(2, 3)],        // 1
    &[(1, 2)],        // 2
    &[(1, 3)],        // 3
    &[(0, 1)],        // 4
    &[(0, 3), (1, 2)], // 5: saddle (실제 선분은 saddle_edges에서 결정)
    &[(0, 2)],        // 6
    &[(0, 3)],        // 7
    &[(0, 3)],        // 8
    &[(0, 2)],        // 9
    &[(0, 1), (2, 3)], // 10: saddle (실제 선분은 saddle_edges에서 결정)
    &[(0, 1)],        // 11
    &[(1, 3)],        // 12
    &[(1, 2)],        // 13
    &[(2, 3)],        // 14
    &[],              // 15: all above
];

/// Saddle 셀(case 5: bl·tr 위, case 10: br·tl 위)은 항상 선분 2개가 필요하다.
/// 셀 중심값의 부호로 어느 코너 쌍이 이어져 있는지 판단해 연결 방식을 고른다.
/// - 중심이 위 → 위 코너끼리 이어짐 → 아래 코너 2개를 각각 잘라내는 선분
/// - 중심이 아래 → 아래 코너끼리 이어짐 → 위 코너 2개를 각각 잘라내는 선분
fn saddle_edges(idx: u8, center_above: bool) -> &'static [(u8, u8)] {
    match (idx, center_above) {
        // tl(top,left) + br(right,bottom) 을 잘라냄
        (5, true) | (10, false) => &[(0, 3), (1, 2)],
        // tr(top,right) + bl(bottom,left) 을 잘라냄
        _ => &[(0, 1), (2, 3)],
    }
}

/// Parses f(x,y)=0 formula (left - right). Expects "left" or "left - right" or "left = right".
fn parse_implicit_formula(s: &str) -> Result<String, String> {
    let s = s.trim();
    if s.is_empty() {
        return Err("Formula cannot be empty".to_string());
    }
    let formula = if let Some(idx) = s.find('=') {
        let left = s[..idx].trim();
        let right = s[idx + 1..].trim();
        if right == "0" {
            left.to_string()
        } else {
            format!("({})-({})", left, right)
        }
    } else {
        s.to_string()
    };
    Ok(formula)
}

/// Evaluate f(x,y) at grid point. Returns None if inf/nan.
fn eval_cell(f: &dyn Fn(f64, f64) -> f64, x: f64, y: f64) -> Option<f64> {
    let v = f(x, y);
    if v.is_finite() {
        Some(v)
    } else {
        None
    }
}

/// Linear interpolation: t such that (1-t)*v0 + t*v1 = 0 => t = -v0/(v1-v0)
fn lerp_zero(v0: f64, v1: f64) -> Option<f64> {
    let d = v1 - v0;
    if d.abs() < 1e-15 {
        return None;
    }
    let t = -v0 / d;
    if (0.0..=1.0).contains(&t) {
        Some(t)
    } else {
        None
    }
}

/// Compute contour segments for f(x,y)=0 using marching squares.
/// Returns Vec of contours, each contour is Vec<Point>.
pub fn calculate_implicit(request: ImplicitRequest) -> Result<Vec<Vec<Point>>, String> {
    let formula = parse_implicit_formula(&request.formula)?;

    let expr: meval::Expr = formula.parse().map_err(|e| {
        format!("Invalid syntax: {}", e)
    })?;

    let ctx = math_context();
    let func = expr
        .bind2_with_context(ctx, "x", "y")
        .map_err(|e| {
            format!("Invalid expression (use 'x' and 'y' as variables): {}", e)
        })?;

    if request.x_min >= request.x_max || request.y_min >= request.y_max {
        return Err("x_min < x_max and y_min < y_max required".to_string());
    }
    if request.grid_size < 2 {
        return Err("grid_size must be at least 2".to_string());
    }

    let n = request.grid_size as usize;
    let dx = (request.x_max - request.x_min) / (n - 1) as f64;
    let dy = (request.y_max - request.y_min) / (n - 1) as f64;

    // Build value grid: grid[ix][iy] = f(x_ix, y_iy)
    let mut grid: Vec<Vec<Option<f64>>> = vec![vec![None; n]; n];
    for ix in 0..n {
        for iy in 0..n {
            let x = request.x_min + ix as f64 * dx;
            let y = request.y_min + iy as f64 * dy;
            grid[ix][iy] = eval_cell(&func, x, y);
        }
    }

    // Collect segments: (Point, Point)
    let mut segments: Vec<(Point, Point)> = Vec::new();

    for ix in 0..n.saturating_sub(1) {
        for iy in 0..n.saturating_sub(1) {
            let v00 = grid[ix][iy];
            let v10 = grid[ix + 1][iy];
            let v11 = grid[ix + 1][iy + 1];
            let v01 = grid[ix][iy + 1];

            let (v00, v10, v11, v01) = match (v00, v10, v11, v01) {
                (Some(a), Some(b), Some(c), Some(d)) => (a, b, c, d),
                _ => continue,
            };

            let sign = |v: f64| v >= 0.0;
            let s00 = sign(v00);
            let s10 = sign(v10);
            let s11 = sign(v11);
            let s01 = sign(v01);

            let idx = (s00 as u8) | ((s10 as u8) << 1) | ((s11 as u8) << 2) | ((s01 as u8) << 3);

            let x0 = request.x_min + ix as f64 * dx;
            let y0 = request.y_min + iy as f64 * dy;
            let x1 = request.x_min + (ix + 1) as f64 * dx;
            let y1 = request.y_min + (iy + 1) as f64 * dy;

            let edge_points = |e: u8| -> Option<Point> {
                match e {
                    0 => {
                        let t = lerp_zero(v01, v11)?;
                        Some(Point {
                            x: x0 + t * (x1 - x0),
                            y: y1,
                        })
                    }
                    1 => {
                        let t = lerp_zero(v10, v11)?;
                        Some(Point {
                            x: x1,
                            y: y0 + t * (y1 - y0),
                        })
                    }
                    2 => {
                        let t = lerp_zero(v00, v10)?;
                        Some(Point {
                            x: x0 + t * (x1 - x0),
                            y: y0,
                        })
                    }
                    3 => {
                        let t = lerp_zero(v00, v01)?;
                        Some(Point {
                            x: x0,
                            y: y0 + t * (y1 - y0),
                        })
                    }
                    _ => None,
                }
            };

            let edges = if idx == 5 || idx == 10 {
                // 중심을 직접 평가하고, 정의되지 않으면 네 꼭짓점 평균으로 대체
                let center = eval_cell(&func, (x0 + x1) / 2.0, (y0 + y1) / 2.0)
                    .unwrap_or((v00 + v10 + v11 + v01) / 4.0);
                saddle_edges(idx, center >= 0.0)
            } else {
                MS_EDGES[idx as usize]
            };
            for seg in edges {
                if let (Some(p1), Some(p2)) = (edge_points(seg.0), edge_points(seg.1)) {
                    // 꼭짓점이 정확히 곡선 위(f=0)면 두 끝점이 같은 길이 0 선분이 생김
                    if !point_eq(&p1, &p2, SEGMENT_EPS) {
                        segments.push((p1, p2));
                    }
                }
            }
        }
    }

    // Connect segments into polylines
    let curves = connect_segments(segments);
    Ok(curves)
}

/// 선분 끝점을 같은 점으로 볼 허용 오차
const SEGMENT_EPS: f64 = 1e-10;

fn point_eq(a: &Point, b: &Point, eps: f64) -> bool {
    (a.x - b.x).abs() < eps && (a.y - b.y).abs() < eps
}

fn connect_segments(mut segments: Vec<(Point, Point)>) -> Vec<Vec<Point>> {
    const EPS: f64 = SEGMENT_EPS;
    let mut curves: Vec<Vec<Point>> = Vec::new();

        while let Some((start, end)) = segments.pop() {
        let mut curve = vec![start.clone(), end.clone()];

        loop {
            let mut found = false;
            for i in (0..segments.len()).rev() {
                let (a, b) = &segments[i];
                let head = curve.first().unwrap();
                let tail = curve.last().unwrap();

                if point_eq(a, tail, EPS) {
                    curve.push(b.clone());
                    segments.remove(i);
                    found = true;
                    break;
                }
                if point_eq(b, tail, EPS) {
                    curve.push(a.clone());
                    segments.remove(i);
                    found = true;
                    break;
                }
                if point_eq(a, head, EPS) {
                    curve.insert(0, b.clone());
                    segments.remove(i);
                    found = true;
                    break;
                }
                if point_eq(b, head, EPS) {
                    curve.insert(0, a.clone());
                    segments.remove(i);
                    found = true;
                    break;
                }
            }
            if !found {
                break;
            }
        }

        if curve.len() >= 2 {
            curves.push(curve);
        }
    }

    curves
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

#[cfg(test)]
mod implicit_tests {
    use super::*;

    fn imp_req(formula: &str, x_min: f64, x_max: f64, y_min: f64, y_max: f64, grid: u32) -> ImplicitRequest {
        ImplicitRequest {
            formula: formula.to_string(),
            x_min,
            x_max,
            y_min,
            y_max,
            grid_size: grid,
        }
    }

    #[test]
    fn test_parse_implicit() {
        let r = calculate_implicit(imp_req("x^2 + y^2 - 1", -2.0, 2.0, -2.0, 2.0, 50));
        assert!(r.is_ok());
        let curves = r.unwrap();
        assert!(!curves.is_empty());
        assert!(!curves[0].is_empty());
        // Circle: points should be roughly on unit circle
        for curve in &curves {
            for p in curve {
                let r_sq = p.x * p.x + p.y * p.y;
                assert!((r_sq - 1.0).abs() < 0.1, "point ({}, {}) not on circle: r^2={}", p.x, p.y, r_sq);
            }
        }
    }

    #[test]
    fn test_implicit_equals_zero() {
        let r = calculate_implicit(imp_req("x^2 + y^2 = 1", -2.0, 2.0, -2.0, 2.0, 50));
        assert!(r.is_ok());
        let curves = r.unwrap();
        assert!(!curves.is_empty());
    }

    #[test]
    fn test_implicit_empty() {
        let r = calculate_implicit(imp_req("", -1.0, 1.0, -1.0, 1.0, 20));
        assert!(r.is_err());
    }

    #[test]
    fn test_saddle_cell_emits_two_segments() {
        // 셀 1개(grid 2)짜리 saddle: 쌍곡선 xy = ±0.1 의 두 가지가 각각 선분 하나씩
        for formula in ["x*y+0.1", "x*y-0.1", "-x*y+0.1", "-x*y-0.1"] {
            let curves = calculate_implicit(imp_req(formula, -1.0, 1.0, -1.0, 1.0, 2)).unwrap();
            assert_eq!(curves.len(), 2, "{}: expected 2 segments, got {:?}", formula, curves);
            // 연결 쌍이 맞으면 각 선분은 한 사분면 안에 있음 (중심을 가로지르지 않음)
            for curve in &curves {
                let (a, b) = (&curve[0], &curve[curve.len() - 1]);
                assert!(
                    a.x.signum() == b.x.signum() && a.y.signum() == b.y.signum(),
                    "{}: segment crosses quadrants: ({}, {}) - ({}, {})",
                    formula, a.x, a.y, b.x, b.y
                );
            }
        }
    }

    /// 열린 곡선의 양 끝은 영역 경계 위에 있어야 한다. 내부에서 끊기면 선분이 누락된 것.
    fn assert_open_ends_on_boundary(formula: &str, x_min: f64, x_max: f64, y_min: f64, y_max: f64, grid: u32) -> Vec<Vec<Point>> {
        let curves = calculate_implicit(imp_req(formula, x_min, x_max, y_min, y_max, grid)).unwrap();
        let eps = 1e-9;
        let on_boundary = |p: &Point| {
            (p.x - x_min).abs() < eps
                || (p.x - x_max).abs() < eps
                || (p.y - y_min).abs() < eps
                || (p.y - y_max).abs() < eps
        };
        for curve in &curves {
            let (a, b) = (&curve[0], &curve[curve.len() - 1]);
            if point_eq(a, b, eps) {
                continue; // 닫힌 곡선
            }
            assert!(
                on_boundary(a) && on_boundary(b),
                "{}: curve ends inside domain: ({}, {}) .. ({}, {})",
                formula, a.x, a.y, b.x, b.y
            );
        }
        curves
    }

    #[test]
    fn test_crossing_curves_have_no_gaps() {
        // 격자 꼭짓점이 곡선 위에 정확히 놓이지 않도록 범위를 살짝 어긋나게 잡음
        let curves = assert_open_ends_on_boundary("x*y", -1.05, 0.95, -1.05, 0.95, 21);
        assert_eq!(curves.len(), 2, "xy=0 should form 2 curves, got {}", curves.len());
        assert_open_ends_on_boundary("x^2-y^2", -1.0, 1.0, -0.97, 1.03, 21);
        assert_open_ends_on_boundary("sin(3*x)*sin(3*y)", -2.03, 1.97, -2.03, 1.97, 41);
    }

    #[test]
    fn test_curve_through_grid_vertices_has_no_zero_length_pieces() {
        // 대칭 범위에서는 대각선 위 꼭짓점이 모두 f=0 → 예전엔 길이 0 조각 49개가 섞여 나옴
        let curves = calculate_implicit(imp_req("(x^(2)-y^(2))-(0)", -10.0, 10.0, -10.0, 10.0, 240)).unwrap();
        assert_eq!(curves.len(), 2, "expected 2 curves, got {}", curves.len());
        for curve in &curves {
            let length: f64 = curve
                .windows(2)
                .map(|w| ((w[1].x - w[0].x).powi(2) + (w[1].y - w[0].y).powi(2)).sqrt())
                .sum();
            assert!(length > 1.0, "zero-length curve: {:?}", curve);
        }
    }

    #[test]
    fn test_implicit_invalid_bounds() {
        let r = calculate_implicit(imp_req("x+y", 1.0, -1.0, -1.0, 1.0, 20));
        assert!(r.is_err());
    }
}
