"use client";

import React, { useRef, useState, useEffect } from "react";
import { getStroke } from "perfect-freehand";
import { getSvgPathFromStroke, Stroke, Point } from "./Renderer";
import { PeerData, usePeer } from "@/hooks/usePeer";
import { ZoomIn, ZoomOut, Maximize, Trash2, Smartphone, Github } from "lucide-react";
import { DataConnection } from "peerjs";

interface InfiniteCanvasProps {
    onStrokeComplete: (stroke: Stroke) => void;
    remoteData: { data: PeerData, peerId: string } | null;
    broadcast: (data: PeerData) => void;
    connections: DataConnection[];
}

export default function InfiniteCanvas({
    onStrokeComplete,
    remoteData,
    broadcast,
    connections
}: InfiniteCanvasProps) {
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
    const [remoteStroke, setRemoteStroke] = useState<Stroke | null>(null);
    const [remoteRatio, setRemoteRatio] = useState<number | null>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [peerStates, setPeerStates] = useState<Record<string, { transform: { x: number, y: number, scale: number }, dimensions: { width: number, height: number } }>>({});

    const containerRef = useRef<HTMLDivElement>(null);
    const prevConnectionCount = useRef(0);
    const connectionCount = connections.length;

    // Persistence
    useEffect(() => {
        try {
            const saved = localStorage.getItem('infinite-pad-strokes');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) setStrokes(parsed);
            }
        } catch (e) {
            console.error("Failed to load strokes", e);
        }
    }, []);

    useEffect(() => {
        if (strokes.length > 0) {
            try {
                localStorage.setItem('infinite-pad-strokes', JSON.stringify(strokes));
            } catch (e) { }
        }
    }, [strokes]);

    // Track Dimensions
    useEffect(() => {
        if (!containerRef.current) return;
        const obs = new ResizeObserver(entries => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                setDimensions({ width, height });
            }
        });
        obs.observe(containerRef.current);
        return () => obs.disconnect();
    }, []);

    // Clean up disconnected peers from state
    useEffect(() => {
        const connectedIds = new Set(connections.map(c => c.peer));
        setPeerStates(prev => {
            const next = { ...prev };
            let changed = false;
            for (const key in next) {
                if (!connectedIds.has(key)) {
                    delete next[key];
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
    }, [connections]);

    // Sync Everything (FULL) when connection count increases
    useEffect(() => {
        if (connectionCount > prevConnectionCount.current) {
            broadcast({ type: 'SYNC_STROKES', payload: { strokes } });
            broadcast({ type: 'SYNC_TRANSFORM', payload: { transform } });
            broadcast({ type: 'SYNC_DIMENSIONS', payload: { dimensions } });
        }
        prevConnectionCount.current = connectionCount;
    }, [connectionCount, strokes, transform, dimensions, broadcast]);

    // Individual Broadcasts
    useEffect(() => {
        broadcast({ type: 'SYNC_TRANSFORM', payload: { transform } });
    }, [transform, broadcast]);

    useEffect(() => {
        broadcast({ type: 'SYNC_DIMENSIONS', payload: { dimensions } });
    }, [dimensions, broadcast]);

    // REMOVED: Heavy useEffect [strokes] broadcast.
    // Instead we broadcast incrementally.

    const clearCanvas = () => {
        setStrokes([]);
        try { localStorage.removeItem('infinite-pad-strokes'); } catch (e) { }
        broadcast({ type: 'SYNC_STROKES', payload: { strokes: [] } });
    };

    const toWorld = (clientPoint: { x: number, y: number, pressure?: number }) => {
        const safeScale = Number.isFinite(transform.scale) && transform.scale > 0 ? transform.scale : 1;
        const safeX = Number.isFinite(transform.x) ? transform.x : 0;
        const safeY = Number.isFinite(transform.y) ? transform.y : 0;

        return {
            x: (clientPoint.x - safeX) / safeScale,
            y: (clientPoint.y - safeY) / safeScale,
            pressure: clientPoint.pressure ?? 0.5,
        };
    };

    useEffect(() => {
        if (!remoteData) return;

        const { data, peerId } = remoteData;

        if (data.type === 'SYNC_TRANSFORM') {
            setPeerStates(prev => ({
                ...prev,
                [peerId]: {
                    ...prev[peerId],
                    transform: data.payload.transform,
                    dimensions: prev[peerId]?.dimensions || { width: 0, height: 0 }
                }
            }));
            return;
        }

        if (data.type === 'SYNC_DIMENSIONS') {
            setPeerStates(prev => ({
                ...prev,
                [peerId]: {
                    ...prev[peerId],
                    transform: prev[peerId]?.transform || { x: 0, y: 0, scale: 1 },
                    dimensions: data.payload.dimensions
                }
            }));
            return;
        }

        if (data.type === 'CLEAR') {
            clearCanvas();
            return;
        }

        if (data.type === 'PAN_ZOOM') {
            const { scaleFactor, deltaX, deltaY } = data.payload;
            setTransform(prev => {
                const currentScale = prev.scale || 1;
                const newScale = Math.min(Math.max(currentScale * (scaleFactor || 1), 0.1), 5);
                const sensitivity = 3.5;
                return {
                    x: (prev.x || 0) + ((deltaX || 0) * sensitivity),
                    y: (prev.y || 0) + ((deltaY || 0) * sensitivity),
                    scale: newScale
                };
            });
            return;
        }

        if (data.type !== 'STROKE') return;

        const payload = data.payload;
        const { action, point, tool, color, ratio } = payload;

        if (ratio && ratio !== remoteRatio) {
            setRemoteRatio(ratio);
        }

        if (!containerRef.current) return;
        const { width, height } = containerRef.current.getBoundingClientRect();

        if (!point) return;

        let screenPoint = { x: 0, y: 0, pressure: point.pressure || 0.5 };

        if (remoteRatio) {
            const targetHeight = height;
            const targetWidth = height * remoteRatio;
            const offsetX = (width - targetWidth) / 2;

            screenPoint = {
                x: offsetX + (point.x * targetWidth),
                y: point.y * targetHeight,
                pressure: point.pressure
            };
        } else {
            screenPoint = {
                x: point.x * width,
                y: point.y * height,
                pressure: point.pressure
            };
        }

        const worldPoint = toWorld(screenPoint);

        if (!Number.isFinite(worldPoint.x) || !Number.isFinite(worldPoint.y)) return;

        if (action === 'START') {
            setRemoteStroke({
                points: [worldPoint],
                color: tool === 'ERASER' ? '#fafafa' : (color || '#000000'),
                size: tool === 'ERASER' ? 40 : 8
            });
        } else if (action === 'MOVE') {
            setRemoteStroke(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    points: [...prev.points, worldPoint]
                };
            });
        } else if (action === 'END') {
            setRemoteStroke(prev => {
                if (prev) {
                    const newStrokes = [...strokes, prev];
                    setStrokes(newStrokes);
                    // Broadcast NEW stroke to remotes
                    broadcast({ type: 'STROKE_ADDED', payload: { stroke: prev } });
                    return null;
                }
                return null;
            });
        }
    }, [remoteData, transform, remoteRatio, broadcast]); // Added broadcast to dep

    const pointers = useRef<Map<number, { x: number, y: number }>>(new Map());
    const prevPinchDist = useRef<number | null>(null);

    const handlePointerDown = (e: React.PointerEvent) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (pointers.current.size === 2) {
            const pts = Array.from(pointers.current.values());
            prevPinchDist.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            return;
        }

        if (e.buttons !== 1 || pointers.current.size > 1) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const point = {
            x: (e.clientX - rect.left - transform.x) / transform.scale,
            y: (e.clientY - rect.top - transform.y) / transform.scale,
            pressure: e.pressure,
        };

        setCurrentStroke({
            points: [point],
            color: "#000",
            size: 8,
        });
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (pointers.current.size === 2) {
            const pts = Array.from(pointers.current.values());
            const newDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);

            if (prevPinchDist.current) {
                // Calculate Center of Pinch
                const midX = (pts[0].x + pts[1].x) / 2;
                const midY = (pts[0].y + pts[1].y) / 2;

                const rect = e.currentTarget.getBoundingClientRect();
                const containerX = midX - rect.left;
                const containerY = midY - rect.top;

                const scaleFactor = newDist / prevPinchDist.current;
                const newScale = Math.min(Math.max(transform.scale * scaleFactor, 0.1), 5);

                // Effective zoom ratio
                const ratio = newScale / transform.scale;

                setTransform(prev => ({
                    scale: newScale,
                    x: containerX - ratio * (containerX - prev.x),
                    y: containerY - ratio * (containerY - prev.y)
                }));
            }
            prevPinchDist.current = newDist;
            return;
        }

        if (!currentStroke || pointers.current.size > 1) return;

        // Drawing
        const rect = e.currentTarget.getBoundingClientRect();
        const point = {
            x: (e.clientX - rect.left - transform.x) / transform.scale,
            y: (e.clientY - rect.top - transform.y) / transform.scale,
            pressure: e.pressure,
        };

        setCurrentStroke({
            ...currentStroke,
            points: [...currentStroke.points, point]
        });
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        pointers.current.delete(e.pointerId);
        prevPinchDist.current = null;

        if (!currentStroke) return;

        setStrokes([...strokes, currentStroke]);
        onStrokeComplete(currentStroke);

        // Broadcast local stroke
        broadcast({ type: 'STROKE_ADDED', payload: { stroke: currentStroke } });

        setCurrentStroke(null);
    };

    useEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const zoomSensitivity = 0.001;
                const delta = -e.deltaY * zoomSensitivity;
                const newScale = Math.min(Math.max(transform.scale + delta, 0.1), 5);
                setTransform(prev => ({ ...prev, scale: newScale }));
            } else {
                e.preventDefault();
                setTransform(prev => ({
                    ...prev,
                    x: prev.x - e.deltaX,
                    y: prev.y - e.deltaY,
                }));
            }
        };

        const container = containerRef.current;
        if (container) {
            container.addEventListener("wheel", handleWheel, { passive: false });
        }
        return () => {
            if (container) {
                container.removeEventListener("wheel", handleWheel);
            }
        }
    }, [transform]);

    const renderStroke = (stroke: Stroke) => {
        if (!stroke || !stroke.points || stroke.points.length === 0) return '';
        try {
            const outline = getStroke(stroke.points, {
                size: stroke.size,
                thinning: 0.5,
                smoothing: 0.5,
                streamline: 0.5,
                simulatePressure: true,
            });
            return getSvgPathFromStroke(outline);
        } catch (e) {
            console.error("Error rendering stroke", e);
            return '';
        }
    };

    const zoomIn = () => {
        setTransform(prev => {
            const newScale = Math.min(prev.scale * 1.2, 5);
            const ratio = newScale / prev.scale;
            const cx = dimensions.width / 2;
            const cy = dimensions.height / 2;
            return {
                scale: newScale,
                x: cx - ratio * (cx - prev.x),
                y: cy - ratio * (cy - prev.y)
            };
        });
    };

    const zoomOut = () => {
        setTransform(prev => {
            const newScale = Math.max(prev.scale / 1.2, 0.1);
            const ratio = newScale / prev.scale;
            const cx = dimensions.width / 2;
            const cy = dimensions.height / 2;
            return {
                scale: newScale,
                x: cx - ratio * (cx - prev.x),
                y: cy - ratio * (cy - prev.y)
            };
        });
    };
    const resetZoom = () => setTransform({ x: 0, y: 0, scale: 1 });

    return (
        <div
            ref={containerRef}
            className="w-full h-full bg-neutral-50 overflow-hidden relative cursor-crosshair touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
        >
            <div
                className="absolute top-0 left-0 w-full h-full origin-top-left will-change-transform"
                style={{
                    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                }}
            >
                <svg className="w-full h-full pointer-events-none overflow-visible">
                    {strokes.map((stroke, i) => (
                        <path key={i} d={renderStroke(stroke)} fill={stroke.color} />
                    ))}
                    {currentStroke && (
                        <path d={renderStroke(currentStroke)} fill={currentStroke.color} />
                    )}
                    {remoteStroke && (
                        <path d={renderStroke(remoteStroke)} fill={remoteStroke.color} className="opacity-90 transition-opacity" />
                    )}

                    {/* Peer Viewports */}
                    {Object.entries(peerStates).map(([id, state]) => {
                        if (!state.dimensions || state.dimensions.width === 0) return null;

                        const peerW = state.dimensions.width;
                        const peerH = state.dimensions.height;
                        const peerRatio = peerW / peerH;

                        // Logic matching the stroke mapping (Fitting to Height)
                        // We map the Peer's Screen Rect to the Host's Screen Rect
                        const hostH = dimensions.height;
                        const hostW = dimensions.width;

                        // Calculate Peer's Screen Rect on Host
                        const screenH = hostH;
                        const screenW = hostH * peerRatio;
                        const screenX = (hostW - screenW) / 2;
                        const screenY = 0;

                        // Convert Screen Rect to World Rect
                        // world = (screen - tx) / scale
                        const worldX = (screenX - transform.x) / transform.scale;
                        const worldY = (screenY - transform.y) / transform.scale;
                        const worldWidth = screenW / transform.scale;
                        const worldHeight = screenH / transform.scale;

                        return (
                            <g key={id}>
                                <rect
                                    x={worldX}
                                    y={worldY}
                                    width={worldWidth}
                                    height={worldHeight}
                                    fill="none"
                                    stroke="rgba(99, 102, 241, 0.3)"
                                    strokeWidth={1 / transform.scale}
                                    strokeDasharray={`${4 / transform.scale},${4 / transform.scale}`}
                                    className="pointer-events-none transition-all duration-300 ease-out"
                                />
                                <text
                                    x={worldX + (4 / transform.scale)}
                                    y={worldY + (12 / transform.scale)}
                                    fill="rgba(99, 102, 241, 0.5)"
                                    fontSize={10 / transform.scale}
                                    fontFamily="monospace"
                                    className="select-none pointer-events-none"
                                >
                                    {id.slice(0, 4)}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>

            <div
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute bottom-6 right-6 flex flex-col gap-2 bg-white/90 backdrop-blur shadow-lg rounded-xl p-2 border border-neutral-200"
            >
                <button onClick={zoomIn} className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-600 transition-colors" title="Zoom In">
                    <ZoomIn size={20} />
                </button>
                <button onClick={resetZoom} className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-600 transition-colors" title="Reset View">
                    <Maximize size={20} />
                </button>
                <button onClick={zoomOut} className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-600 transition-colors" title="Zoom Out">
                    <ZoomOut size={20} />
                </button>
                <button onClick={() => { if (confirm('Clear Canvas?')) clearCanvas() }} className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors border-t border-neutral-100 mt-1" title="Clear Canvas">
                    <Trash2 size={20} />
                </button>
                <div className="w-full h-px bg-neutral-200 my-1" />
                <a
                    href="https://github.com/VANSH3104"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-600 transition-colors flex justify-center"
                    title="View GitHub Profile"
                >
                    <Github size={20} />
                </a>
                <div className="text-[10px] text-center font-mono text-neutral-400 border-t pt-1 mt-1">
                    {(transform.scale * 100).toFixed(0)}%
                </div>
            </div>
        </div>
    );
}
