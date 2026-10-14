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
  return invoke<Point[][]>('calculate_graph', {
    request: {
      formula: request.formula,
      x_min: request.x_min,
      x_max: request.x_max,
      step: request.step,
    },
  });
}

export async function calculateImplicit(
  request: ImplicitRequest
): Promise<Point[][]> {
  return invoke<Point[][]>('calculate_implicit', {
    request: {
      formula: request.formula,
      x_min: request.x_min,
      x_max: request.x_max,
      y_min: request.y_min,
      y_max: request.y_max,
      grid_size: request.grid_size,
    },
  });
}
