import { Coordinates, usePaneContext, useTransformContext } from 'mafs';
import { axisLineInterval, formatAxisLabel } from '../utils/axisLineInterval';

/**
 * 현재 확대·이동 상태에 맞춰 눈금 간격을 고르는 좌표축. Mafs 안에서 렌더링해야 함.
 * viewTransform(단위당 픽셀, 사용자 줌 포함)을 직접 읽으므로 auto/manual 모드와
 * preserveAspectRatio='contain' 으로 넓어진 축까지 모두 반영된다.
 */
export function AdaptiveCoordinates() {
    const { viewTransform } = useTransformContext();
    const { xPaneRange, yPaneRange } = usePaneContext();

    // contain 이라 x·y 배율이 같음 → x 배율 하나로 두 축 공통 간격
    const pxPerUnit = Math.abs(viewTransform[0]);
    const maxAbsValue = Math.max(...xPaneRange.map(Math.abs), ...yPaneRange.map(Math.abs));
    const lines = axisLineInterval(pxPerUnit, maxAbsValue);

    // Mafs 기본 라벨과 같은 모양(음수 정렬용 숨은 '-')에 부동소수점 오차만 제거
    const label = (value: number) => (
        <>
            {formatAxisLabel(value, lines)}
            {value < 0 && <tspan visibility='hidden'>-</tspan>}
        </>
    );

    return (
        <Coordinates.Cartesian
            subdivisions={4}
            xAxis={{ lines, labels: label }}
            yAxis={{ lines, labels: label }}
        />
    );
}
