import React, { useState } from 'react';
import { ZoomIn, ZoomOut, Maximize, Minimize, RotateCcw, Focus } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { computeFloorLayout } from './plantaGeometry';

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
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
}

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
  isRotated: initialRotated,
  onToggleFullscreen,
  isFullscreen = false
}: Props) {
  // Auto-rotate if terrain is much deeper than it is wide
  const [isRotated, setIsRotated] = useState(
    initialRotated ?? (terrainDepth > terrainWidth * 1.5)
  );

  const [gridSize, setGridSize] = useState<number>(0);

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

  // Font sizes calibrated to match ~14px (Tailwind text-sm) on a typical screen
  const minDim = Math.min(viewW, viewH);
  const baseFontSize = Math.max(1, minDim * 0.030); 
  const fSizeLg = baseFontSize * 1.2; // Slightly larger for main dimensions
  const fSizeMd = baseFontSize;       // 14px equivalent for areas
  const fSizeSm = baseFontSize * 0.85; // 12px equivalent for U-1 and setbacks

  // Offset to center the rotated drawing in the viewBox
  const offX = viewW / 2;
  const offY = viewH / 2;

  // Layout paramétrico compartilhado com o viewer 3D (grade de unidades + núcleo)
  const layout = computeFloorLayout(w, h, unitsPerFloor);

  // Draw units
  const units: React.ReactNode[] = layout.units.map((u) => (
    <g key={`unit-${u.index}`}>
      <rect
        x={u.x}
        y={u.y}
        width={u.width}
        height={u.height}
        fill={u.color}
        fillOpacity={0.4}
        stroke={u.color.replace('200', '500')}
        strokeWidth={0.1}
      />
      {privateAreaPerUnit > 0 && (
        <g transform={`translate(${u.x + u.width / 2}, ${u.y + u.height / 2})`}>
          <text
            transform={`rotate(${counterRot})`}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={fSizeMd}
            fill="#4b5563"
          >
            {Math.round(privateAreaPerUnit)} m²
          </text>
        </g>
      )}
      <g transform={`translate(${u.x + 2}, ${u.y + (isRotated ? u.height - 2 : 4)})`}>
        <text
           transform={`rotate(${counterRot})`}
           fontSize={fSizeSm}
           fill="#6b7280"
           dominantBaseline={isRotated ? "auto" : "hanging"}
        >
           U-{u.index + 1}
        </text>
      </g>
    </g>
  ));

  // Core (Circulation / Elevators)
  const { x: coreX, y: coreY, width: coreWidth, height: coreHeight } = layout.core;

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
                  <button onClick={() => resetTransform()} className="p-1.5 hover:bg-gray-100 rounded text-gray-600 transition-colors" title="Centralizar Visualização">
                    <Focus className="w-4 h-4" />
                  </button>
                  {onToggleFullscreen && (
                    <button 
                      onClick={onToggleFullscreen} 
                      className="p-1.5 hover:bg-gray-100 rounded text-gray-600 transition-colors border-l border-gray-100 ml-1 pl-2" 
                      title={isFullscreen ? "Sair da Tela Cheia" : "Tela Cheia"}
                    >
                      {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                    </button>
                  )}
               </div>
               
               <button 
                 onClick={() => setIsRotated(!isRotated)}
                 className="p-2 bg-white hover:bg-gray-100 rounded-lg text-gray-600 shadow-sm border border-gray-200 flex items-center justify-center gap-2 text-sm font-medium transition-colors"
                 title="Girar Planta"
               >
                 <RotateCcw className="w-4 h-4" />
               </button>

               <select 
                 value={gridSize} 
                 onChange={(e) => setGridSize(Number(e.target.value))}
                 className="p-1.5 bg-white hover:bg-gray-100 rounded-lg text-gray-600 shadow-sm border border-gray-200 text-xs font-medium cursor-pointer outline-none transition-colors"
                 title="Grade (Grid)"
               >
                 <option value={0}>Grid: Off</option>
                 <option value={0.5}>Grid: 0.5m</option>
                 <option value={1}>Grid: 1.0m</option>
                 <option value={5}>Grid: 5.0m</option>
               </select>
            </div>

            <TransformComponent 
              wrapperStyle={{ width: "100%", height: "100%" }} 
              contentStyle={{ width: "100%", height: "100%", display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg width="100%" height="100%" viewBox={`0 0 ${viewW} ${viewH}`} style={{ maxWidth: '85vw', maxHeight: '85vh', fontFamily: 'inherit' }}>
                <g transform={`translate(${offX}, ${offY}) rotate(${rotAngle}) translate(${-cx}, ${-cy})`}>
                  
                  {/* Grid Lines */}
                  {gridSize > 0 && (
                    <g pointerEvents="none">
                      {Array.from({ length: Math.floor(tW / gridSize) + 1 }).map((_, i) => (
                        <line key={`v-${i}`} x1={i * gridSize} y1={0} x2={i * gridSize} y2={tH} stroke="#d1d5db" strokeWidth={gridSize >= 1 ? 0.05 : 0.02} />
                      ))}
                      {Array.from({ length: Math.floor(tH / gridSize) + 1 }).map((_, i) => (
                        <line key={`h-${i}`} x1={0} y1={i * gridSize} x2={tW} y2={i * gridSize} stroke="#d1d5db" strokeWidth={gridSize >= 1 ? 0.05 : 0.02} />
                      ))}
                    </g>
                  )}

                  {/* Terrain Footprint Outline */}
                  <rect 
                    x={0} 
                    y={0} 
                    width={tW} 
                    height={tH} 
                    fill="transparent" 
                    stroke="#9ca3af" 
                    strokeWidth="0.15" 
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
                      <line x1={0} y1={fS + h * 0.2} x2={lS} y2={fS + h * 0.2} stroke="#6b7280" strokeWidth="0.1" strokeDasharray="1 1" />
                      <g transform={`translate(${lS / 2}, ${fS + h * 0.2})`}>
                        <text transform={`rotate(${counterRot})`} textAnchor="middle" dominantBaseline="middle" fontSize={fSizeSm} fill="#4b5563" stroke="white" strokeWidth="0.5" paintOrder="stroke fill" strokeLinejoin="round">
                          {lS.toFixed(1)}m
                        </text>
                      </g>
                    </g>
                  )}
                  {rS > 0 && (
                    <g>
                      {/* Right setback line at 80% of building depth */}
                      <line x1={lS + w} y1={fS + h * 0.8} x2={tW} y2={fS + h * 0.8} stroke="#6b7280" strokeWidth="0.1" strokeDasharray="1 1" />
                      <g transform={`translate(${lS + w + rS / 2}, ${fS + h * 0.8})`}>
                        <text transform={`rotate(${counterRot})`} textAnchor="middle" dominantBaseline="middle" fontSize={fSizeSm} fill="#4b5563" stroke="white" strokeWidth="0.5" paintOrder="stroke fill" strokeLinejoin="round">
                          {rS.toFixed(1)}m {rS > minRightSetback && `(Min: ${minRightSetback}m)`}
                        </text>
                      </g>
                    </g>
                  )}
                  {fS > 0 && (
                    <g>
                      {/* Front setback line at 20% of building width */}
                      <line x1={lS + w * 0.2} y1={0} x2={lS + w * 0.2} y2={fS} stroke="#6b7280" strokeWidth="0.1" strokeDasharray="1 1" />
                      <g transform={`translate(${lS + w * 0.2}, ${fS / 2})`}>
                        <text transform={`rotate(${counterRot})`} textAnchor="middle" dominantBaseline="middle" fontSize={fSizeSm} fill="#4b5563" stroke="white" strokeWidth="0.5" paintOrder="stroke fill" strokeLinejoin="round">
                          {fS.toFixed(1)}m
                        </text>
                      </g>
                    </g>
                  )}
                  {rearS > 0 && (
                    <g>
                      {/* Rear setback line at 80% of building width */}
                      <line x1={lS + w * 0.8} y1={fS + h} x2={lS + w * 0.8} y2={tH} stroke="#6b7280" strokeWidth="0.1" strokeDasharray="1 1" />
                      <g transform={`translate(${lS + w * 0.8}, ${fS + h + rearS / 2})`}>
                        <text transform={`rotate(${counterRot})`} textAnchor="middle" dominantBaseline="middle" fontSize={fSizeSm} fill="#4b5563" stroke="white" strokeWidth="0.5" paintOrder="stroke fill" strokeLinejoin="round">
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
                    strokeWidth="0.1" 
                    strokeDasharray="1 1" 
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
                      stroke="#4b5563" 
                      strokeWidth="0.15" 
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
                      stroke="#6b7280" 
                      strokeWidth="0.1"
                    />
                    <g transform={`translate(${w / 2}, ${h / 2})`}>
                      <text 
                        transform={`rotate(${counterRot})`}
                        textAnchor="middle" 
                        dominantBaseline="middle" 
                        fontSize={fSizeMd} 
                        fill="#6b7280"
                      >
                        HALL
                      </text>
                    </g>
                    
                    {/* Dimensions */}
                    <g transform={`translate(${w / 2}, ${h + fSizeLg})`}>
                      <text transform={`rotate(${counterRot})`} textAnchor="middle" dominantBaseline="middle" fontSize={fSizeLg} fill="#4f46e5" stroke="white" strokeWidth="0.8" paintOrder="stroke fill" strokeLinejoin="round">
                        {buildingWidth.toFixed(1)}m
                      </text>
                    </g>
                    
                    <g transform={`translate(${w + fSizeLg}, ${h / 2})`}>
                      <text transform={`rotate(${counterRot})`} textAnchor="middle" dominantBaseline="middle" fontSize={fSizeLg} fill="#4f46e5" stroke="white" strokeWidth="0.8" paintOrder="stroke fill" strokeLinejoin="round">
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
