import React, { useState } from 'react';
import { RotateCcw, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

interface Props {
  buildingWidth?: number;
  buildingDepth?: number;
  unitsPerFloor?: number;
  privateAreaPerUnit?: number;
  terrainWidth?: number;
  terrainDepth?: number;
  leftSetback?: number;
  frontSetback?: number;
  isRotated?: boolean;
  minRightSetback?: number;
  minRearSetback?: number;
}

const COLORS = [
  '#fecaca', // red-200
  '#bbf7d0', // green-200
  '#bfdbfe', // blue-200
  '#fef08a', // yellow-200
  '#e9d5ff', // purple-200
  '#fed7aa', // orange-200
  '#a7f3d0', // emerald-200
  '#fbcfe8', // pink-200
];

export default function FloorPlanCanvas2D({ 
  buildingWidth = 20, 
  buildingDepth = 30, 
  unitsPerFloor = 4, 
  privateAreaPerUnit = 0,
  terrainWidth = 20,
  terrainDepth = 30,
  leftSetback = 0,
  frontSetback = 0,
  minRightSetback = 0,
  minRearSetback = 0,
  isRotated: initialRotated
}: Props) {
  // Auto-rotate if terrain is much deeper than it is wide
  const [isRotated, setIsRotated] = useState(
    initialRotated !== undefined ? initialRotated : terrainDepth > terrainWidth * 1.2
  );
  const rotAngle = isRotated ? -90 : 0;
  const counterRot = isRotated ? 90 : 0;

  // We draw in real meters, SVG viewBox will handle scaling
  const w = buildingWidth;
  const h = buildingDepth;
  const tW = terrainWidth;
  const tH = terrainDepth;
  
  // Use the exact leftSetback so the user sees the 1.5m they entered
  const lS = leftSetback; 
  const fS = frontSetback;
  
  // Remaining setbacks
  const rS = Math.max(0, tW - w - lS);
  const rearS = Math.max(0, tH - h - fS);

  // ViewBox padding (meters)
  const padding = Math.max(tW, tH) * 0.2;
  
  // Calculate bounding box center for rotation
  const cx = tW / 2;
  const cy = tH / 2;

  // The actual viewBox dimensions depend on whether we are rotated
  const viewW = isRotated ? tH + padding * 2 : tW + padding * 2;
  const viewH = isRotated ? tW + padding * 2 : tH + padding * 2;

  // Font sizes
  const minDim = Math.min(viewW, viewH);
  const fSizeLg = Math.max(1.5, minDim * 0.05);
  const fSizeMd = Math.max(1, minDim * 0.035);
  const fSizeSm = Math.max(0.8, minDim * 0.025);

  // Offset to center the rotated drawing in the viewBox
  const offX = viewW / 2;
  const offY = viewH / 2;

  // Grid Calculation
  let cols = 1;
  let rows = 1;

  if (unitsPerFloor > 1) {
    if (w >= h) {
      cols = Math.ceil(unitsPerFloor / 2);
      rows = 2;
    } else {
      rows = Math.ceil(unitsPerFloor / 2);
      cols = 2;
    }
  }

  // Draw units
  const units: React.ReactNode[] = [];
  let unitIndex = 0;
  
  const unitWidth = w / cols;
  const unitHeight = h / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (unitIndex >= unitsPerFloor) break;
      
      const x = c * unitWidth;
      const y = r * unitHeight;
      const color = COLORS[unitIndex % COLORS.length];

      units.push(
        <g key={`unit-${unitIndex}`}>
          <rect 
            x={x} 
            y={y} 
            width={unitWidth} 
            height={unitHeight} 
            fill={color} 
            fillOpacity={0.4}
            stroke={color.replace('200', '400')}
            strokeWidth={0.5}
          />
          {privateAreaPerUnit > 0 && (
            <g transform={`translate(${x + unitWidth / 2}, ${y + unitHeight / 2})`}>
              <text 
                transform={`rotate(${counterRot})`}
                textAnchor="middle" 
                dominantBaseline="middle" 
                fontSize={fSizeMd} 
                fontWeight="bold"
                fill="#4b5563"
              >
                {Math.round(privateAreaPerUnit)} m²
              </text>
            </g>
          )}
          <g transform={`translate(${x + 2}, ${y + (isRotated ? unitHeight - 2 : 4)})`}>
            <text 
               transform={`rotate(${counterRot})`}
               fontSize={fSizeSm} 
               fill="#6b7280"
               dominantBaseline={isRotated ? "auto" : "hanging"}
            >
               U-{unitIndex + 1}
            </text>
          </g>
        </g>
      );
      unitIndex++;
    }
  }

  // Draw Core (Circulation / Elevators)
  const coreWidth = w * 0.2; // 20% of width
  const coreHeight = h * 0.2; // 20% of height
  const coreX = (w - coreWidth) / 2;
  const coreY = (h - coreHeight) / 2;

  return (
    <div className="w-full h-full relative flex items-center justify-center p-0 overflow-hidden bg-gray-50 rounded-xl">
      <TransformWrapper
        initialScale={1}
        minScale={0.2}
        maxScale={10}
        centerOnInit={true}
        wheel={{ step: 0.1 }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            {/* Action Buttons Overlay */}
            <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
               <div className="flex bg-white shadow-sm border border-gray-200 rounded-lg p-1">
                 <button onClick={() => zoomIn()} className="p-1.5 hover:bg-gray-100 rounded text-gray-600 transition-colors" title="Aproximar">
                   <ZoomIn className="w-4 h-4" />
                 </button>
                 <button onClick={() => zoomOut()} className="p-1.5 hover:bg-gray-100 rounded text-gray-600 transition-colors" title="Afastar">
                   <ZoomOut className="w-4 h-4" />
                 </button>
                 <button onClick={() => resetTransform()} className="p-1.5 hover:bg-gray-100 rounded text-gray-600 transition-colors" title="Centralizar">
                   <Maximize className="w-4 h-4" />
                 </button>
               </div>
               
               <button 
                 onClick={() => setIsRotated(!isRotated)}
                 className="p-2 bg-white hover:bg-gray-100 rounded-lg text-gray-600 shadow-sm border border-gray-200 flex items-center justify-center gap-2 text-sm font-medium transition-colors"
                 title="Girar Planta"
               >
                 <RotateCcw className="w-4 h-4" />
               </button>
            </div>

            <TransformComponent 
              wrapperStyle={{ width: "100%", height: "100%" }} 
              contentStyle={{ width: "100%", height: "100%", display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg width="100%" height="100%" viewBox={`0 0 ${viewW} ${viewH}`} style={{ maxWidth: '85vw', maxHeight: '85vh', fontFamily: 'inherit' }}>
                <g transform={`translate(${offX}, ${offY}) rotate(${rotAngle}) translate(${-cx}, ${-cy})`}>
                  
                  {/* Terrain Footprint Outline */}
                  <rect 
                    x={0} 
                    y={0} 
                    width={tW} 
                    height={tH} 
                    fill="#f3f4f6" 
                    stroke="#9ca3af" 
                    strokeWidth="0.5" 
                    strokeDasharray={`${minDim * 0.05} ${minDim * 0.05}`}
                  />
                  
                  <g transform={`translate(${tW}, ${tH + fSizeSm})`}>
                    <text transform={`rotate(${counterRot})`} textAnchor={isRotated ? "start" : "end"} fontSize={fSizeSm} fill="#9ca3af" fontWeight="bold">
                      LIMITES DO LOTE
                    </text>
                  </g>

                  {/* Terrain Dimensions */}
                  <g transform={`translate(${tW / 2}, -${padding * 0.4})`}>
                    <text transform={`rotate(${counterRot})`} textAnchor="middle" fontSize={fSizeLg} fill="#6b7280" fontWeight="bold">
                      RUA ({terrainWidth.toFixed(1)}m)
                    </text>
                  </g>
                  
                  <g transform={`translate(-${padding * 0.4}, ${tH / 2})`}>
                    <text transform={`rotate(${counterRot})`} textAnchor="middle" fontSize={fSizeLg} fill="#6b7280">
                      {terrainDepth.toFixed(1)}m
                    </text>
                  </g>

                  {/* Afastamentos (Setbacks) Indicators */}
                  {lS > 0 && (
                    <g>
                      {/* Left setback line at 20% of building depth */}
                      <line x1={0} y1={fS + h * 0.2} x2={lS} y2={fS + h * 0.2} stroke="#6b7280" strokeWidth="0.5" strokeDasharray="1 1" />
                      <g transform={`translate(${lS / 2}, ${fS + h * 0.2})`}>
                        <text transform={`rotate(${counterRot})`} textAnchor="middle" dominantBaseline="middle" fontSize={fSizeSm} fill="#4b5563" fontWeight="bold" stroke="white" strokeWidth="0.5" paintOrder="stroke fill" strokeLinejoin="round">
                          {lS.toFixed(1)}m
                        </text>
                      </g>
                    </g>
                  )}
                  {rS > 0 && (
                    <g>
                      {/* Right setback line at 80% of building depth */}
                      <line x1={lS + w} y1={fS + h * 0.8} x2={tW} y2={fS + h * 0.8} stroke="#6b7280" strokeWidth="0.5" strokeDasharray="1 1" />
                      <g transform={`translate(${lS + w + rS / 2}, ${fS + h * 0.8})`}>
                        <text transform={`rotate(${counterRot})`} textAnchor="middle" dominantBaseline="middle" fontSize={fSizeSm} fill="#4b5563" fontWeight="bold" stroke="white" strokeWidth="0.5" paintOrder="stroke fill" strokeLinejoin="round">
                          {rS.toFixed(1)}m {rS > minRightSetback && `(Min: ${minRightSetback}m)`}
                        </text>
                      </g>
                    </g>
                  )}
                  {fS > 0 && (
                    <g>
                      {/* Front setback line at 20% of building width */}
                      <line x1={lS + w * 0.2} y1={0} x2={lS + w * 0.2} y2={fS} stroke="#6b7280" strokeWidth="0.5" strokeDasharray="1 1" />
                      <g transform={`translate(${lS + w * 0.2}, ${fS / 2})`}>
                        <text transform={`rotate(${counterRot})`} textAnchor="middle" dominantBaseline="middle" fontSize={fSizeSm} fill="#4b5563" fontWeight="bold" stroke="white" strokeWidth="0.5" paintOrder="stroke fill" strokeLinejoin="round">
                          {fS.toFixed(1)}m
                        </text>
                      </g>
                    </g>
                  )}
                  {rearS > 0 && (
                    <g>
                      {/* Rear setback line at 80% of building width */}
                      <line x1={lS + w * 0.8} y1={fS + h} x2={lS + w * 0.8} y2={tH} stroke="#6b7280" strokeWidth="0.5" strokeDasharray="1 1" />
                      <g transform={`translate(${lS + w * 0.8}, ${fS + h + rearS / 2})`}>
                        <text transform={`rotate(${counterRot})`} textAnchor="middle" dominantBaseline="middle" fontSize={fSizeSm} fill="#4b5563" fontWeight="bold" stroke="white" strokeWidth="0.5" paintOrder="stroke fill" strokeLinejoin="round">
                          {rearS.toFixed(1)}m {rearS > minRearSetback && `(Min: ${minRearSetback}m)`}
                        </text>
                      </g>
                    </g>
                  )}

                  {/* Maximum Envelope (Área Edificável) */}
                  <rect 
                    x={leftSetback} 
                    y={frontSetback} 
                    width={tW - leftSetback - minRightSetback} 
                    height={tH - frontSetback - minRearSetback} 
                    fill="rgba(239, 68, 68, 0.05)" 
                    stroke="#ef4444" 
                    strokeWidth="0.5" 
                    strokeDasharray="2 2" 
                  />

                  {/* Building Group */}
                  <g transform={`translate(${lS}, ${fS})`}>
                    {/* Main Footprint Outline */}
                    <rect 
                      x={0} 
                      y={0} 
                      width={w} 
                      height={h} 
                      fill="none" 
                      stroke="#9ca3af" 
                      strokeWidth="1" 
                    />
                    
                    {/* Units */}
                    {units}

                    {/* Core */}
                    <rect 
                      x={coreX} 
                      y={coreY} 
                      width={coreWidth} 
                      height={coreHeight} 
                      fill="#e5e7eb" 
                      stroke="#9ca3af" 
                      strokeWidth="0.5"
                    />
                    <g transform={`translate(${w / 2}, ${h / 2})`}>
                      <text 
                        transform={`rotate(${counterRot})`}
                        textAnchor="middle" 
                        dominantBaseline="middle" 
                        fontSize={fSizeMd} 
                        fill="#6b7280"
                        fontWeight="bold"
                      >
                        HALL
                      </text>
                    </g>
                    
                    {/* Dimensions */}
                    <g transform={`translate(${w / 2}, ${h + fSizeLg})`}>
                      <text transform={`rotate(${counterRot})`} textAnchor="middle" dominantBaseline="middle" fontSize={fSizeLg} fill="#4f46e5" fontWeight="bold" stroke="white" strokeWidth="0.8" paintOrder="stroke fill" strokeLinejoin="round">
                        {buildingWidth.toFixed(1)}m
                      </text>
                    </g>
                    
                    <g transform={`translate(${w + fSizeLg}, ${h / 2})`}>
                      <text transform={`rotate(${counterRot})`} textAnchor="middle" dominantBaseline="middle" fontSize={fSizeLg} fill="#4f46e5" fontWeight="bold" stroke="white" strokeWidth="0.8" paintOrder="stroke fill" strokeLinejoin="round">
                        {buildingDepth.toFixed(1)}m
                      </text>
                    </g>
                  </g>
                </g>
              </svg>
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
