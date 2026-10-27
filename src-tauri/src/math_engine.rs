use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

/// log(x) = log10(x) = ln(x) / ln(10)
fn log10_fn(x: f64) -> f64 {
    x.ln() / 10_f64.ln()
}

/// mod(a, b): 나머지. 결과 부호는 b 를 따름 (mod(-7, 3) = 2, Python 의 % 와 같음). b = 0 이면 NaN.
/// GeoGebra 의 Mod(a, b) 에 대응 (% 는 퍼센트로 쓰므로 나머지는 함수로만 제공)
fn mod_fn(a: f64, b: f64) -> f64 {
    let r = a % b;
    if r != 0.0 && (r < 0.0) != (b < 0.0) {
        r + b
    } else {
        r
    }
}

fn math_context() -> meval::Context<'static> {
    let mut ctx = meval::Context::new();
    ctx.func("log", log10_fn)
        .func("log10", log10_fn)
        .func2("mod", mod_fn);
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

/// y=f(x) 한 번 계산에 허용하는 최대 샘플 수 (수동 모드의 넓은 범위·작은 간격으로 인한 프리징 방지)
pub const MAX_GRAPH_SAMPLES: usize = 100_000;

/// 암시적 방정식 격자 한 변의 최대 크기 (grid_size² 번 평가)
pub const MAX_GRID_SIZE: u32 = 1024;

/// 불연속 판정 시 구간을 좁혀 들어가는 최대 횟수
const DISCONTINUITY_BISECTIONS: usize = 30;

/// 불연속 판정 시 구간을 나누는 비율. 정확히 가운데(0.5)면 원래 샘플 격자 위의
/// 점(예: sin(x)/x 의 x=0)을 다시 밟으므로 살짝 비켜 나눈다.
const DISCONTINUITY_SPLIT: f64 = 0.49;

/// [x_min, x_max]를 step 간격으로 나눈 샘플 위치.
/// 누적 오차가 없도록 x_min + i·step 으로 계산하고, 마지막 샘플은 항상 x_max
/// (나누어떨어지지 않으면 마지막 간격만 짧아짐).
fn sample_positions(x_min: f64, x_max: f64, step: f64) -> impl Iterator<Item = f64> {
    let intervals = (((x_max - x_min) / step) - 1e-9).ceil().max(1.0) as usize;
    (0..=intervals).map(move |i| if i == intervals { x_max } else { x_min + i as f64 * step })
}

/// 인접한 두 샘플 a, b 사이가 끊겨 있는지(점근선, 계단 등) 판정한다.
/// 변화가 큰 쪽으로 구간을 계속 좁혀 들어가며, 연속 함수면 변화량이 구간과 함께 줄어들고
/// 불연속이면 줄지 않거나(계단) 커지거나(점근선) 도중에 정의되지 않는 점을 만난다.
fn is_discontinuous(f: &dyn Fn(f64) -> f64, mut a: Point, mut b: Point) -> bool {
    // 값 크기에 비해 아주 작은 변화(부동소수점 잡음 수준)는 연속으로 본다.
    // a, b가 같은 값이어도(1/x² 를 대칭으로 샘플링) 사이에 점근선이 있을 수 있으므로 0을 기준으로 두지 않음.
    let scale = a.y.abs().max(b.y.abs()).max(1.0);
    let threshold = 0.1 * (b.y - a.y).abs().max(1e-6 * scale);

    for _ in 0..DISCONTINUITY_BISECTIONS {
        let xm = a.x + (b.x - a.x) * DISCONTINUITY_SPLIT;
        let ym = f(xm);
        if !ym.is_finite() {
            return true;
        }
        let m = Point { x: xm, y: ym };
        if (m.y - a.y).abs() >= (b.y - m.y).abs() {
            b = m;
        } else {
            a = m;
        }
        if (b.y - a.y).abs() < threshold {
            return false;
        }
    }
    true
}

/// Parses formula string, optionally stripping "y = " prefix, and samples y=f(x) over [x_min, x_max].
/// Returns continuous pieces of the curve: a new piece starts where y is undefined (inf/nan)
/// or the function jumps (asymptote, step), so the frontend never draws lines across them.
pub fn calculate_graph(request: GraphRequest) -> Result<Vec<Vec<Point>>, String> {
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

    if !(request.step.is_finite() && request.step > 0.0) {
        return Err("Step must be positive".to_string());
    }

    if !(request.x_min.is_finite() && request.x_max.is_finite()) {
        return Err("x range must be finite".to_string());
    }

    if request.x_min >= request.x_max {
        return Err("x_min must be less than x_max".to_string());
    }

    let samples = (request.x_max - request.x_min) / request.step;
    if samples > MAX_GRAPH_SAMPLES as f64 {
        return Err(format!(
            "Too many points: (x_max - x_min) / step = {:.0} exceeds {} (increase step or narrow the range)",
            samples, MAX_GRAPH_SAMPLES
        ));
    }

    let mut pieces: Vec<Vec<Point>> = Vec::new();
    let mut current: Vec<Point> = Vec::new();
    // current 의 마지막 점 이후 건너뛴(정의되지 않은) 샘플 수
    let mut skipped = 0usize;

    for x in sample_positions(request.x_min, request.x_max, request.step) {
        let y = func(x);
        if !y.is_finite() {
            skipped += 1;
            continue;
        }
        let p = Point { x, y };
        if let Some(prev) = current.last() {
            // 샘플 하나만 빠진 경우(sin(x)/x 의 x=0 같은 제거 가능한 점)는 양옆이 이어지면 그대로 연결
            let connected = skipped <= 1 && !is_discontinuous(&func, prev.clone(), p.clone());
            if !connected {
                pieces.push(std::mem::take(&mut current));
            }
        }
        current.push(p);
        skipped = 0;
    }
    if !current.is_empty() {
        pieces.push(current);
    }

    Ok(pieces)
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

/// 격자 안쪽 선을 셀 크기의 이 비율만큼 민다 (x, y 다르게). 양 끝 선은 범위 경계 그대로.
/// 대칭 범위에서 꼭짓점이 x = ±y, x = 0 같은 대칭선 위에 정확히 놓이면 f = 0 인 꼭짓점이 생겨
/// 길이 0 선분·교차점의 틈 같은 퇴화가 생긴다. 비율이 서로 다르면 x_i = ±y_j 도 생기지 않음.
const GRID_OFFSET_X: f64 = 0.0137;
const GRID_OFFSET_Y: f64 = 0.0291;

/// 세분화할 때 셀 한 변의 하위 칸 수. 짝수라 셀 중심을 지나는 하위 격자선이 생겨
/// 중심 판정으로 찾은 가는 띠를 하위 격자에서도 반드시 잡는다.
const REFINE_SUBDIVISIONS: usize = 4;

/// 세분화할 셀 수 상한 (×(k+1)² 번 평가). 넘으면 세분화 없이 기본 격자 결과를 쓴다.
const MAX_REFINED_CELLS: usize = 50_000;

/// [min, max] 를 n 개 격자선으로 나눈 위치. 안쪽 선만 offset 비율만큼 밀림.
fn grid_lines(min: f64, max: f64, n: usize, offset: f64) -> Vec<f64> {
    let d = (max - min) / (n - 1) as f64;
    (0..n)
        .map(|i| match i {
            0 => min,
            _ if i == n - 1 => max,
            _ => min + (i as f64 + offset) * d,
        })
        .collect()
}

/// 꼭짓점 부호가 같은 셀 안에서 f 가 0 에 닿을 여지가 있는지 (중심 평가 전 싼 사전 판정).
/// 꼭짓점 |f| 최솟값이 꼭짓점과 이웃 격자점 사이 변화량보다 작으면 한 칸 안에서 0 까지 갈 수 있다고 본다.
fn may_cross_inside(grid: &[Vec<Option<f64>>], ix: usize, iy: usize, v: &[f64; 4]) -> bool {
    let min_abs = v.iter().fold(f64::INFINITY, |m, c| m.min(c.abs()));
    let mut variation: f64 = 0.0;
    for (cx, cy) in [(ix, iy), (ix + 1, iy), (ix + 1, iy + 1), (ix, iy + 1)] {
        let Some(c) = grid[cx][cy] else { continue };
        for (nx, ny) in [(cx.wrapping_sub(1), cy), (cx + 1, cy), (cx, cy.wrapping_sub(1)), (cx, cy + 1)] {
            if let Some(Some(nv)) = grid.get(nx).and_then(|col| col.get(ny)) {
                variation = variation.max((c - nv).abs());
            }
        }
    }
    min_abs < variation
}

/// 극 판정 시 부호가 바뀌는 구간을 반으로 좁히는 횟수
const POLE_CHECK_BISECTIONS: usize = 6;

/// 변 a→b 위의 부호 변화(va, vb 부호가 다름)가 실제 근이 아니라 극(1/x 의 x=0, tan 의 π/2 등)을
/// 지나며 생긴 것인지 판정한다. 부호가 바뀌는 구간을 몇 번 반으로 좁혀 보면, 근이면 양 끝 |f| 가
/// 구간과 함께 작아지고 극이면 오히려 커진다(또는 도중에 정의되지 않음).
/// 극을 곡선으로 착각하면 marching squares 가 극을 따라 가짜 선을 그린다.
fn is_pole_crossing(f: &dyn Fn(f64, f64) -> f64, a: &Point, b: &Point, va: f64, vb: f64) -> bool {
    let start = va.abs().max(vb.abs());
    let (mut lo, mut flo, mut hi, mut fhi) = (0.0, va, 1.0, vb);
    for _ in 0..POLE_CHECK_BISECTIONS {
        let mid = 0.5 * (lo + hi);
        let Some(fm) = eval_cell(f, a.x + mid * (b.x - a.x), a.y + mid * (b.y - a.y)) else {
            return true;
        };
        if (fm >= 0.0) == (flo >= 0.0) {
            lo = mid;
            flo = fm;
        } else {
            hi = mid;
            fhi = fm;
        }
        // 근이면 한두 번 만에 절반 아래로 줄어듦 → 바로 판정 (극은 줄지 않고 커지기만 함)
        if flo.abs().max(fhi.abs()) < 0.5 * start {
            return false;
        }
    }
    flo.abs().max(fhi.abs()) > start
}

/// 한 셀(또는 하위 셀)에 marching squares 를 적용해 선분을 out 에 추가한다.
/// v = [bl, br, tr, tl] 꼭짓점 값.
fn march_cell(
    f: &dyn Fn(f64, f64) -> f64,
    x0: f64,
    x1: f64,
    y0: f64,
    y1: f64,
    v: [f64; 4],
    out: &mut Vec<(Point, Point)>,
) {
    let [v00, v10, v11, v01] = v;
    let sign = |v: f64| v >= 0.0;
    let idx = (sign(v00) as u8) | ((sign(v10) as u8) << 1) | ((sign(v11) as u8) << 2) | ((sign(v01) as u8) << 3);

    // 변의 양 끝 (시작점, 끝점, 시작값, 끝값). 이웃 셀과 같은 방향이라 공유 변의 판정·교차점이 같음
    let edge_ends = |e: u8| -> (Point, Point, f64, f64) {
        match e {
            0 => (Point { x: x0, y: y1 }, Point { x: x1, y: y1 }, v01, v11),
            1 => (Point { x: x1, y: y0 }, Point { x: x1, y: y1 }, v10, v11),
            2 => (Point { x: x0, y: y0 }, Point { x: x1, y: y0 }, v00, v10),
            _ => (Point { x: x0, y: y0 }, Point { x: x0, y: y1 }, v00, v01),
        }
    };
    let edge_points = |e: u8| -> Option<Point> {
        let (a, b, va, vb) = edge_ends(e);
        let t = lerp_zero(va, vb)?;
        if is_pole_crossing(f, &a, &b, va, vb) {
            return None;
        }
        Some(Point { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) })
    };

    let edges = if idx == 5 || idx == 10 {
        // 중심을 직접 평가하고, 정의되지 않으면 네 꼭짓점 평균으로 대체
        let center = eval_cell(f, (x0 + x1) / 2.0, (y0 + y1) / 2.0)
            .unwrap_or((v00 + v10 + v11 + v01) / 4.0);
        saddle_edges(idx, center >= 0.0)
    } else {
        MS_EDGES[idx as usize]
    };
    for seg in edges {
        if let (Some(p1), Some(p2)) = (edge_points(seg.0), edge_points(seg.1)) {
            // 꼭짓점이 정확히 곡선 위(f=0)면 두 끝점이 같은 길이 0 선분이 생김
            if !point_eq(&p1, &p2, SEGMENT_EPS) {
                out.push((p1, p2));
            }
        }
    }
}

/// 셀 하나를 k×k 하위 격자로 다시 평가한 값. values[a * (k + 1) + b] = f(xs[a], ys[b])
struct SubGrid {
    xs: Vec<f64>,
    ys: Vec<f64>,
    values: Vec<Option<f64>>,
}

impl SubGrid {
    fn new(f: &dyn Fn(f64, f64) -> f64, x0: f64, x1: f64, y0: f64, y1: f64) -> SubGrid {
        let k = REFINE_SUBDIVISIONS;
        // 양 끝은 셀 경계 값 그대로 써서, 이웃 셀의 하위 격자와 공유 변 위 점이 정확히 같게
        let line = |lo: f64, hi: f64| -> Vec<f64> {
            (0..=k).map(|i| if i == k { hi } else { lo + (hi - lo) * i as f64 / k as f64 }).collect()
        };
        let xs = line(x0, x1);
        let ys = line(y0, y1);
        let values = xs.iter().flat_map(|&x| ys.iter().map(move |&y| eval_cell(f, x, y))).collect();
        SubGrid { xs, ys, values }
    }

    fn at(&self, a: usize, b: usize) -> Option<f64> {
        self.values[a * (REFINE_SUBDIVISIONS + 1) + b]
    }

    /// 경계 변(0=top, 1=right, 2=bottom, 3=left) 위 하위 꼭짓점 사이에서 부호가 바뀌는지
    fn edge_has_crossing(&self, edge: u8) -> bool {
        let k = REFINE_SUBDIVISIONS;
        let along: Vec<Option<f64>> = (0..=k)
            .map(|i| match edge {
                0 => self.at(i, k),
                1 => self.at(k, i),
                2 => self.at(i, 0),
                _ => self.at(0, i),
            })
            .collect();
        along
            .windows(2)
            .any(|w| matches!((w[0], w[1]), (Some(p), Some(q)) if (p >= 0.0) != (q >= 0.0)))
    }

    fn march(&self, f: &dyn Fn(f64, f64) -> f64, out: &mut Vec<(Point, Point)>) {
        let k = REFINE_SUBDIVISIONS;
        for a in 0..k {
            for b in 0..k {
                let corners = (self.at(a, b), self.at(a + 1, b), self.at(a + 1, b + 1), self.at(a, b + 1));
                if let (Some(v00), Some(v10), Some(v11), Some(v01)) = corners {
                    march_cell(f, self.xs[a], self.xs[a + 1], self.ys[b], self.ys[b + 1], [v00, v10, v11, v01], out);
                }
            }
        }
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

    let bounds = [request.x_min, request.x_max, request.y_min, request.y_max];
    if !bounds.iter().all(|v| v.is_finite()) {
        return Err("x, y range must be finite".to_string());
    }
    if request.x_min >= request.x_max || request.y_min >= request.y_max {
        return Err("x_min < x_max and y_min < y_max required".to_string());
    }
    if request.grid_size < 2 {
        return Err("grid_size must be at least 2".to_string());
    }
    if request.grid_size > MAX_GRID_SIZE {
        return Err(format!("grid_size must be at most {}", MAX_GRID_SIZE));
    }

    let n = request.grid_size as usize;
    let cells = n - 1;
    let dx = (request.x_max - request.x_min) / cells as f64;
    let dy = (request.y_max - request.y_min) / cells as f64;
    let xs = grid_lines(request.x_min, request.x_max, n, GRID_OFFSET_X);
    let ys = grid_lines(request.y_min, request.y_max, n, GRID_OFFSET_Y);

    // Build value grid: grid[ix][iy] = f(xs[ix], ys[iy])
    let grid: Vec<Vec<Option<f64>>> = xs
        .iter()
        .map(|&x| ys.iter().map(|&y| eval_cell(&func, x, y)).collect())
        .collect();
    let corners = |ix: usize, iy: usize| -> Option<[f64; 4]> {
        Some([grid[ix][iy]?, grid[ix + 1][iy]?, grid[ix + 1][iy + 1]?, grid[ix][iy + 1]?])
    };

    // 1) 세분화 시작점: 꼭짓점 부호는 모두 같은데 셀 중심에서 부호가 바뀌는 셀
    //    (격자 한 칸보다 가는 띠 — |xy| = 0.1 의 축 근처 등. 기본 격자로는 통째로 놓침)
    let mut queue: Vec<(usize, usize)> = Vec::new();
    for ix in 0..cells {
        for iy in 0..cells {
            let Some(v) = corners(ix, iy) else { continue };
            let above = v[0] >= 0.0;
            if v.iter().any(|&c| (c >= 0.0) != above) || !may_cross_inside(&grid, ix, iy, &v) {
                continue;
            }
            let center = eval_cell(&func, (xs[ix] + xs[ix + 1]) / 2.0, (ys[iy] + ys[iy + 1]) / 2.0);
            if matches!(center, Some(c) if (c >= 0.0) != above) {
                queue.push((ix, iy));
            }
        }
    }

    // 2) 세분화한 셀의 경계 변에서 부호가 바뀌면 그 너머 이웃도 세분화.
    //    공유 변 위의 교차점을 양쪽 셀이 같은 하위 격자로 계산해야 곡선이 이어진다.
    let mut seen: HashSet<(usize, usize)> = queue.iter().copied().collect();
    let mut refined: HashMap<(usize, usize), SubGrid> = HashMap::new();
    while let Some((ix, iy)) = queue.pop() {
        if seen.len() > MAX_REFINED_CELLS {
            refined.clear(); // 계산량 폭주 → 세분화 없이 기본 격자 결과 사용
            break;
        }
        let sub = SubGrid::new(&func, xs[ix], xs[ix + 1], ys[iy], ys[iy + 1]);
        let neighbors = [
            (0, iy + 1 < cells, (ix, iy + 1)),        // top
            (1, ix + 1 < cells, (ix + 1, iy)),        // right
            (2, iy > 0, (ix, iy.wrapping_sub(1))),    // bottom
            (3, ix > 0, (ix.wrapping_sub(1), iy)),    // left
        ];
        for (edge, exists, neighbor) in neighbors {
            if exists && sub.edge_has_crossing(edge) && seen.insert(neighbor) {
                queue.push(neighbor);
            }
        }
        refined.insert((ix, iy), sub);
    }

    // 3) Marching squares: 세분화한 셀은 하위 격자로, 나머지는 기본 격자로
    let mut segments: Vec<(Point, Point)> = Vec::new();
    for ix in 0..cells {
        for iy in 0..cells {
            if let Some(sub) = refined.get(&(ix, iy)) {
                sub.march(&func, &mut segments);
            } else if let Some(v) = corners(ix, iy) {
                march_cell(&func, xs[ix], xs[ix + 1], ys[iy], ys[iy + 1], v, &mut segments);
            }
        }
    }

    // Connect segments into polylines
    // 끝점 비교 단위: 셀 크기의 백만분의 일 (같은 공유 변 위의 점은 비트 단위로 같고,
    // 꼭짓점(t=0/1)에서 생기는 반올림 차이만 흡수하면 됨)
    let curves = connect_segments(segments, dx.min(dy) * 1e-6);
    Ok(curves)
}

/// 선분 끝점을 같은 점으로 볼 허용 오차
const SEGMENT_EPS: f64 = 1e-10;

fn point_eq(a: &Point, b: &Point, eps: f64) -> bool {
    (a.x - b.x).abs() < eps && (a.y - b.y).abs() < eps
}

/// 끝점을 quantum 단위로 양자화한 해시 키
type PointKey = (i64, i64);

fn point_key(p: &Point, quantum: f64) -> PointKey {
    ((p.x / quantum).round() as i64, (p.y / quantum).round() as i64)
}

/// 선분들을 끝점이 같은 것끼리 이어 폴리라인(닫힌 곡선은 첫 점 = 마지막 점)으로 만든다.
/// 끝점 키 → 선분 목록 해시맵으로 다음 선분을 찾으므로 O(n). (기존: 매번 전체 선형 탐색 O(n²))
fn connect_segments(segments: Vec<(Point, Point)>, quantum: f64) -> Vec<Vec<Point>> {
    let keys: Vec<(PointKey, PointKey)> = segments
        .iter()
        .map(|(a, b)| (point_key(a, quantum), point_key(b, quantum)))
        .collect();
    let mut by_point: HashMap<PointKey, Vec<usize>> = HashMap::with_capacity(segments.len() * 2);
    for (i, (ka, kb)) in keys.iter().enumerate() {
        by_point.entry(*ka).or_default().push(i);
        by_point.entry(*kb).or_default().push(i);
    }
    let mut used = vec![false; segments.len()];

    // key 에 닿은 아직 안 쓴 선분 하나를 쓰고, 그 선분의 반대쪽 끝점과 키를 반환
    let take_next = |key: PointKey, used: &mut Vec<bool>| -> Option<(Point, PointKey)> {
        let idx = *by_point.get(&key)?.iter().find(|&&i| !used[i])?;
        used[idx] = true;
        let (ka, kb) = keys[idx];
        let (a, b) = &segments[idx];
        Some(if ka == key { (b.clone(), kb) } else { (a.clone(), ka) })
    };

    let mut curves: Vec<Vec<Point>> = Vec::new();
    for start in 0..segments.len() {
        if used[start] {
            continue;
        }
        used[start] = true;
        let (a, b) = &segments[start];
        let (mut head, mut tail) = keys[start];
        let mut curve = VecDeque::from([a.clone(), b.clone()]);
        while let Some((p, key)) = take_next(tail, &mut used) {
            curve.push_back(p);
            tail = key;
        }
        while let Some((p, key)) = take_next(head, &mut used) {
            curve.push_front(p);
            head = key;
        }
        curves.push(curve.into());
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

    /// 모든 구간의 점을 이어 붙인 목록
    fn points(request: GraphRequest) -> Vec<Point> {
        calculate_graph(request).unwrap().into_iter().flatten().collect()
    }

    /// 구간별 (첫 x, 마지막 x)
    fn piece_ranges(formula: &str, x_min: f64, x_max: f64, step: f64) -> Vec<(f64, f64)> {
        calculate_graph(req(formula, x_min, x_max, step))
            .unwrap()
            .iter()
            .map(|piece| (piece[0].x, piece[piece.len() - 1].x))
            .collect()
    }

    #[test]
    fn test_mod() {
        assert_eq!(mod_fn(7.0, 3.0), 1.0);
        assert_eq!(mod_fn(-7.0, 3.0), 2.0);
        assert_eq!(mod_fn(7.0, -3.0), -2.0);
        assert_eq!(mod_fn(7.5, 2.0), 1.5);
        assert_eq!(mod_fn(6.0, 3.0), 0.0);
        assert!(mod_fn(1.0, 0.0).is_nan());
        // y = mod(x, 2): 톱니 모양, x = -2, 0, 2 에서 점프 → 4 구간 (불연속 판정으로 세로선 없음)
        assert_eq!(piece_ranges("mod(x, 2)", -3.9, 3.9, 0.01).len(), 4);
        // 인자 개수가 틀리면 오류
        assert!(calculate_graph(req("mod(x)", 0.0, 1.0, 0.1)).is_err());
    }

    #[test]
    fn test_samples_without_accumulated_error() {
        // 0.1 을 10번 더하면 0.9999999999999999 → 이제 i*step 으로 계산하고 끝은 x_max
        let xs: Vec<f64> = points(req("x", 0.0, 1.0, 0.1)).iter().map(|p| p.x).collect();
        assert_eq!(xs.len(), 11);
        assert_eq!(xs[10], 1.0);
        assert!((xs[3] - 0.3).abs() < 1e-15);
    }

    #[test]
    fn test_last_sample_is_x_max_when_not_divisible() {
        let xs: Vec<f64> = points(req("x", 0.0, 1.0, 0.3)).iter().map(|p| p.x).collect();
        assert_eq!(xs.len(), 5);
        assert!((xs[3] - 0.9).abs() < 1e-15);
        assert_eq!(xs[4], 1.0);
    }

    #[test]
    fn test_too_many_samples_rejected() {
        let r = calculate_graph(req("x", -1e9, 1e9, 0.01));
        assert!(r.unwrap_err().contains("Too many points"));
        // 상한 바로 아래는 허용
        let n = MAX_GRAPH_SAMPLES as f64;
        assert!(calculate_graph(req("x", 0.0, n, 1.0)).is_ok());
    }

    #[test]
    fn test_non_finite_inputs_rejected() {
        assert!(calculate_graph(req("x", f64::NEG_INFINITY, 0.0, 0.1)).is_err());
        assert!(calculate_graph(req("x", 0.0, 1.0, f64::NAN)).is_err());
        assert!(calculate_graph(req("x", 0.0, 1.0, f64::INFINITY)).is_err());
    }

    #[test]
    fn test_pole_splits_curve() {
        // 1/x: x=0 양쪽을 잇지 않음 (x=0 을 샘플하든 안 하든)
        for (x_min, step) in [(-1.0, 0.004), (-1.0, 0.003), (-1.0, 0.5)] {
            let pieces = piece_ranges("1/x", x_min, 1.0, step);
            assert_eq!(pieces.len(), 2, "step {}: {:?}", step, pieces);
            assert!(pieces[0].1 < 0.0 && pieces[1].0 > 0.0, "step {}: {:?}", step, pieces);
        }
        // 대칭 점근선 1/x² 도 분리 (양쪽 샘플 값이 같아도)
        assert_eq!(piece_ranges("1/x^2", -1.0, 1.0, 0.004).len(), 2);
        // tan(x): [-5, 5] 에 ±π/2, ±3π/2 네 개의 점근선 → 5 구간
        assert_eq!(piece_ranges("tan(x)", -5.0, 5.0, 0.02).len(), 5);
    }

    #[test]
    fn test_step_function_splits_at_jumps() {
        // floor(x): -2, -1, 0, 1, 2 에서 점프 → 6 구간
        assert_eq!(piece_ranges("floor(x)", -2.5, 2.5, 0.04).len(), 6);
    }

    #[test]
    fn test_undefined_region_splits_curve() {
        // sqrt(x^2-1): (-1, 1) 에서 정의되지 않음 → 양쪽 2 구간, 가운데를 잇지 않음
        let pieces = piece_ranges("sqrt(x^2-1)", -3.0, 3.0, 0.01);
        assert_eq!(pieces.len(), 2, "{:?}", pieces);
        assert!(pieces[0].1 <= -1.0 && pieces[1].0 >= 1.0, "{:?}", pieces);
    }

    #[test]
    fn test_continuous_functions_stay_in_one_piece() {
        for f in ["sin(x)", "x^3", "exp(x)", "tanh(50*x)", "sin(x)^2+cos(x)^2", "cos(x)", "abs(x)"] {
            assert_eq!(piece_ranges(f, -5.0, 5.0, 0.02).len(), 1, "{} split unexpectedly", f);
        }
        // 대칭 샘플 (x = ±0.04) 사이에 극값이 있어도 이어짐
        assert_eq!(piece_ranges("cos(x)", -1.0, 1.0, 0.04).len(), 1);
    }

    #[test]
    fn test_removable_singularity_stays_connected() {
        // sin(x)/x: x=0 샘플만 NaN → 양옆이 이어지므로 한 구간
        let pieces = piece_ranges("sin(x)/x", -5.0, 5.0, 0.04);
        assert_eq!(pieces.len(), 1, "{:?}", pieces);
    }

    #[test]
    fn test_linear() {
        let pts = points(req("x", 0.0, 2.0, 1.0));
        assert_eq!(pts.len(), 3);
        assert!((pts[0].y - 0.0).abs() < 1e-10);
        assert!((pts[1].y - 1.0).abs() < 1e-10);
        assert!((pts[2].y - 2.0).abs() < 1e-10);
    }

    #[test]
    fn test_quadratic() {
        let pts = points(req("x^2", -1.0, 1.0, 1.0));
        assert_eq!(pts.len(), 3);
        assert!((pts[0].y - 1.0).abs() < 1e-10);
        assert!((pts[1].y - 0.0).abs() < 1e-10);
        assert!((pts[2].y - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_sin() {
        let pts = points(req("sin(x)", 0.0, 0.01, 0.01));
        assert!(!pts.is_empty());
        assert!((pts[0].y - 0.0).abs() < 1e-10);
    }

    #[test]
    fn test_log10() {
        let pts = points(req("log(x)", 10.0, 10.01, 0.01));
        assert!(!pts.is_empty());
        assert!((pts[0].y - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_y_prefix_stripped() {
        let pts = points(req("y = x", 1.0, 1.01, 0.01));
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
        let pts = points(req("1/x", -1.0, 1.0, 0.5));
        // x=-1, -0.5, 0, 0.5, 1 -> 0 gives inf, filtered
        assert!(pts.len() < 5);
        assert!(pts.iter().all(|p| p.y.is_finite()));
    }

    #[test]
    fn test_tan() {
        // tan(0) = 0
        let pts = points(req("tan(x)", 0.0, 0.01, 0.01));
        assert!(!pts.is_empty());
        assert!((pts[0].y - 0.0).abs() < 1e-10);
    }

    #[test]
    fn test_asin() {
        // asin(0) = 0
        let pts = points(req("asin(x)", 0.0, 0.01, 0.01));
        assert!(!pts.is_empty());
        assert!((pts[0].y - 0.0).abs() < 1e-10);
    }

    #[test]
    fn test_acos() {
        // acos(0) = pi/2
        let pts = points(req("acos(x)", 0.0, 0.01, 0.01));
        assert!(!pts.is_empty());
        let expected = std::f64::consts::FRAC_PI_2;
        assert!((pts[0].y - expected).abs() < 1e-10);
    }

    #[test]
    fn test_atan() {
        // atan(0) = 0
        let pts = points(req("atan(x)", 0.0, 0.01, 0.01));
        assert!(!pts.is_empty());
        assert!((pts[0].y - 0.0).abs() < 1e-10);
    }

    #[test]
    fn test_sinh_cosh_tanh() {
        // sinh(0)=0, cosh(0)=1, tanh(0)=0
        let pts = points(req("sinh(x)", 0.0, 0.01, 0.01));
        assert!(!pts.is_empty());
        assert!((pts[0].y - 0.0).abs() < 1e-10);

        let pts = points(req("cosh(x)", 0.0, 0.01, 0.01));
        assert!(!pts.is_empty());
        assert!((pts[0].y - 1.0).abs() < 1e-10);

        let pts = points(req("tanh(x)", 0.0, 0.01, 0.01));
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
    fn test_closed_curves_are_closed() {
        // 원은 곡선 하나, 첫 점 = 마지막 점. sin(3x)sin(3y) 의 안쪽 칸들도 각각 닫힌 곡선
        let circle = calculate_implicit(imp_req("x^2 + y^2 - 1", -2.0, 2.0, -2.0, 2.0, 50)).unwrap();
        assert_eq!(circle.len(), 1);
        let c = &circle[0];
        assert!(point_eq(&c[0], &c[c.len() - 1], 1e-9), "circle not closed");

        let cells = calculate_implicit(imp_req("sin(3*x)*sin(3*y)+0.5", -2.03, 1.97, -2.03, 1.97, 80)).unwrap();
        for curve in &cells {
            let (a, b) = (&curve[0], &curve[curve.len() - 1]);
            let inside = |p: &Point| p.x > -2.0 && p.x < 1.9 && p.y > -2.0 && p.y < 1.9;
            if inside(a) && inside(b) {
                assert!(point_eq(a, b, 1e-9), "interior curve not closed: {:?} .. {:?}", a, b);
            }
        }
    }

    #[test]
    fn test_grid_lines_avoid_symmetric_vertices() {
        let xs = grid_lines(-10.0, 10.0, 241, GRID_OFFSET_X);
        let ys = grid_lines(-10.0, 10.0, 241, GRID_OFFSET_Y);
        // 양 끝은 범위 경계 그대로
        assert_eq!((xs[0], xs[240]), (-10.0, 10.0));
        assert_eq!((ys[0], ys[240]), (-10.0, 10.0));
        // 안쪽 꼭짓점이 x = 0, x = ±y 위에 놓이지 않음 (끝점끼리 만나는 모서리 제외)
        for &x in &xs[1..240] {
            assert!(x.abs() > 1e-6);
            for &y in &ys[1..240] {
                assert!((x - y).abs() > 1e-6 && (x + y).abs() > 1e-6, "vertex on diagonal: ({}, {})", x, y);
            }
        }
    }

    #[test]
    fn test_thin_band_is_refined() {
        // |xy| = 0.1: 축 근처에서 두 가지 사이 간격(0.2/|x|)이 격자 한 칸(0.1)보다 좁아짐.
        // 예전엔 |x|≈2 에서 두 가지가 축을 가로지르는 선으로 이어지고 그 바깥은 사라졌음.
        let r = 24.0;
        let curves = calculate_implicit(imp_req("abs(x*y)-0.1", -r, r, -r, r, 480)).unwrap();
        assert_eq!(curves.len(), 4, "one curve per quadrant, got {}", curves.len());
        let points: Vec<&Point> = curves.iter().flatten().collect();
        // 네 방향 모두 범위 끝까지 그려짐
        assert!(points.iter().any(|p| p.x > r - 0.5) && points.iter().any(|p| p.x < -(r - 0.5)));
        assert!(points.iter().any(|p| p.y > r - 0.5) && points.iter().any(|p| p.y < -(r - 0.5)));
        // 모든 점이 실제 곡선에서 하위 셀 크기(0.1 / 4) 이내
        for p in points {
            let distance = ((p.x * p.y).abs() - 0.1).abs() / p.x.hypot(p.y);
            assert!(distance < 0.025, "point ({}, {}) is {} away from |xy| = 0.1", p.x, p.y, distance);
        }
    }

    #[test]
    fn test_crossing_lines_on_symmetric_range() {
        // 대칭 범위: 예전엔 원점 셀의 네 꼭짓점이 모두 f = 0 이라 교차점에 틈이 생김 (곡선 3개)
        let curves = calculate_implicit(imp_req("(x^(2)-y^(2))-(0)", -16.0, 16.0, -16.0, 16.0, 320)).unwrap();
        assert_eq!(curves.len(), 2, "expected 2 curves, got {}", curves.len());
        let length: f64 = curves
            .iter()
            .flat_map(|c| c.windows(2))
            .map(|w| (w[1].x - w[0].x).hypot(w[1].y - w[0].y))
            .sum();
        let diagonals = 2.0 * 32.0 * 2f64.sqrt();
        assert!((length - diagonals).abs() < 0.2, "drawn length {} vs {}", length, diagonals);
    }

    #[test]
    fn test_poles_do_not_draw_false_lines() {
        use std::f64::consts::{FRAC_PI_2, PI};
        // (식, 실제 곡선이 지나갈 수 없는 위치) — 예전엔 극을 따라 세로선이 그려졌음 (240 / 960 / 220 점)
        let cases: [(&str, &dyn Fn(f64, f64) -> bool); 3] = [
            ("((1)/(x))-(y)", &|x, _| x.abs() < 0.1), // 1/x = y: |y| ≤ 6 이면 |x| ≥ 1/6
            ("(tan(x))-(y)", &|x, _| {
                let d = (x - FRAC_PI_2).rem_euclid(PI);
                d.min(PI - d) < 0.1 // 극에서 0.16 이상 떨어져 있어야 함
            }),
            ("((1)/(x)+(1)/(y))-(1)", &|x, y| x.abs() < 0.03 && y.abs() > 0.5), // y = x/(x-1)
        ];
        for (formula, impossible) in cases {
            let curves = calculate_implicit(imp_req(formula, -6.0, 6.0, -6.0, 6.0, 240)).unwrap();
            let bad: Vec<&Point> = curves.iter().flatten().filter(|p| impossible(p.x, p.y)).collect();
            assert!(bad.is_empty(), "{}: {} points on a pole, e.g. {:?}", formula, bad.len(), bad.first());
            // 실제 곡선은 남아 있어야 함
            assert!(curves.iter().map(|c| c.len()).sum::<usize>() > 100, "{}: curve disappeared", formula);
        }
    }

    #[test]
    fn test_steep_roots_are_kept() {
        // 근 근처에서 크게 휘는 식도 극으로 오판하지 않음: y = sqrt(x) (x ≥ 0), y = x^3
        let r = calculate_implicit(imp_req("y-sqrt(x)", -1.0, 4.0, -1.0, 3.0, 100)).unwrap();
        assert_eq!(r.len(), 1);
        let reach = r[0].iter().map(|p| p.x).fold(f64::MIN, f64::max);
        assert!(reach > 3.9, "sqrt curve stops at x = {}", reach);
        let cubic = calculate_implicit(imp_req("y-x^3", -2.0, 2.0, -8.0, 8.0, 100)).unwrap();
        assert_eq!(cubic.len(), 1);
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
    fn test_implicit_grid_and_bounds_limits() {
        assert!(calculate_implicit(imp_req("x+y", -1.0, 1.0, -1.0, 1.0, MAX_GRID_SIZE)).is_ok());
        let r = calculate_implicit(imp_req("x+y", -1.0, 1.0, -1.0, 1.0, MAX_GRID_SIZE + 1));
        assert!(r.unwrap_err().contains("at most"));
        assert!(calculate_implicit(imp_req("x+y", f64::NAN, 1.0, -1.0, 1.0, 20)).is_err());
    }

    #[test]
    fn test_implicit_invalid_bounds() {
        let r = calculate_implicit(imp_req("x+y", 1.0, -1.0, -1.0, 1.0, 20));
        assert!(r.is_err());
    }
}
