export interface DisplayWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayLike {
  workArea: DisplayWorkArea;
}

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

/**
 * Checks if the window bounds intersect with any connected screen's workArea by at least 100x100 px.
 * If not (e.g. external display disconnected), centers the window on the primary display.
 */
export function clampWindowBounds(
  bounds: WindowBounds,
  displays: DisplayLike[],
  primaryDisplay?: DisplayLike
): WindowBounds {
  if (bounds.x === undefined || bounds.y === undefined || displays.length === 0) {
    return bounds;
  }

  const hasIntersection = displays.some((d) => {
    const wa = d.workArea;
    const interLeft = Math.max(bounds.x!, wa.x);
    const interRight = Math.min(bounds.x! + bounds.width, wa.x + wa.width);
    const interTop = Math.max(bounds.y!, wa.y);
    const interBottom = Math.min(bounds.y! + bounds.height, wa.y + wa.height);

    const interW = interRight - interLeft;
    const interH = interBottom - interTop;
    return interW >= 100 && interH >= 100;
  });

  if (hasIntersection) {
    return bounds;
  }

  const targetDisplay = primaryDisplay || displays[0];
  const wa = targetDisplay.workArea;

  const clampedX = Math.max(wa.x, Math.round(wa.x + (wa.width - bounds.width) / 2));
  const clampedY = Math.max(wa.y, Math.round(wa.y + (wa.height - bounds.height) / 2));

  return {
    x: clampedX,
    y: clampedY,
    width: bounds.width,
    height: bounds.height
  };
}
