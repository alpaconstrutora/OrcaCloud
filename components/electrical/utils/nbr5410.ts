export type RoomTypology = 'banheiro' | 'cozinha' | 'sala_quarto' | 'varanda' | 'outros';

export interface RoomLoadRequirement {
  lightingVA: number;
  receptaclesCount: number;
  receptaclesVA: number[]; // e.g. [600, 600, 600, 100]
}

export function calculateLighting(area: number): number {
  if (area <= 0) return 0;
  if (area <= 6) return 100;
  return 100 + Math.floor((area - 6) / 4) * 60;
}

export function calculateReceptacles(area: number, perimeter: number, typology: RoomTypology): { count: number, vaList: number[] } {
  let count = 0;
  
  switch (typology) {
    case 'banheiro':
      count = 1;
      break;
    case 'cozinha':
      count = Math.max(1, Math.ceil(perimeter / 3.5));
      break;
    case 'sala_quarto':
      count = Math.max(1, Math.ceil(perimeter / 5.0));
      break;
    case 'varanda':
      count = 1;
      break;
    case 'outros':
      if (area <= 2.25) count = 1;
      else if (area <= 6) count = 1;
      else count = Math.max(1, Math.ceil(perimeter / 5.0));
      break;
  }

  const vaList: number[] = [];
  if (typology === 'banheiro' || typology === 'cozinha') {
    for (let i = 0; i < count; i++) {
      if (i < 3) vaList.push(600);
      else vaList.push(100);
    }
  } else {
    for (let i = 0; i < count; i++) {
      vaList.push(100);
    }
  }

  return { count, vaList };
}

export function getRoomRequirements(area: number, perimeter: number, typology: RoomTypology): RoomLoadRequirement {
  const lightingVA = calculateLighting(area);
  const { count, vaList } = calculateReceptacles(area, perimeter, typology);
  
  return {
    lightingVA,
    receptaclesCount: count,
    receptaclesVA: vaList
  };
}

export function getPolygonCentroid(pts: number[]): { x: number, y: number } {
  let area = 0, x = 0, y = 0;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const pt1x = pts[i], pt1y = pts[i + 1];
    const pt2x = pts[j], pt2y = pts[j + 1];
    const f = pt1x * pt2y - pt2x * pt1y;
    x += (pt1x + pt2x) * f;
    y += (pt1y + pt2y) * f;
    area += f * 3;
  }
  if (area === 0) {
    // fallback if non-simple or something
    let sumX = 0, sumY = 0;
    for (let i = 0; i < pts.length; i += 2) {
      sumX += pts[i];
      sumY += pts[i+1];
    }
    const len = pts.length / 2;
    return { x: sumX / len, y: sumY / len };
  }
  return { x: x / area, y: y / area };
}

/**
 * Distributes a given number of points evenly along a polygon's perimeter.
 */
export function distributePointsOnPolygon(pts: number[], quantity: number): Array<{x: number, y: number}> {
  if (quantity <= 0) return [];
  if (pts.length < 4) return [];

  // Calculate segment lengths
  let totalLength = 0;
  const segments: Array<{ x1: number, y1: number, x2: number, y2: number, length: number }> = [];
  
  for (let i = 0; i < pts.length - 2; i += 2) {
    const x1 = pts[i], y1 = pts[i+1];
    const x2 = pts[i+2], y2 = pts[i+3];
    const len = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    segments.push({ x1, y1, x2, y2, length: len });
    totalLength += len;
  }
  // Add closing segment
  const startX = pts[0], startY = pts[1];
  const endX = pts[pts.length - 2], endY = pts[pts.length - 1];
  const closeLen = Math.sqrt(Math.pow(startX - endX, 2) + Math.pow(startY - endY, 2));
  if (closeLen > 0) {
    segments.push({ x1: endX, y1: endY, x2: startX, y2: startY, length: closeLen });
    totalLength += closeLen;
  }

  const result: Array<{x: number, y: number}> = [];
  const spacing = totalLength / quantity;
  
  let currentSegment = 0;
  let distanceAlongSegment = 0;
  let currentDist = spacing / 2; // start with half spacing offset

  for (let i = 0; i < quantity; i++) {
    while (currentSegment < segments.length && distanceAlongSegment + segments[currentSegment].length < currentDist) {
      distanceAlongSegment += segments[currentSegment].length;
      currentSegment++;
    }
    
    if (currentSegment >= segments.length) break; // Float precision fallback

    const seg = segments[currentSegment];
    const remainingDist = currentDist - distanceAlongSegment;
    const ratio = remainingDist / seg.length;
    
    result.push({
      x: seg.x1 + (seg.x2 - seg.x1) * ratio,
      y: seg.y1 + (seg.y2 - seg.y1) * ratio
    });

    currentDist += spacing;
  }

  return result;
}
