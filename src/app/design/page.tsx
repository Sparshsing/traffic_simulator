"use client";
import React, {
    useState,
    useRef,
    MouseEvent,
    ChangeEvent,
    useEffect,
  } from 'react';
  
  type Point = {
    x: number;
    y: number;
    attribute: string;
    height: number;
    visibility: number;
  };
  
  type Links = {
    forward?: string;
    forward_left?: string;
    forward_right?: string;
  };
  
  type Polyline = {
    id: string;
    name: string;
    points: Point[];
    links: Links;
  };
  
  type SelectedPoint = {
    polylineId: string;
    pointIndex: number;
  };
  
  const Home: React.FC = () => {
    const [polylines, setPolylines] = useState<Polyline[]>([]);
    const [activePolylineId, setActivePolylineId] = useState<string | null>(null);
    const [expandedPolylines, setExpandedPolylines] = useState<string[]>([]);
    const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(
      null
    );
    const [draggingPoint, setDraggingPoint] = useState<SelectedPoint | null>(
      null
    );
  
    const svgRef = useRef<SVGSVGElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
  
    // --- Canvas and Point Functions ---
  
    // Add a point on SVG click (only when not dragging)
    const handleSvgClick = (e: MouseEvent<SVGSVGElement>) => {
      if (!activePolylineId || !svgRef.current || draggingPoint) return;
      const svg = svgRef.current;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const CTM = svg.getScreenCTM();
      if (!CTM) return;
      const transformedPoint = pt.matrixTransform(CTM.inverse());
  
      const newPoint: Point = {
        x: transformedPoint.x,
        y: transformedPoint.y,
        attribute: '',
        height: 0,
        visibility: 1,
      };
  
      setPolylines((prevPolylines) =>
        prevPolylines.map((polyline) => {
          if (polyline.id === activePolylineId) {
            return { ...polyline, points: [...polyline.points, newPoint] };
          }
          return polyline;
        })
      );
    };
  
    // Dragging: update the position of a point while dragging
    useEffect(() => {
      if (!draggingPoint) return;
      const handleMouseMove = (e: MouseEvent) => {
        if (!svgRef.current) return;
        const svg = svgRef.current;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const CTM = svg.getScreenCTM();
        if (!CTM) return;
        const transformed = pt.matrixTransform(CTM.inverse());
  
        setPolylines((prevPolylines) =>
          prevPolylines.map((polyline) => {
            if (polyline.id === draggingPoint.polylineId) {
              const newPoints = polyline.points.map((point, idx) => {
                if (idx === draggingPoint.pointIndex) {
                  return { ...point, x: transformed.x, y: transformed.y };
                }
                return point;
              });
              return { ...polyline, points: newPoints };
            }
            return polyline;
          })
        );
      };
  
      const handleMouseUp = () => {
        setDraggingPoint(null);
      };
  
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }, [draggingPoint]);
  
    // --- Polyline Functions ---
  
    // Create a new polyline with a default name and empty links
    const addNewPolyline = () => {
      const id = Date.now().toString();
      const newPolyline: Polyline = {
        id,
        name: `Polyline ${id}`,
        points: [],
        links: {},
      };
      setPolylines((prev) => [...prev, newPolyline]);
      setActivePolylineId(newPolyline.id);
    };
  
    // Delete the active polyline
    const deleteActivePolyline = () => {
      setPolylines((prevPolylines) =>
        prevPolylines.filter((polyline) => polyline.id !== activePolylineId)
      );
      setActivePolylineId(null);
      setSelectedPoint(null);
    };
  
    // Update a polyline field (name or links)
    const updatePolylineField = (
      polylineId: string,
      field: keyof Omit<Polyline, 'id' | 'points'>,
      value: string | Links
    ) => {
      setPolylines((prevPolylines) =>
        prevPolylines.map((polyline) => {
          if (polyline.id === polylineId) {
            return { ...polyline, [field]: value };
          }
          return polyline;
        })
      );
    };
  
    // --- Point Functions ---
  
    // Delete a specific point from a polyline
    const deletePoint = (polylineId: string, pointIndex: number) => {
      setPolylines((prevPolylines) =>
        prevPolylines.map((polyline) => {
          if (polyline.id === polylineId) {
            const newPoints = polyline.points.filter((_, idx) => idx !== pointIndex);
            return { ...polyline, points: newPoints };
          }
          return polyline;
        })
      );
      if (
        selectedPoint &&
        selectedPoint.polylineId === polylineId &&
        selectedPoint.pointIndex === pointIndex
      ) {
        setSelectedPoint(null);
      }
    };
  
    // Update an attribute of a point
    const updatePointAttribute = (
      polylineId: string,
      pointIndex: number,
      field: keyof Omit<Point, 'x' | 'y'>,
      newValue: string
    ) => {
      setPolylines((prevPolylines) =>
        prevPolylines.map((polyline) => {
          if (polyline.id === polylineId) {
            const newPoints = polyline.points.map((pt, idx) => {
              if (idx === pointIndex) {
                if (field === 'height' || field === 'visibility') {
                  return { ...pt, [field]: Number(newValue) };
                }
                return { ...pt, [field]: newValue };
              }
              return pt;
            });
            return { ...polyline, points: newPoints };
          }
          return polyline;
        })
      );
    };
  
    // --- Selection and Expansion ---
  
    const selectPolyline = (id: string) => {
      setActivePolylineId(id);
    };
  
    const toggleExpandPolyline = (id: string) => {
      setExpandedPolylines((prev) =>
        prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]
      );
    };
  
    const handleSelectPoint = (polylineId: string, pointIndex: number) => {
      setSelectedPoint({ polylineId, pointIndex });
    };
  
    // --- File Download/Upload ---
  
    const handleDownload = () => {
      const dataStr = JSON.stringify(polylines, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'polylines.json';
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
            const loadedPolylines: Polyline[] = JSON.parse(result);
            setPolylines(loadedPolylines);
            setActivePolylineId(null);
            setSelectedPoint(null);
            alert('Polylines loaded successfully!');
          }
        } catch (error) {
          alert('Failed to load the JSON file.');
        }
      };
      reader.readAsText(file);
    };
  
    // --- Determine Linked Targets for Active Polyline ---
  
    const activePolyline = polylines.find((p) => p.id === activePolylineId);
  
    // --- Render ---
  
    return (
      <div style={{ padding: '20px' }}>
        <h2>Polyline Drawer</h2>
        <div style={{ display: 'flex' }}>
          {/* SVG Drawing Area */}
          <div style={{ flex: 1 }}>
            <svg
              ref={svgRef}
              onClick={handleSvgClick}
              style={{ border: '1px solid #ccc', width: '100%', height: '80vh' }}
            >
              {/* Define marker for arrow */}
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
  
              {/* Render Polylines */}
              {polylines.map((polyline) => {
                // Determine stroke based on link settings:
                let strokeColor = 'black';
                let strokeWidth = 2;
                if (polyline.id === activePolylineId) {
                  strokeColor = 'blue';
                  strokeWidth = 3;
                } else if (activePolyline) {
                  if (activePolyline.links.forward === polyline.id) {
                    strokeColor = 'magenta';
                    strokeWidth = 3;
                  } else if (activePolyline.links.forward_left === polyline.id) {
                    strokeColor = 'cyan';
                    strokeWidth = 3;
                  } else if (activePolyline.links.forward_right === polyline.id) {
                    strokeColor = 'yellow';
                    strokeWidth = 3;
                  }
                }
                return polyline.points.length > 0 ? (
                  <polyline
                    key={polyline.id}
                    points={polyline.points.map((p) => `${p.x},${p.y}`).join(' ')}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    fill="none"
                    markerEnd="url(#arrow)"
                  />
                ) : null;
              })}
  
              {/* Render Points */}
              {polylines.map((polyline) =>
                polyline.points.map((p, index) => {
                  const isSelected =
                    selectedPoint &&
                    selectedPoint.polylineId === polyline.id &&
                    selectedPoint.pointIndex === index;
                  const fillColor = isSelected
                    ? 'yellow'
                    : p.visibility !== 1
                    ? 'orange'
                    : 'green';
                  return (
                    <circle
                      key={`${polyline.id}-${index}`}
                      cx={p.x}
                      cy={p.y}
                      r="4"
                      fill={fillColor}
                      stroke={isSelected ? 'red' : 'none'}
                      strokeWidth={isSelected ? 2 : 0}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDraggingPoint({
                          polylineId: polyline.id,
                          pointIndex: index,
                        });
                      }}
                    />
                  );
                })
              )}
            </svg>
            <div style={{ marginTop: '10px' }}>
              <button onClick={addNewPolyline}>Add Polyline</button>
              {activePolylineId && (
                <button
                  onClick={deleteActivePolyline}
                  style={{ marginLeft: '10px' }}
                >
                  Delete Active Polyline
                </button>
              )}
              <button onClick={handleDownload} style={{ marginLeft: '10px' }}>
                Download JSON
              </button>
              <button onClick={triggerFileUpload} style={{ marginLeft: '10px' }}>
                Upload JSON
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
            </div>
          </div>
  
          {/* Sidebar for Polyline and Point Details */}
          <div style={{ marginLeft: '20px', width: '300px' }}>
            <h3>Polylines</h3>
            <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
              {polylines.map((polyline) => (
                <li key={polyline.id} style={{ marginBottom: '15px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      marginBottom: '5px',
                    }}
                  >
                    <button onClick={() => selectPolyline(polyline.id)}>
                      {activePolylineId === polyline.id ? 'Active: ' : ''}
                      {polyline.name}
                    </button>
                    <button
                      onClick={() => toggleExpandPolyline(polyline.id)}
                      style={{ marginLeft: '5px' }}
                    >
                      {expandedPolylines.includes(polyline.id)
                        ? 'Collapse'
                        : 'Expand'}
                    </button>
                  </div>
                  {expandedPolylines.includes(polyline.id) && (
                    <div style={{ paddingLeft: '10px' }}>
                      {/* Editable Polyline Name */}
                      <div style={{ marginBottom: '5px' }}>
                        <label>
                          Name:
                          <input
                            type="text"
                            value={polyline.name}
                            onChange={(e) =>
                              updatePolylineField(
                                polyline.id,
                                'name',
                                e.target.value
                              )
                            }
                            style={{ marginLeft: '5px', width: '70%' }}
                          />
                        </label>
                      </div>
                      {/* Link Settings */}
                      <div style={{ marginBottom: '5px' }}>
                        <label>
                          Forward:
                          <select
                            value={polyline.links.forward || ''}
                            onChange={(e) =>
                              updatePolylineField(polyline.id, 'links', {
                                ...polyline.links,
                                forward: e.target.value || undefined,
                              })
                            }
                            style={{ marginLeft: '5px', width: '70%' }}
                          >
                            <option value="">None</option>
                            {polylines
                              .filter((p) => p.id !== polyline.id)
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      </div>
                      <div style={{ marginBottom: '5px' }}>
                        <label>
                          Forward Left:
                          <select
                            value={polyline.links.forward_left || ''}
                            onChange={(e) =>
                              updatePolylineField(polyline.id, 'links', {
                                ...polyline.links,
                                forward_left: e.target.value || undefined,
                              })
                            }
                            style={{ marginLeft: '5px', width: '70%' }}
                          >
                            <option value="">None</option>
                            {polylines
                              .filter((p) => p.id !== polyline.id)
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      </div>
                      <div style={{ marginBottom: '5px' }}>
                        <label>
                          Forward Right:
                          <select
                            value={polyline.links.forward_right || ''}
                            onChange={(e) =>
                              updatePolylineField(polyline.id, 'links', {
                                ...polyline.links,
                                forward_right: e.target.value || undefined,
                              })
                            }
                            style={{ marginLeft: '5px', width: '70%' }}
                          >
                            <option value="">None</option>
                            {polylines
                              .filter((p) => p.id !== polyline.id)
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      </div>
                      {/* Points list */}
                      {polyline.points.length > 0 && (
                        <ul style={{ paddingLeft: '10px', marginTop: '5px' }}>
                          {polyline.points.map((point, index) => (
                            <li
                              key={index}
                              style={{
                                fontSize: '0.9em',
                                marginTop: '5px',
                                cursor: 'pointer',
                                backgroundColor:
                                  selectedPoint &&
                                  selectedPoint.polylineId === polyline.id &&
                                  selectedPoint.pointIndex === index
                                    ? '#efefef'
                                    : 'transparent',
                                padding: '2px 5px',
                                borderRadius: '3px',
                              }}
                              onClick={() =>
                                handleSelectPoint(polyline.id, index)
                              }
                            >
                              <div>
                                <strong>Point {index + 1}</strong>: (
                                {point.x.toFixed(1)}, {point.y.toFixed(1)})
                              </div>
                              <div>
                                <label>
                                  Attribute:
                                  <input
                                    type="text"
                                    placeholder="Attribute"
                                    value={point.attribute}
                                    onChange={(e) =>
                                      updatePointAttribute(
                                        polyline.id,
                                        index,
                                        'attribute',
                                        e.target.value
                                      )
                                    }
                                    style={{
                                      marginLeft: '5px',
                                      width: '70%',
                                    }}
                                  />
                                </label>
                              </div>
                              <div>
                                <label>
                                  Height:
                                  <input
                                    type="number"
                                    value={point.height}
                                    onChange={(e) =>
                                      updatePointAttribute(
                                        polyline.id,
                                        index,
                                        'height',
                                        e.target.value
                                      )
                                    }
                                    style={{
                                      marginLeft: '5px',
                                      width: '70%',
                                    }}
                                  />
                                </label>
                              </div>
                              <div>
                                <label>
                                  Visibility:
                                  <input
                                    type="number"
                                    value={point.visibility}
                                    onChange={(e) =>
                                      updatePointAttribute(
                                        polyline.id,
                                        index,
                                        'visibility',
                                        e.target.value
                                      )
                                    }
                                    style={{
                                      marginLeft: '5px',
                                      width: '70%',
                                    }}
                                  />
                                </label>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deletePoint(polyline.id, index);
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
            <p>
              <em>
                Click anywhere in the canvas to add a point to the active polyline.
              </em>
            </p>
          </div>
        </div>
      </div>
    );
  };
  
  export default Home;
  