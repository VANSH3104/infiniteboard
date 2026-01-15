"use client";

import React, { useRef, useState, useEffect } from "react";
import { getStroke } from "perfect-freehand";
import { getSvgPathFromStroke, Stroke, Point } from "./Renderer";
import { PeerData } from "@/hooks/usePeer";
import { ZoomIn, ZoomOut, Maximize } from "lucide-react";

interface InfiniteCanvasProps {
    onStrokeComplete: (stroke: Stroke) => void;
    remoteData: PeerData | null;
}

export default function InfiniteCanvas({
    onStrokeComplete,
    remoteData,
}: InfiniteCanvasProps) {
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
    const [remoteStroke, setRemoteStroke] = useState<Stroke | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);

    // Persistence
    useEffect(() => {
        const saved = localStorage.getItem('infinite-pad-strokes');
        if (saved) {
            try {
                setStrokes(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to load strokes", e);
            }
        }
    }, []);

    useEffect(() => {
        if (strokes.length > 0) {
            localStorage.setItem('infinite-pad-strokes', JSON.stringify(strokes));
        }
    }, [strokes]);

    // Coordinate conversion
    const toWorld = (clientPoint: { x: number, y: number, pressure?: number }) => {
        return {
            x: (clientPoint.x - transform.x) / transform.scale,
            y: (clientPoint.y - transform.y) / transform.scale,
            pressure: clientPoint.pressure ?? 0.5,
        };
    };

    // Remote Data Handling
    useEffect(() => {
        if (!remoteData) return;

        // Handle ZOOM
        if (remoteData.type === 'ZOOM') {
            const { scaleFactor } = remoteData.payload;

            setTransform(prev => {
                const newScale = Math.min(Math.max(prev.scale * scaleFactor, 0.1), 5);
                // Optional: Adjust X/Y to zoom around center?
                // Simple approach: Center-ish zoom (requires adjusting x/y based on ratio)
                // But remote gives simple scalar.
                // Let's just scale for now.
                return {
                    ...prev,
                    scale: newScale
                };
            });
            return;
        }

        if (remoteData.type !== 'STROKE') return;

        const payload = remoteData.payload;
        const { action, point, tool, color } = payload;

        // Note: If panning happens while drawing, the stroke might shift if we rely on "current transform" for START.
        // Ideally we lock transform during remote stroke? Or just accept artifact.

        if (!containerRef.current) return;
        const { width, height } = containerRef.current.getBoundingClientRect();

        // Normalize -> Screen Pixel
        const screenPoint = {
            x: point.x * width,
            y: point.y * height,
            pressure: point.pressure
        };

        const worldPoint = toWorld(screenPoint);

        if (action === 'START') {
            setRemoteStroke({
                points: [worldPoint],
                color: tool === 'ERASER' ? '#ffffff' : (color || '#000000'),
                size: tool === 'ERASER' ? 20 : 8
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
                    setStrokes(current => [...current, prev]);
                    return null;
                }
                return null;
            });
        }
    }, [remoteData, transform]);

    // Local Touch / Pointer Handling
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
                const scaleFactor = newDist / prevPinchDist.current;
                const newScale = Math.min(Math.max(transform.scale * scaleFactor, 0.1), 5);
                setTransform(prev => ({
                    ...prev,
                    scale: newScale
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
        setCurrentStroke(null);
    };

    // Wheel Zoom
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
        const outline = getStroke(stroke.points, {
            size: stroke.size,
            thinning: 0.5,
            smoothing: 0.5,
            streamline: 0.5,
            simulatePressure: true,
        });
        return getSvgPathFromStroke(outline);
    };

    // Zoom Helpers
    const zoomIn = () => setTransform(p => ({ ...p, scale: Math.min(p.scale * 1.2, 5) }));
    const zoomOut = () => setTransform(p => ({ ...p, scale: Math.max(p.scale / 1.2, 0.1) }));
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
                </svg>
            </div>

            {/* Zoom Controls */}
            <div className="absolute bottom-6 right-6 flex flex-col gap-2 bg-white/90 backdrop-blur shadow-lg rounded-xl p-2 border border-neutral-200">
                <button onClick={zoomIn} className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-600 transition-colors" title="Zoom In">
                    <ZoomIn size={20} />
                </button>
                <button onClick={resetZoom} className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-600 transition-colors" title="Reset View">
                    <Maximize size={20} />
                </button>
                <button onClick={zoomOut} className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-600 transition-colors" title="Zoom Out">
                    <ZoomOut size={20} />
                </button>
                <div className="text-[10px] text-center font-mono text-neutral-400 border-t pt-1 mt-1">
                    {(transform.scale * 100).toFixed(0)}%
                </div>
            </div>
        </div>
    );
}
