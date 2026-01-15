"use client";

import React, { useRef, useState, useEffect } from "react";
import { getStroke } from "perfect-freehand";
import { getSvgPathFromStroke, Stroke, Point } from "./Renderer";
import { PeerData } from "@/hooks/usePeer";

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

    const toWorld = (clientPoint: { x: number, y: number, pressure?: number }) => {
        return {
            x: (clientPoint.x - transform.x) / transform.scale,
            y: (clientPoint.y - transform.y) / transform.scale,
            pressure: clientPoint.pressure ?? 0.5,
        };
    };

    useEffect(() => {
        if (!remoteData) return;
        if (remoteData.type !== 'STROKE') return;

        const payload = remoteData.payload;
        const { action, point, tool, color } = payload;

        if (!containerRef.current) return;
        const { width, height } = containerRef.current.getBoundingClientRect();

        // Convert normalized point to screen pixel point
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

    const handlePointerDown = (e: React.PointerEvent) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        if (e.buttons !== 1) return;

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
        if (e.buttons !== 1 || !currentStroke) return;
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
        if (!currentStroke) return;

        setStrokes([...strokes, currentStroke]);
        onStrokeComplete(currentStroke);
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
        const outline = getStroke(stroke.points, {
            size: stroke.size,
            thinning: 0.5,
            smoothing: 0.5,
            streamline: 0.5,
            simulatePressure: true,
        });
        return getSvgPathFromStroke(outline);
    };

    return (
        <div
            ref={containerRef}
            className="w-full h-full bg-neutral-50 overflow-hidden relative cursor-crosshair touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
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
                        <path d={renderStroke(remoteStroke)} fill={remoteStroke.color} className="opacity-90" />
                    )}
                </svg>
            </div>
        </div>
    );
}
