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

export async function calculateGraph(
  request: GraphRequest
): Promise<Point[]> {
  return invoke<Point[]>('calculate_graph', {
    request: {
      formula: request.formula,
      x_min: request.x_min,
      x_max: request.x_max,
      step: request.step,
    },
  });
}
