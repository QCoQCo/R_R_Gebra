import { invoke } from '@tauri-apps/api/core';

export interface Point {
  x: number;
  y: number;
}

export interface GraphRequest {
  formula: string;
  x_min: number;
  x_max: number;
  step: number;
}

export interface ImplicitRequest {
  formula: string;
  x_min: number;
  x_max: number;
  y_min: number;
  y_max: number;
  grid_size: number;
}

/** y=f(x) 샘플링. 점근선·정의되지 않는 구간에서 끊긴 연속 구간 목록을 반환 */
export async function calculateGraph(
  request: GraphRequest
): Promise<Point[][]> {
  return invoke<Point[][]>('calculate_graph', { request });
}

/** f(x, y) = 0 등고선 (marching squares). 곡선별 점 목록을 반환 */
export async function calculateImplicit(
  request: ImplicitRequest
): Promise<Point[][]> {
  return invoke<Point[][]>('calculate_implicit', { request });
}
