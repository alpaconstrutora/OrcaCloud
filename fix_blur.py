import re

file_path = r"c:\D\ORÇACLOUD\orçacloud-saas\components\electrical\ElectricalEditorView.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. State changes
state_old = """  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const { showToast } = useToast();"""

state_new = """  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [stageTransform, setStageTransform] = useState({ scale: 1, x: 0, y: 0 });
  const { showToast } = useToast();

  useEffect(() => {
    if (containerRef.current) {
      setDimensions({ width: containerRef.current.offsetWidth, height: containerRef.current.offsetHeight });
    }
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({ width: containerRef.current.offsetWidth, height: containerRef.current.offsetHeight });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);"""
content = content.replace(state_old, state_new)

# 2. loadImage
load_image_old = """  const loadImage = (url: string) => {
    const img = new window.Image();
    img.src = url;
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      setImageObj(img);
      setStageSize({ width: img.width, height: img.height });
    };
  };"""
load_image_new = """  const loadImage = (url: string) => {
    const img = new window.Image();
    img.src = url;
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      setImageObj(img);
    };
  };"""
content = content.replace(load_image_old, load_image_new)

# 3. !p.fileUrl branch
branch_old = """          if (p.fileUrl) {
            loadImage(p.fileUrl);
          } else {
            setImageObj(null);
            setStageSize({ width: 3000, height: 3000 }); // Default large canvas for drawing without image
          }"""
branch_new = """          if (p.fileUrl) {
            loadImage(p.fileUrl);
          } else {
            setImageObj(null);
          }"""
content = content.replace(branch_old, branch_new)

# 4. Handlers (Only first occurrence!)
handlers_old = """  const handleStageDblClick = (e: any) => {"""
handlers_new = """  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    
    const scaleBy = 1.1;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
    if (newScale < 0.1 || newScale > 20) return;

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    
    setStageTransform({ scale: newScale, x: newPos.x, y: newPos.y });
  };

  const handleDragMove = (e: any) => {
    if (e.target === stageRef.current) {
      setStageTransform(prev => ({ ...prev, x: e.target.x(), y: e.target.y() }));
    }
  };

  const zoomIn = () => setStageTransform(prev => ({ ...prev, scale: Math.min(20, prev.scale * 1.2) }));
  const zoomOut = () => setStageTransform(prev => ({ ...prev, scale: Math.max(0.1, prev.scale / 1.2) }));
  const resetTransform = () => setStageTransform({ scale: 1, x: 0, y: 0 });

  const handleStageDblClick = (e: any) => {"""
content = content.replace(handlers_old, handlers_new, 1) # Only first!

# Remove the second duplicated handleStageDblClick
second_dbl_click = """  const handleStageDblClick = (e: any) => {
    if (tool === 'draw_wall') {
      finishWall();
    }
  };

"""
content = content.replace(second_dbl_click, "")


# 5. Rendering TransformWrapper Start
render_wrapper_old = """            {plan && (
              <TransformWrapper
                initialScale={1}
                minScale={0.1}
                maxScale={5}
                limitToBounds={false}
                panning={{ disabled: tool !== 'select' && !isShiftDown }}
                wheel={{ step: 0.01 }}
                doubleClick={{ disabled: true }}
              >
                {({ zoomIn, zoomOut, resetTransform, state, transformState, ...rest }: any) => {
                  const tState = state || transformState || { scale: 1, positionX: 0, positionY: 0 };
                  const s = tState.scale;
                  const px = tState.positionX;
                  const py = tState.positionY;"""
render_wrapper_new = """            {plan && (
              <React.Fragment>
                {(() => {
                  const s = stageTransform.scale;
                  const px = stageTransform.x;
                  const py = stageTransform.y;"""
content = content.replace(render_wrapper_old, render_wrapper_new)

# 6. Zoom controls
zoom_out_old = """                      <button 
                        onClick={() => zoomOut(0.2)} """
zoom_out_new = """                      <button 
                        onClick={zoomOut} """
content = content.replace(zoom_out_old, zoom_out_new)

zoom_in_old = """                      <button 
                        onClick={() => zoomIn(0.2)} """
zoom_in_new = """                      <button 
                        onClick={zoomIn} """
content = content.replace(zoom_in_old, zoom_in_new)

# 7. Stage
stage_old = """                    <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full flex items-center justify-center">
                      <div className="relative" style={{ width: stageSize.width, height: stageSize.height }}>
                        <Stage 
                          ref={stageRef}
                          width={stageSize.width} 
                          height={stageSize.height}
                          onClick={handleStageClick}
                          onMouseMove={handleStageMouseMove}
                          onDblClick={handleStageDblClick}"""
stage_new = """                    <div className="absolute inset-0">
                      <Stage 
                        ref={stageRef}
                        width={dimensions.width || 800} 
                        height={dimensions.height || 600}
                        scaleX={s}
                        scaleY={s}
                        x={px}
                        y={py}
                        onWheel={handleWheel}
                        draggable={tool === 'select' || isShiftDown}
                        onDragMove={handleDragMove}
                        onClick={handleStageClick}
                        onMouseMove={handleStageMouseMove}
                        onDblClick={handleStageDblClick}"""
content = content.replace(stage_old, stage_new)

# 8. TransformWrapper End
stage_end_old = """                        </Layer>
                      </Stage>
                      </div>
                    </TransformComponent>
                  </React.Fragment>
                  );
                }}
              </TransformWrapper>
            )}"""
stage_end_new = """                        </Layer>
                      </Stage>
                    </div>
                  </React.Fragment>
                  );
                })()}
              </React.Fragment>
            )}"""
content = content.replace(stage_end_old, stage_end_new)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Done")
