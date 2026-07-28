import { OpuraElectricalWall, OpuraElectricalRoom } from '../../types/electrical';

const TOLERANCE = 5; // pixels for snapping endpoints

interface Point2D {
  x: number;
  y: number;
}

interface Segment {
  p1: Point2D;
  p2: Point2D;
}

// Distance squared between two points
function distSq(a: Point2D, b: Point2D) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

// Calculate signed area of polygon (shoelace formula)
// Positive area means counter-clockwise, negative means clockwise
function calculateSignedArea(points: Point2D[]) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return area / 2;
}

// Are two polygons similar? (same area, roughly same centroid)
export function arePolygonsSimilar(pts1: number[], pts2: number[]): boolean {
  if (!pts1 || !pts2 || pts1.length < 6 || pts2.length < 6) return false;
  
  const points1: Point2D[] = [];
  for (let i = 0; i < pts1.length; i += 2) points1.push({ x: pts1[i], y: pts1[i + 1] });
  
  const points2: Point2D[] = [];
  for (let i = 0; i < pts2.length; i += 2) points2.push({ x: pts2[i], y: pts2[i + 1] });
  
  const area1 = Math.abs(calculateSignedArea(points1));
  const area2 = Math.abs(calculateSignedArea(points2));
  
  // If areas are significantly different
  if (Math.abs(area1 - area2) > 100) return false;
  
  // Calculate centroids
  let cx1 = 0, cy1 = 0;
  for (const p of points1) { cx1 += p.x; cy1 += p.y; }
  cx1 /= points1.length; cy1 /= points1.length;

  let cx2 = 0, cy2 = 0;
  for (const p of points2) { cx2 += p.x; cy2 += p.y; }
  cx2 /= points2.length; cy2 /= points2.length;
  
  if (distSq({ x: cx1, y: cy1 }, { x: cx2, y: cy2 }) > TOLERANCE * TOLERANCE) return false;
  
  return true;
}

// Extracts all face polygons from a set of walls
export function extractFacesFromWalls(walls: OpuraElectricalWall[]): Point2D[][] {
  const segments: Segment[] = [];
  
  // 1. Extract all line segments from walls
  for (const wall of walls) {
    if (!wall.points || wall.points.length < 4) continue;
    const pts = wall.points as number[];
    for (let i = 0; i < pts.length - 2; i += 2) {
      segments.push({
        p1: { x: pts[i], y: pts[i+1] },
        p2: { x: pts[i+2], y: pts[i+3] }
      });
    }
  }

  if (segments.length === 0) return [];

  // 2. Extract unique vertices (merging close ones)
  const vertices: Point2D[] = [];
  
  const getVertexId = (p: Point2D) => {
    for (let i = 0; i < vertices.length; i++) {
      if (distSq(vertices[i], p) <= TOLERANCE * TOLERANCE) return i;
    }
    vertices.push(p);
    return vertices.length - 1;
  };

  // 3. Build adjacency list
  // adj[u] will hold a list of neighbors of u
  const adj: Map<number, Set<number>> = new Map();
  for (let i = 0; i < vertices.length; i++) adj.set(i, new Set());

  for (const seg of segments) {
    const u = getVertexId(seg.p1);
    const v = getVertexId(seg.p2);
    if (u !== v) {
      if (!adj.has(u)) adj.set(u, new Set());
      if (!adj.has(v)) adj.set(v, new Set());
      adj.get(u)!.add(v);
      adj.get(v)!.add(u);
    }
  }

  // If we have intersecting walls but no vertex at the intersection,
  // we would need to split segments. But for our architecture, 
  // users generally draw segments connecting at endpoints.
  // We'll proceed with endpoints only.

  // 4. Sort edges radially to find faces
  // For each vertex u, we sort its neighbors v by the angle of vector (u->v)
  const sortedAdj: Map<number, number[]> = new Map();
  
  for (const [u, neighbors] of Array.from(adj.entries())) {
    const pU = vertices[u];
    const neighborsList = Array.from(neighbors);
    neighborsList.sort((a, b) => {
      const pA = vertices[a];
      const pB = vertices[b];
      const angleA = Math.atan2(pA.y - pU.y, pA.x - pU.x);
      const angleB = Math.atan2(pB.y - pU.y, pB.x - pU.x);
      return angleA - angleB;
    });
    sortedAdj.set(u, neighborsList);
  }

  // 5. Traverse faces using Right-Hand Rule
  const visitedEdges = new Set<string>();
  const faces: Point2D[][] = [];

  for (const u of Array.from(sortedAdj.keys())) {
    const neighbors = sortedAdj.get(u)!;
    for (const v of neighbors) {
      const edgeKey = `${u}->${v}`;
      if (visitedEdges.has(edgeKey)) continue;

      // Start traversing a new face
      const face: number[] = [];
      let curr = u;
      let next = v;
      
      let isCycle = false;

      while (true) {
        face.push(curr);
        visitedEdges.add(`${curr}->${next}`);
        
        const nextNeighbors = sortedAdj.get(next)!;
        // Find the index of curr in next's sorted neighbors
        const incomingIdx = nextNeighbors.indexOf(curr);
        
        // The "next edge" of the face is the one immediately clockwise from the incoming edge.
        // Since atan2 goes -PI to PI, sorted counter-clockwise.
        // Clockwise is incomingIdx - 1
        let outgoingIdx = incomingIdx - 1;
        if (outgoingIdx < 0) outgoingIdx = nextNeighbors.length - 1;
        
        const nextNext = nextNeighbors[outgoingIdx];
        
        if (next === u && nextNext === v) {
          isCycle = true;
          break; // Closed the loop exactly
        }
        
        curr = next;
        next = nextNext;
        
        if (visitedEdges.has(`${curr}->${next}`)) {
          // Closed on a smaller loop or hit a visited edge incorrectly
          isCycle = true; 
          break;
        }
      }

      if (isCycle && face.length >= 3) {
        // Map back to points
        const facePoints = face.map(id => vertices[id]);
        const area = calculateSignedArea(facePoints);
        
        // A bounded inner face traversed in this manner will have a positive area
        // if the y-axis points down (canvas coordinates) and atan2 is used.
        // Wait, standard math: +area is CCW.
        // In canvas (y points down): +area is CW. 
        // Let's just collect all faces and filter out the "outer" boundary face 
        // which typically has a highly negative or highly positive area encompassing everything.
        // Actually, the outer face has the opposite sign to inner faces.
        // By checking if the area is > 0, we can filter out the outer face (if it's < 0).
        // Let's just accept positive area faces (assuming inner faces are CCW or CW consistently).
        
        if (area < -500) { // inner faces have negative area in canvas coordinates
          // Push closed loop points
          facePoints.push({ ...facePoints[0] });
          faces.push(facePoints);
        }
      }
    }
  }

  return faces;
}

// Check which of the newly found faces do not exist in the current rooms
export function detectNewRooms(
    walls: OpuraElectricalWall[], 
    existingRooms: OpuraElectricalRoom[]
): number[][] {
  const faces = extractFacesFromWalls(walls);
  const newRooms: number[][] = [];

  for (const face of faces) {
    const flatPoints: number[] = [];
    for (const p of face) {
      flatPoints.push(p.x, p.y);
    }
    
    // Check if this flatPoints array matches any existing room
    let exists = false;
    for (const room of existingRooms) {
      if (room.polygonPoints && arePolygonsSimilar(flatPoints, room.polygonPoints)) {
        exists = true;
        break;
      }
    }
    
    if (!exists) {
      newRooms.push(flatPoints);
    }
  }

  return newRooms;
}
