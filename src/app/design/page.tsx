"use client";
import React, {
  useState,
  useRef,
  MouseEvent,
  ChangeEvent,
  useEffect,
} from 'react';

// ----- Types -----
type Point = {
  x: number;
  y: number;
  attribute: string;
  height: number;
  visibility: number;
};

type Road = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  rotation: number;
};

type LineLinks = {
  forward: string | null;
  forward_left: string | null;
  forward_right: string | null;
};

type Line = {
  id: string;
  name: string;
  points: Point[];
  links: LineLinks;
  roadId: string | null;
};

type SelectedPoint = {
  lineId: string;
  pointIndex: number;
};

type DraggingRoad = {
  roadId: string;
  offsetX: number;
  offsetY: number;
};

// ----- Component -----
const Home: React.FC = () => {
  // MODE: drawing vs. selection
  const [mode, setMode] = useState<"drawing" | "selection">("drawing");
  // Show/hide instructions popup
  const [showInstructions, setShowInstructions] = useState<boolean>(false);

  // Active selections – only one object at a time.
  const [activeRoadId, setActiveRoadId] = useState<string | null>(null);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(null);

  // Collapsible panels for sidebar
  const [expandedRoads, setExpandedRoads] = useState<string[]>([]);
  const [expandedLines, setExpandedLines] = useState<string[]>([]);

  // Dragging states
  const [draggingPoint, setDraggingPoint] = useState<SelectedPoint | null>(null);
  const [draggingRoad, setDraggingRoad] = useState<DraggingRoad | null>(null);

  // Refs
  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Added new state initialization with empty arrays and counters
  const [roads, setRoads] = useState<Road[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [roadCounter, setRoadCounter] = useState<number>(0);
  const [lineCounter, setLineCounter] = useState<number>(0);

  // Added new useEffect to fetch the default JSON data from network
  useEffect(() => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    console.log("Base path:", basePath); 
    fetch(`${basePath}/diamond_interchange_final.json`)
      .then(response => response.json())
      .then((data: any) => {
        const ds = data.default ? data.default : data;
        console.log("Fetched default JSON:", ds);
        const parsedRoads = JSON.parse(JSON.stringify(ds.roads || []));
        const parsedLines = JSON.parse(JSON.stringify(ds.lines || [])).map((line: any) => ({
          ...line,
          links: line.links ?? { forward: null, forward_left: null, forward_right: null }
        }));
        setRoads(parsedRoads);
        setLines(parsedLines);
        setRoadCounter(ds.roadCounter || 0);
        setLineCounter(ds.lineCounter || 0);
      })
      .catch(err => console.error("Failed to fetch default JSON:", err));
  }, []);

  // ----- Helper Selection Functions -----
  const selectRoad = (roadId: string) => {
    setActiveRoadId(roadId);
    setActiveLineId(null);
  };

  const selectLine = (lineId: string) => {
    setActiveLineId(lineId);
    setActiveRoadId(null);
  };

  // ----- Canvas Click -----
  // In drawing mode, clicking on the SVG adds a point to the active line.
  // In selection mode, clicking on the background clears active selections.
  const handleSvgClick = (e: MouseEvent<SVGSVGElement>) => {
    if (mode !== "drawing") {
      if (e.target === svgRef.current) {
        setActiveLineId(null);
        setActiveRoadId(null);
      }
      return;
    }
    if (!activeLineId || !svgRef.current || draggingPoint) return;
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const CTM = svg.getScreenCTM();
    if (!CTM) return;
    const transformed = pt.matrixTransform(CTM.inverse());
    const newPoint: Point = {
      x: transformed.x,
      y: transformed.y,
      attribute: '',
      height: 0,
      visibility: 1,
    };
    setLines(prev =>
      prev.map(line =>
        line.id === activeLineId ? { ...line, points: [...line.points, newPoint] } : line
      )
    );
  };

  // ----- Dragging Line Points -----
  useEffect(() => {
    if (!draggingPoint) return;
    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (!svgRef.current) return;
      const svg = svgRef.current;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const CTM = svg.getScreenCTM();
      if (!CTM) return;
      const transformed = pt.matrixTransform(CTM.inverse());
      setLines(prev =>
        prev.map(line => {
          if (line.id === draggingPoint.lineId) {
            const newPoints = line.points.map((p, idx) =>
              idx === draggingPoint.pointIndex ? { ...p, x: transformed.x, y: transformed.y } : p
            );
            return { ...line, points: newPoints };
          }
          return line;
        })
      );
    };
    const handleMouseUp = () => setDraggingPoint(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingPoint]);

  // ----- Dragging Roads -----
  useEffect(() => {
    if (!draggingRoad) return;
    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (!svgRef.current) return;
      const svg = svgRef.current;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const CTM = svg.getScreenCTM();
      if (!CTM) return;
      const transformed = pt.matrixTransform(CTM.inverse());
      setRoads(prev =>
        prev.map(road => {
          if (road.id === draggingRoad.roadId) {
            return {
              ...road,
              x: transformed.x - draggingRoad.offsetX,
              y: transformed.y - draggingRoad.offsetY,
            };
          }
          return road;
        })
      );
    };
    const handleMouseUp = () => setDraggingRoad(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingRoad]);

  // ----- Line Functions -----
  const addNewLine = () => {
    if (mode !== "drawing") {
      alert("Please switch to drawing mode to add a new line.");
      return;
    }
    const id = Date.now().toString();
    const newLine: Line = {
      id,
      name: `Line ${lineCounter + 1}`,
      points: [],
      links: { forward: null, forward_left: null, forward_right: null },
      roadId: null,
    };
    setLines(prev => [...prev, newLine]);
    setLineCounter(lineCounter + 1);
    setActiveLineId(newLine.id);
    if (mode === "drawing") setActiveRoadId(null);
  };

  const deleteActiveLine = () => {
    setLines(prev => prev.filter(line => line.id !== activeLineId));
    setActiveLineId(null);
  };

  const straightenActiveLine = () => {
    if (!activeLineId) return;
    setLines(prev =>
      prev.map(line => {
        if (line.id === activeLineId && line.points.length >= 2) {
          const start = line.points[0];
          const end = line.points[line.points.length - 1];
          const total = line.points.length - 1;
          const newPoints = line.points.map((p, idx) => {
            if (idx === 0 || idx === total) return p;
            const ratio = idx / total;
            return {
              ...p,
              x: start.x + (end.x - start.x) * ratio,
              y: start.y + (end.y - start.y) * ratio,
            };
          });
          return { ...line, points: newPoints };
        }
        return line;
      })
    );
  };

  const deleteLinePoint = (lineId: string, pointIndex: number) => {
    setLines(prev =>
      prev.map(line =>
        line.id === lineId
          ? { ...line, points: line.points.filter((_, idx) => idx !== pointIndex) }
          : line
      )
    );
  };

  const updateLineAttribute = (
    lineId: string,
    field: keyof Omit<Line, 'id' | 'points' | 'links' | 'roadId'>,
    value: string
  ) => {
    setLines(prev =>
      prev.map(line => (line.id === lineId ? { ...line, [field]: value } : line))
    );
  };

  const updateLinePointAttribute = (
    lineId: string,
    pointIndex: number,
    field: keyof Omit<Point, 'x' | 'y'>,
    value: string
  ) => {
    setLines(prev =>
      prev.map(line => {
        if (line.id === lineId) {
          const newPoints = line.points.map((p, idx) => {
            if (idx === pointIndex) {
              if (field === 'height' || field === 'visibility') {
                return { ...p, [field]: Number(value) };
              }
              return { ...p, [field]: value };
            }
            return p;
          });
          return { ...line, points: newPoints };
        }
        return line;
      })
    );
  };

  const updateLineRoad = (lineId: string, roadId: string) => {
    setLines(prev =>
      prev.map(line =>
        line.id === lineId ? { ...line, roadId: roadId === '' ? null : roadId } : line
      )
    );
  };

  const updateLineLink = (
    lineId: string,
    linkField: keyof LineLinks,
    value: string
  ) => {
    setLines(prev =>
      prev.map(line => {
        if (line.id === lineId) {
          return {
            ...line,
            links: { ...line.links, [linkField]: value === '' ? null : value },
          };
        }
        return line;
      })
    );
  };

  // ----- Road Functions -----
  const addNewRoad = () => {
    if (mode !== "drawing") {
      alert("Please switch to drawing mode to add a new road.");
      return;
    }
    const id = Date.now().toString();
    const newRoad: Road = {
      id,
      name: `Road ${roadCounter + 1}`,
      x: 50,
      y: 50,
      width: 300,
      height: 100,
      zIndex: 1,
      rotation: 0,
    };
    setRoads(prev => [...prev, newRoad]);
    setRoadCounter(roadCounter + 1);
    setActiveRoadId(newRoad.id);
    setActiveLineId(null);
  };

  const deleteActiveRoad = () => {
    setRoads(prev => prev.filter(road => road.id !== activeRoadId));
    setActiveRoadId(null);
    setLines(prev =>
      prev.map(line => (line.roadId === activeRoadId ? { ...line, roadId: null } : line))
    );
  };

  const updateRoadField = (roadId: string, field: keyof Road, value: string) => {
    setRoads(prev =>
      prev.map(road => {
        if (road.id === roadId) {
          if (['x', 'y', 'width', 'height', 'zIndex', 'rotation'].includes(field)) {
            return { ...road, [field]: Number(value) };
          }
          return { ...road, [field]: value };
        }
        return road;
      })
    );
  };

  // ----- File Download/Upload -----
  const handleDownload = () => {
    const data = { roads, lines, roadCounter, lineCounter };
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const result = event.target?.result;
        if (typeof result === 'string') {
          const data = JSON.parse(result);
          setRoads(data.roads || []);
          setLines(data.lines || []);
          setRoadCounter(data.roadCounter || 0);
          setLineCounter(data.lineCounter || 0);
          setActiveRoadId(null);
          setActiveLineId(null);
          alert('Data loaded successfully!');
        }
      } catch {
        console.error('Failed to load the JSON file.');
      }
    };
    reader.readAsText(file);
  };

  // Clear design function
  const clearDesign = () => {
    if (window.confirm('Are you sure you want to clear the design? This will remove all roads and lines.')) {
      setRoads([]);
      setLines([]);
      setRoadCounter(0);
      setLineCounter(0);
      setActiveRoadId(null);
      setActiveLineId(null);
      setSelectedPoint(null);
    }
  };

  // Instructions component
  const InstructionsPopup = () => {
    if (!showInstructions) return null;
    
    return (
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
        zIndex: 1000,
        width: '80%',
        maxWidth: '800px',
        maxHeight: '80vh',
        overflowY: 'auto'
      }}>
        <h2 style={{ borderBottom: '2px solid #007bff', paddingBottom: '10px' }}>Traffic Simulator Instructions</h2>
        
        <h3>Modes</h3>
        <p><strong>Drawing Mode:</strong> Used for adding points to lines. Click on the canvas to add points after selecting a line.</p>
        <p><strong>Selection Mode:</strong> Used for selecting, moving, and editing roads, lines, and points.</p>
        
        <h3>Roads</h3>
        <ul>
          <li><strong>Add Road:</strong> Click the "Add Road" button to create a new rectangular road section.</li>
          <li><strong>Select Road:</strong> In selection mode, click on a road to select it. Its properties will appear in the sidebar.</li>
          <li><strong>Move Road:</strong> In selection mode, drag a road to move it around the canvas.</li>
          <li><strong>Delete Road:</strong> Select a road and click "Delete Active Road" to remove it.</li>
          <li><strong>Edit Properties:</strong> After selecting a road, expand its properties in the sidebar to modify name, position, size, rotation and z-index.</li>
        </ul>
        
        <h3>Lines</h3>
        <ul>
          <li><strong>Add Line:</strong> Click the "Add Line" button to create a new line.</li>
          <li><strong>Add Points:</strong> In drawing mode, select a line and click on the canvas to add points.</li>
          <li><strong>Select Line:</strong> In selection mode, click on a line to select it. Its properties will appear in the sidebar.</li>
          <li><strong>Delete Line:</strong> Select a line and click "Delete Active Line" to remove it.</li>
          <li><strong>Straighten Line:</strong> Select a line and click "Straighten Line" to make it straight between its endpoints.</li>
          <li><strong>Link Lines:</strong> After selecting a line, use the dropdown menus to link it to other lines (Forward, Forward Left, Forward Right).</li>
          <li><strong>Associate with Road:</strong> Use the Road dropdown to associate a line with a specific road.</li>
        </ul>
        
        <h3>Points</h3>
        <ul>
          <li><strong>Select Point:</strong> In selection mode, click on a point to select it.</li>
          <li><strong>Move Point:</strong> In selection mode, drag a point to move it.</li>
          <li><strong>Delete Point:</strong> After selecting a point, click "Delete Point" in the sidebar.</li>
          <li><strong>Edit Properties:</strong> After selecting a point, modify its attributes, height, and visibility in the sidebar.</li>
        </ul>
        
        <h3>Other Features</h3>
        <ul>
          <li><strong>Save Design:</strong> Click "Download JSON" to save your current design to a file.</li>
          <li><strong>Load Design:</strong> Click "Upload JSON" to load a previously saved design.</li>
          <li><strong>Clear Design:</strong> Click "Clear Design" to remove all roads and lines.</li>
        </ul>
        
        <h3>Tips</h3>
        <ul>
          <li>Use zIndex to control which roads appear on top of others.</li>
          <li>Points with visibility set to 0 appear orange instead of green.</li>
          <li>The arrow at the end of a line indicates its direction.</li>
          <li>Line colors change when selected or linked to the active line.</li>
        </ul>
        
        <button 
          onClick={() => setShowInstructions(false)}
          style={{ 
            padding: '8px 16px', 
            backgroundColor: '#007bff', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px', 
            cursor: 'pointer',
            marginTop: '15px'
          }}
        >
          Close
        </button>
      </div>
    );
  };

  // ----- Rendering: Roads & Lines -----
  const sortedRoads = [...roads].sort((a, b) => a.zIndex - b.zIndex);
  const sortedLines = [...lines].sort((a, b) => {
    const aZ = a.roadId ? roads.find(r => r.id === a.roadId)?.zIndex || 0 : 0;
    const bZ = b.roadId ? roads.find(r => r.id === b.roadId)?.zIndex || 0 : 0;
    return aZ - bZ;
  });
  const activeLine = lines.find(l => l.id === activeLineId);

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', overflow: 'hidden' }}>
      {/* Top Controls with updated button styles */}
      <div style={{ marginBottom: '10px' }}>
        <button onClick={addNewRoad} style={{ padding: '6px 12px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Add Road</button>
        {activeRoadId && (
          <button onClick={deleteActiveRoad} style={{ padding: '6px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginLeft: '10px' }}>Delete Active Road</button>
        )}
        <button onClick={addNewLine} style={{ padding: '6px 12px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginLeft: '10px' }}>Add Line</button>
        {activeLineId && (
          <>
            <button onClick={deleteActiveLine} style={{ padding: '6px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginLeft: '10px' }}>Delete Active Line</button>
            <button onClick={straightenActiveLine} style={{ padding: '6px 12px', backgroundColor: '#ffc107', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginLeft: '10px' }}>Straighten Line</button>
          </>
        )}
        <button onClick={handleDownload} style={{ padding: '6px 12px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginLeft: '10px' }}>Download JSON</button>
        <button onClick={triggerFileUpload} style={{ padding: '6px 12px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginLeft: '10px' }}>Upload JSON</button>
        <input ref={fileInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleFileUpload} />
        <button onClick={() => setMode(mode === "drawing" ? "selection" : "drawing")} style={{ padding: '6px 12px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginLeft: '10px' }}>Switch to {mode === "drawing" ? "Selection" : "Drawing"} Mode</button>
        <button onClick={clearDesign} style={{ padding: '6px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginLeft: '10px' }}>Clear Design</button>
        <button 
          onClick={() => setShowInstructions(true)} 
          style={{ 
            padding: '6px 12px', 
            backgroundColor: '#6610f2', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px', 
            cursor: 'pointer', 
            marginLeft: '10px',
            fontWeight: 'bold'
          }}
        >
          Instructions
        </button>
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* SVG Canvas with full container height */}
        <div style={{ flex: 1, border: '1px solid #ccc', borderRadius: '8px', overflow: 'hidden' }}>
          <svg ref={svgRef} onClick={handleSvgClick} style={{ width: '100%', height: '100%' }}>
            <defs>
              <marker
                id="arrow"
                markerWidth="10"
                markerHeight="10"
                refX="10"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L0,6 L9,3 z" fill="#f00" />
              </marker>
            </defs>
            {/* Render Roads */}
            {sortedRoads.map(road => {
              let roadStrokeColor = 'black';
              let roadStrokeWidth = 2;
              if (activeRoadId === road.id) {
                roadStrokeColor = 'blue';
                roadStrokeWidth = 3;
              } else if (activeLine && activeLine.roadId === road.id) {
                roadStrokeColor = 'purple';
                roadStrokeWidth = 3;
              }
              return (
                <g
                  key={road.id}
                  transform={`translate(${road.x}, ${road.y}) rotate(${road.rotation}, ${road.width / 2}, ${road.height / 2})`}
                  onMouseDown={(e) => {
                    if (mode === "selection") {
                      e.stopPropagation();
                      if (svgRef.current) {
                        const svg = svgRef.current;
                        const pt = svg.createSVGPoint();
                        pt.x = e.clientX;
                        pt.y = e.clientY;
                        const CTM = svg.getScreenCTM();
                        if (!CTM) return;
                        const transformed = pt.matrixTransform(CTM.inverse());
                        setDraggingRoad({
                          roadId: road.id,
                          offsetX: transformed.x - road.x,
                          offsetY: transformed.y - road.y,
                        });
                      }
                    }
                  }}
                  style={{ cursor: mode === "selection" ? 'move' : 'default' }}
                  onClick={(e) => {
                    if (mode === "selection") {
                      e.stopPropagation();
                      selectRoad(road.id);
                    }
                  }}
                >
                  <rect
                    x={0}
                    y={0}
                    width={road.width}
                    height={road.height}
                    fill="#ddd"
                    stroke={roadStrokeColor}
                    strokeWidth={roadStrokeWidth}
                  />
                </g>
              );
            })}
            {/* Render All Lines on Top */}
            <g>
              {sortedLines.map(line => {
                let lineStrokeColor = 'red';
                let lineStrokeWidth = 2;
                if (line.id === activeLineId) {
                  lineStrokeColor = 'blue';
                  lineStrokeWidth = 3;
                } else if (activeLine) {
                  if (activeLine.links.forward === line.id) {
                    lineStrokeColor = 'magenta';
                    lineStrokeWidth = 3;
                  } else if (activeLine.links.forward_left === line.id) {
                    lineStrokeColor = 'cyan';
                    lineStrokeWidth = 3;
                  } else if (activeLine.links.forward_right === line.id) {
                    lineStrokeColor = 'yellow';
                    lineStrokeWidth = 3;
                  }
                }
                const pointsStr = line.points.map(p => `${p.x},${p.y}`).join(' ');
                return (
                  <polyline
                    key={line.id}
                    points={pointsStr}
                    fill="none"
                    stroke={lineStrokeColor}
                    strokeWidth={lineStrokeWidth}
                    markerEnd="url(#arrow)"
                    onClick={(e) => {
                      if (mode === "selection") {
                        e.stopPropagation();
                        selectLine(line.id);
                      }
                    }}
                  />
                );
              })}
            </g>
            {/* Render Line Points */}
            {lines.map(line =>
              line.points.map((p, index) => {
                const isSelected =
                  selectedPoint &&
                  selectedPoint.lineId === line.id &&
                  selectedPoint.pointIndex === index;
                const fillColor = isSelected ? 'yellow' : p.visibility !== 1 ? 'orange' : 'green';
                return (
                  <circle
                    key={`${line.id}-${index}`}
                    cx={p.x}
                    cy={p.y}
                    r="4"
                    fill={fillColor}
                    stroke={isSelected ? 'red' : 'none'}
                    strokeWidth={isSelected ? 2 : 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (mode === "selection") {
                        setSelectedPoint({ lineId: line.id, pointIndex: index });
                      }
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDraggingPoint({ lineId: line.id, pointIndex: index });
                    }}
                  />
                );
              })
            )}
          </svg>
        </div>
        {/* Sidebar Panel with separated Roads and Lines */}
        <div style={{ marginLeft: '20px', width: '300px', height: '100%', flexShrink: 0, border: '1px solid #ccc', borderRadius: '8px', padding: '10px', backgroundColor: '#f9f9f9', overflowY: 'scroll' }}>
          <div style={{ 
            textAlign: 'center', 
            padding: '5px', 
            backgroundColor: mode === "drawing" ? '#28a745' : '#007bff', 
            color: 'white', 
            borderRadius: '4px', 
            marginBottom: '10px',
            fontWeight: 'bold'
          }}>
            Current Mode: {mode === "drawing" ? "Drawing" : "Selection"}
            <div style={{ fontSize: '0.8em', fontWeight: 'normal', marginTop: '3px' }}>
              {mode === "drawing" 
               ? "Click on canvas to add points to the selected line" 
               : "Click to select objects, drag to move them"}
            </div>
          </div>
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ borderBottom: '2px solid #007bff', paddingBottom: '5px' }}>Roads</h3>
            <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
              {roads.map(road => (
                <li key={road.id} style={{ marginBottom: '15px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                    <button onClick={() => selectRoad(road.id)} style={{ padding: '4px 8px', backgroundColor: activeRoadId === road.id ? '#007bff' : 'transparent', color: activeRoadId === road.id ? 'white' : '#333', border: activeRoadId === road.id ? 'none' : '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' }}>
                      {road.name}
                    </button>
                    <button onClick={() => setExpandedRoads(prev => prev.includes(road.id) ? prev.filter(id => id !== road.id) : [...prev, road.id])} style={{ padding: '4px 8px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginLeft: '5px' }}>
                      {expandedRoads.includes(road.id) ? 'Collapse' : 'Expand'}
                    </button>
                  </div>
                  {expandedRoads.includes(road.id) && (
                    <div style={{ paddingLeft: '10px' }}>
                      <div style={{ marginBottom: '5px' }}>
                        <label>
                          Name:
                          <input
                            type="text"
                            value={road.name}
                            onChange={(e) => updateRoadField(road.id, 'name', e.target.value)}
                            style={{ marginLeft: '5px', width: '70%' }}
                          />
                        </label>
                      </div>
                      <div style={{ marginBottom: '5px' }}>
                        <label>
                          X:
                          <input
                            type="number"
                            value={road.x}
                            onChange={(e) => updateRoadField(road.id, 'x', e.target.value)}
                            style={{ marginLeft: '5px', width: '70%' }}
                          />
                        </label>
                      </div>
                      <div style={{ marginBottom: '5px' }}>
                        <label>
                          Y:
                          <input
                            type="number"
                            value={road.y}
                            onChange={(e) => updateRoadField(road.id, 'y', e.target.value)}
                            style={{ marginLeft: '5px', width: '70%' }}
                          />
                        </label>
                      </div>
                      <div style={{ marginBottom: '5px' }}>
                        <label>
                          Width:
                          <input
                            type="number"
                            value={road.width}
                            onChange={(e) => updateRoadField(road.id, 'width', e.target.value)}
                            style={{ marginLeft: '5px', width: '70%' }}
                          />
                        </label>
                      </div>
                      <div style={{ marginBottom: '5px' }}>
                        <label>
                          Height:
                          <input
                            type="number"
                            value={road.height}
                            onChange={(e) => updateRoadField(road.id, 'height', e.target.value)}
                            style={{ marginLeft: '5px', width: '70%' }}
                          />
                        </label>
                      </div>
                      <div style={{ marginBottom: '5px' }}>
                        <label>
                          zIndex:
                          <input
                            type="number"
                            value={road.zIndex}
                            onChange={(e) => updateRoadField(road.id, 'zIndex', e.target.value)}
                            style={{ marginLeft: '5px', width: '70%' }}
                          />
                        </label>
                      </div>
                      <div style={{ marginBottom: '5px' }}>
                        <label>
                          Rotation:
                          <input
                            type="number"
                            value={road.rotation}
                            onChange={(e) => updateRoadField(road.id, 'rotation', e.target.value)}
                            style={{ marginLeft: '5px', width: '70%' }}
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <hr style={{ border: 'none', borderTop: '1px solid #ccc', margin: '10px 0' }}/>
          <div>
            <h3 style={{ borderBottom: '2px solid #28a745', paddingBottom: '5px' }}>Lines</h3>
            <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
              {lines.map(line => (
                <li key={line.id} style={{ marginBottom: '15px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                    <button onClick={() => selectLine(line.id)} style={{ padding: '4px 8px', backgroundColor: activeLineId === line.id ? '#28a745' : 'transparent', color: activeLineId === line.id ? 'white' : '#333', border: activeLineId === line.id ? 'none' : '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' }}>
                      {line.name}
                    </button>
                    <button onClick={() => setExpandedLines(prev => prev.includes(line.id) ? prev.filter(id => id !== line.id) : [...prev, line.id])} style={{ padding: '4px 8px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginLeft: '5px' }}>
                      {expandedLines.includes(line.id) ? 'Collapse' : 'Expand'}
                    </button>
                  </div>
                  {expandedLines.includes(line.id) && (
                    <div style={{ paddingLeft: '10px' }}>
                      <div style={{ marginBottom: '5px' }}>
                        <label>
                          Name:
                          <input
                            type="text"
                            value={line.name}
                            onChange={(e) => updateLineAttribute(line.id, 'name', e.target.value)}
                            style={{ marginLeft: '5px', width: '70%' }}
                          />
                        </label>
                      </div>
                      <div style={{ marginBottom: '5px' }}>
                        <label>
                          Road:
                          <select
                            value={line.roadId || ''}
                            onChange={(e) => updateLineRoad(line.id, e.target.value)}
                            style={{ marginLeft: '5px', width: '70%' }}
                          >
                            <option value="">None</option>
                            {roads.map(road => (
                              <option key={road.id} value={road.id}>
                                {road.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      {/* Line linking */}
                      <div style={{ marginBottom: '5px' }}>
                        <label>
                          Forward Link:
                          <select
                            value={line.links.forward || ''}
                            onChange={(e) => updateLineLink(line.id, 'forward', e.target.value)}
                            style={{ marginLeft: '5px', width: '70%' }}
                          >
                            <option value="">None</option>
                            {lines.filter(l => l.id !== line.id).map(l => (
                              <option key={l.id} value={l.id}>
                                {l.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div style={{ marginBottom: '5px' }}>
                        <label>
                          Forward Left Link:
                          <select
                            value={line.links.forward_left || ''}
                            onChange={(e) => updateLineLink(line.id, 'forward_left', e.target.value)}
                            style={{ marginLeft: '5px', width: '70%' }}
                          >
                            <option value="">None</option>
                            {lines.filter(l => l.id !== line.id).map(l => (
                              <option key={l.id} value={l.id}>
                                {l.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div style={{ marginBottom: '5px' }}>
                        <label>
                          Forward Right Link:
                          <select
                            value={line.links.forward_right || ''}
                            onChange={(e) => updateLineLink(line.id, 'forward_right', e.target.value)}
                            style={{ marginLeft: '5px', width: '70%' }}
                          >
                            <option value="">None</option>
                            {lines.filter(l => l.id !== line.id).map(l => (
                              <option key={l.id} value={l.id}>
                                {l.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      {line.points.length > 0 && (
                        <ul style={{ paddingLeft: '10px', marginTop: '5px' }}>
                          {line.points.map((point, index) => (
                            <li
                              key={index}
                              style={{
                                fontSize: '0.9em',
                                marginTop: '5px',
                                cursor: 'pointer',
                                backgroundColor:
                                  selectedPoint && selectedPoint.lineId === line.id && selectedPoint.pointIndex === index
                                    ? '#efefef'
                                    : 'transparent',
                                padding: '2px 5px',
                                borderRadius: '3px',
                              }}
                              onClick={() => { if (mode === "selection") { setActiveLineId(line.id); } }}
                            >
                              <div>
                                <strong>Point {index + 1}</strong>: ({point.x.toFixed(1)}, {point.y.toFixed(1)})
                              </div>
                              <div>
                                <label>
                                  Attribute:
                                  <input
                                    type="text"
                                    value={point.attribute}
                                    onChange={(e) => updateLinePointAttribute(line.id, index, 'attribute', e.target.value)}
                                    onFocus={() => setSelectedPoint({ lineId: line.id, pointIndex: index })}
                                    style={{ marginLeft: '5px', width: '70%' }}
                                  />
                                </label>
                              </div>
                              <div>
                                <label>
                                  Height:
                                  <input
                                    type="number"
                                    value={point.height}
                                    onChange={(e) => updateLinePointAttribute(line.id, index, 'height', e.target.value)}
                                    onFocus={() => setSelectedPoint({ lineId: line.id, pointIndex: index })}
                                    style={{ marginLeft: '5px', width: '70%' }}
                                  />
                                </label>
                              </div>
                              <div>
                                <label>
                                  Visibility:
                                  <input
                                    type="number"
                                    value={point.visibility}
                                    onChange={(e) => updateLinePointAttribute(line.id, index, 'visibility', e.target.value)}
                                    onFocus={() => setSelectedPoint({ lineId: line.id, pointIndex: index })}
                                    style={{ marginLeft: '5px', width: '70%' }}
                                  />
                                </label>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteLinePoint(line.id, index);
                                }}
                                style={{
                                  marginTop: '5px',
                                  backgroundColor: '#d9534f',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '3px',
                                  padding: '2px 5px',
                                  fontSize: '0.8em',
                                }}
                              >
                                Delete Point
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      {/* Instructions Popup */}
      <InstructionsPopup />
    </div>
  );
};

export default Home;
