"use client";

import React, { useEffect, useState, useRef, Suspense } from "react";
import { usePeer, PeerData } from "@/hooks/usePeer";
import { useSearchParams } from "next/navigation";
import { Edit2, Eraser, Loader2, Trash2, Move } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { getStroke } from "perfect-freehand";
import { getSvgPathFromStroke } from "@/components/Canvas/Renderer";

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

const COLORS = [
    { name: "Black", value: "#000000" },
    { name: "White", value: "#ffffff" },
    { name: "Red", value: "#ef4444" },
    { name: "Blue", value: "#3b82f6" },
    { name: "Green", value: "#22c55e" },
    { name: "Purple", value: "#a855f7" },
    { name: "Orange", value: "#f97316" },
];

function RemoteContent() {
    const searchParams = useSearchParams();
    const hostId = searchParams.get("hostId");
    const { connectToHost, sendData, isConnected, isReady, setOnData } = usePeer();

    const [activeTool, setActiveTool] = useState<'PEN' | 'ERASER' | 'MOVE'>('PEN');
    const [activeColor, setActiveColor] = useState<string>(COLORS[0].value);
    const [trail, setTrail] = useState<{ x: number, y: number }[]>([]);

    // Mirroring state
    const [mirroredStrokes, setMirroredStrokes] = useState<any[]>([]);
    const [hostTransform, setHostTransform] = useState({ x: 0, y: 0, scale: 1 });
    const [hostDimensions, setHostDimensions] = useState({ width: 1920, height: 1080 }); // Default fallback

    const padRef = useRef<HTMLDivElement>(null);
    const pointers = useRef<Map<number, { x: number, y: number }>>(new Map());
    const prevPinchDist = useRef<number | null>(null);
    const prevCentroid = useRef<{ x: number, y: number } | null>(null);
    const isZooming = useRef(false);

    useEffect(() => {
        if (hostId && isReady) {
            connectToHost(hostId);
        }
    }, [hostId, isReady, connectToHost]);

    // Listen for Sync Data
    useEffect(() => {
        setOnData((data: PeerData) => {
            if (data.type === 'STROKE_ADDED') {
                if (data.payload.stroke) {
                    setMirroredStrokes(prev => [...prev, data.payload.stroke]);
                }
            }
            if (data.type === 'SYNC_STROKES') {
                if (Array.isArray(data.payload.strokes)) {
                    setMirroredStrokes(data.payload.strokes);
                }
            }
            if (data.type === 'SYNC_TRANSFORM') {
                setHostTransform(data.payload.transform);
            }
            if (data.type === 'SYNC_DIMENSIONS') {
                setHostDimensions(data.payload.dimensions);
            }
        });
    }, [setOnData]);


    // -------- INPUT HANDLING --------
    const sendStrokeEvent = (action: 'START' | 'MOVE' | 'END', e: React.PointerEvent) => {
        if (!padRef.current) return;

        const rect = padRef.current.getBoundingClientRect();
        const relativeX = e.clientX - rect.left;
        const relativeY = e.clientY - rect.top;

        const normalizedPoint = {
            x: relativeX / rect.width,
            y: relativeY / rect.height,
            pressure: e.pressure
        };

        const ratio = rect.width / rect.height;

        sendData({
            type: 'STROKE',
            payload: {
                action,
                point: normalizedPoint,
                tool: activeTool === 'MOVE' ? 'PEN' : activeTool,
                color: activeColor,
                ratio: ratio
            }
        });

        return { x: relativeX, y: relativeY };
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

        // Multi-touch or Move Tool -> Zoom/Pan Mode
        if (pointers.current.size === 2 || activeTool === 'MOVE') {
            isZooming.current = true;

            const pts = Array.from(pointers.current.values());

            if (pointers.current.size === 2) {
                prevPinchDist.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
                prevCentroid.current = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
            } else {
                prevPinchDist.current = null;
                prevCentroid.current = { x: pts[0].x, y: pts[0].y };
            }

            setTrail([]);
            if (activeTool !== 'MOVE') {
                sendData({ type: 'STROKE', payload: { action: 'END', tool: activeTool } });
            }
            return;
        }

        if (pointers.current.size > 1 || isZooming.current) return;

        const pt = sendStrokeEvent('START', e);
        if (pt) setTrail([pt]);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        e.preventDefault();
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

        // Handle Pan/Zoom
        if (pointers.current.size === 2 || (activeTool === 'MOVE' && pointers.current.size === 1)) {
            const pts = Array.from(pointers.current.values());

            let newDist = 0;
            let newCentroid = { x: 0, y: 0 };

            if (pointers.current.size === 2) {
                newDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
                newCentroid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
            } else {
                newDist = 0;
                newCentroid = { x: pts[0].x, y: pts[0].y };
            }

            if (prevCentroid.current) {
                const scaleFactor = 1; // ZOOMS DISABLED
                const deltaX = newCentroid.x - prevCentroid.current.x;
                const deltaY = newCentroid.y - prevCentroid.current.y;

                if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
                    sendData({
                        type: 'PAN_ZOOM',
                        payload: { scaleFactor, deltaX, deltaY }
                    });
                }

                if (pointers.current.size === 2) prevPinchDist.current = newDist;
                prevCentroid.current = newCentroid;
            }
            return;
        }

        if (e.buttons !== 1 || pointers.current.size > 1 || isZooming.current) return;

        const pt = sendStrokeEvent('MOVE', e);
        if (pt) setTrail(prev => [...prev, pt]);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        e.preventDefault();
        pointers.current.delete(e.pointerId);

        if (activeTool === 'MOVE') {
            if (pointers.current.size === 0) {
                prevCentroid.current = null;
                isZooming.current = false;
            } else {
                const pts = Array.from(pointers.current.values());
                prevCentroid.current = { x: pts[0].x, y: pts[0].y };
            }
        } else {
            if (pointers.current.size < 2) {
                prevPinchDist.current = null;
                prevCentroid.current = null;
                if (pointers.current.size === 0) {
                    isZooming.current = false;
                }
            }
        }

        if (!isZooming.current && activeTool !== 'MOVE') {
            sendStrokeEvent('END', e);
            setTrail([]);
        }
    };

    const handleClearCanvas = () => {
        if (window.confirm("Clear Canvas?")) {
            sendData({ type: 'CLEAR', payload: {} });
        }
    };

    useEffect(() => {
        const preventDefault = (e: Event) => e.preventDefault();
        document.body.addEventListener('touchmove', preventDefault, { passive: false });
        document.body.addEventListener('gesturestart', preventDefault);
        return () => {
            document.body.removeEventListener('touchmove', preventDefault);
            document.body.removeEventListener('gesturestart', preventDefault);
        };
    }, []);

    const mapColor = (c: string) => {
        if (c === '#000000' || c === '#000') return '#ffffff';
        if (c === '#fafafa' || c === '#ffffff') return '#171717'; // Eraser matches bg-neutral-900
        return c;
    };

    const renderMirroredStroke = (stroke: any) => {
        if (!stroke.points) return '';
        const outline = getStroke(stroke.points, {
            size: stroke.size,
            thinning: 0.5,
            smoothing: 0.5,
            streamline: 0.5,
            simulatePressure: true,
        });
        return getSvgPathFromStroke(outline);
    };

    if (!hostId) return <div className="flex items-center justify-center h-screen bg-black text-white">No ID</div>;

    // Calculate ViewBox to match Host Viewport logic
    // WorldX = (ScreenX - Tx) / Scale
    // If ScreenX = 0, WorldX = -Tx / Scale
    const vx = -(hostTransform.x || 0) / (hostTransform.scale || 1);
    const vy = -(hostTransform.y || 0) / (hostTransform.scale || 1);
    const vw = (hostDimensions.width || 1920) / (hostTransform.scale || 1);
    const vh = (hostDimensions.height || 1080) / (hostTransform.scale || 1);

    return (
        <div className="fixed inset-0 bg-neutral-950 text-white flex flex-col select-none overscroll-none overflow-hidden">
            {/* Status Dot */}
            <div className="absolute top-2 left-2 z-20 flex items-center gap-2 bg-neutral-900/40 backdrop-blur rounded-full px-3 py-1 pointer-events-none">
                <div className={cn("w-2 h-2 rounded-full", isConnected ? "bg-green-500" : "bg-red-500")} />
                <span className="text-[10px] text-neutral-400 font-mono">{isConnected ? "ONLINE" : "OFFLINE"}</span>
            </div>

            {/* Touch Surface */}
            <div
                ref={padRef}
                className="flex-1 w-full relative touch-none cursor-none overflow-hidden bg-neutral-900"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={handlePointerUp}
            >
                <div className="absolute inset-0 pointer-events-none opacity-50">
                    {/* Render EXACTLY what the host sees by matching viewBox */}
                    <svg
                        className="w-full h-full"
                        viewBox={`${vx} ${vy} ${vw} ${vh}`}
                        preserveAspectRatio="xMidYMid slice" // Fill the phone screen 
                    >
                        {mirroredStrokes.map((s, i) => (
                            <path key={i} d={renderMirroredStroke(s)} fill={mapColor(s.color)} />
                        ))}
                    </svg>
                </div>

                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
                    <div className="w-1 h-1 bg-white rounded-full mx-auto" />
                </div>

                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    <polyline
                        points={trail.map(p => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke={activeTool === 'ERASER' ? '#171717' : activeColor}
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </div>

            {/* Toolbar */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-neutral-800/90 backdrop-blur border border-neutral-700 p-2 rounded-3xl shadow-2xl z-30 pb-safe max-w-[90vw] overflow-hidden">
                <button
                    onClick={() => setActiveTool('PEN')}
                    className={cn("p-3 rounded-full transition-all shrink-0", activeTool === 'PEN' ? "bg-indigo-500 text-white shadow-lg" : "text-neutral-400")}
                >
                    <Edit2 size={20} />
                </button>

                <button
                    onClick={() => setActiveTool('MOVE')}
                    className={cn("p-3 rounded-full transition-all shrink-0", activeTool === 'MOVE' ? "bg-blue-500 text-white shadow-lg" : "text-neutral-400")}
                >
                    <Move size={20} />
                </button>

                {activeTool === 'PEN' && (
                    <div className="flex gap-2 px-2 overflow-x-auto overflow-y-hidden no-scrollbar w-auto touch-pan-x pointer-events-auto">
                        {COLORS.slice(0, 5).map(c => (
                            <button
                                key={c.name}
                                onClick={() => setActiveColor(c.value)}
                                className={cn("w-6 h-6 rounded-full border-2 shrink-0", activeColor === c.value ? "border-white" : "border-transparent")}
                                style={{ backgroundColor: c.value }}
                            />
                        ))}
                    </div>
                )}

                <button
                    onClick={() => setActiveTool('ERASER')}
                    className={cn("p-3 rounded-full transition-all shrink-0", activeTool === 'ERASER' ? "bg-rose-500 text-white shadow-lg" : "text-neutral-400")}
                >
                    <Eraser size={20} />
                </button>

                <div className="w-px h-6 bg-neutral-700 mx-1 shrink-0" />

                <button
                    onClick={handleClearCanvas}
                    className="p-3 rounded-full text-neutral-400 hover:text-red-400 hover:bg-red-900/30 transition-all shrink-0"
                >
                    <Trash2 size={20} />
                </button>
            </div>
        </div>
    );
}

export default function RemotePage() {
    return (
        <Suspense fallback={<div className="flex h-screen items-center justify-center bg-black text-white">Loading...</div>}>
            <RemoteContent />
        </Suspense>
    );
}
