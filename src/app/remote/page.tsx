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

const Joystick = ({ onPan }: { onPan: (dx: number, dy: number) => void }) => {
    const stickRef = useRef<HTMLDivElement>(null);
    const active = useRef(false);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const startPos = useRef({ x: 0, y: 0 });
    const animationFrame = useRef<number>(0);

    const handleStart = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        active.current = true;
        stickRef.current?.setPointerCapture(e.pointerId);
        startPos.current = { x: e.clientX, y: e.clientY };

        loop();
    };

    const loop = () => {
        // Warning: this loop might be orphaned if component unmounts?
        // Relying on useEffect/animationFrame is better.
        // We have a useEffect below that starts the loop.
    };

    const handleMoveVelocity = (e: React.PointerEvent) => {
        if (!active.current) return;
        e.preventDefault();
        e.stopPropagation();

        const maxDist = 40;
        const dx = e.clientX - startPos.current.x;
        const dy = e.clientY - startPos.current.y;
        const dist = Math.hypot(dx, dy);

        const clampedDist = Math.min(dist, maxDist);
        const angle = Math.atan2(dy, dx);

        const x = Math.cos(angle) * clampedDist;
        const y = Math.sin(angle) * clampedDist;

        setPos({ x, y });

        // Normalize vector (-1 to 1)
        currentVector.current = { x: x / maxDist, y: y / maxDist };
    };

    const currentVector = useRef({ x: 0, y: 0 });

    useEffect(() => {
        let frame: number;
        const run = () => {
            if (active.current) {
                // Apply pan based on vector
                const speed = 15; // px per frame
                if (Math.abs(currentVector.current.x) > 0.1 || Math.abs(currentVector.current.y) > 0.1) {
                    onPan(-currentVector.current.x * speed, -currentVector.current.y * speed);
                }
            }
            frame = requestAnimationFrame(run);
        };
        run();
        return () => cancelAnimationFrame(frame);
    }, [onPan]);

    const handleEnd = (e: React.PointerEvent) => {
        active.current = false;
        setPos({ x: 0, y: 0 });
        currentVector.current = { x: 0, y: 0 };
    };

    return (
        <div
            className="w-24 h-24 rounded-full bg-neutral-800/80 border border-neutral-600 backdrop-blur flex items-center justify-center touch-none shadow-2xl"
            onPointerDown={handleStart}
            onPointerMove={handleMoveVelocity}
            onPointerUp={handleEnd}
            onPointerCancel={handleEnd}
        >
            <div
                ref={stickRef}
                className="w-10 h-10 rounded-full bg-indigo-500 shadow-inner"
                style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
            />
            {/* Icons for direction hints */}
            <div className="absolute top-1 left-1/2 -translate-x-1/2 text-neutral-500/50 text-[10px]">▲</div>
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-neutral-500/50 text-[10px]">▼</div>
            <div className="absolute left-1 top-1/2 -translate-y-1/2 text-neutral-500/50 text-[10px]">◀</div>
            <div className="absolute right-1 top-1/2 -translate-y-1/2 text-neutral-500/50 text-[10px]">▶</div>
        </div>
    );
};

function RemoteContent() {
    const searchParams = useSearchParams();
    const hostId = searchParams.get("hostId");
    const { connectToHost, sendData, isConnected, isReady, setOnData } = usePeer();

    const [activeTool, setActiveTool] = useState<'PEN' | 'ERASER'>('PEN');
    const [activeColor, setActiveColor] = useState<string>(COLORS[0].value);
    const [showColorModal, setShowColorModal] = useState(false);

    const [trail, setTrail] = useState<{ x: number, y: number }[]>([]);
    const [mirroredStrokes, setMirroredStrokes] = useState<any[]>([]);
    const [hostTransform, setHostTransform] = useState({ x: 0, y: 0, scale: 1 });
    const [hostDimensions, setHostDimensions] = useState({ width: 1920, height: 1080 });

    const padRef = useRef<HTMLDivElement>(null);
    const pointers = useRef<Map<number, { x: number, y: number }>>(new Map());

    useEffect(() => {
        if (hostId && isReady) connectToHost(hostId);
    }, [hostId, isReady, connectToHost]);

    // Listen for Sync Data
    useEffect(() => {
        setOnData((data: PeerData) => {
            if (data.type === 'STROKE_ADDED') {
                if (data.payload.stroke) setMirroredStrokes(prev => [...prev, data.payload.stroke]);
            }
            if (data.type === 'SYNC_STROKES') {
                if (Array.isArray(data.payload.strokes)) setMirroredStrokes(data.payload.strokes);
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

        const normalizedPoint = {
            x: (e.clientX - rect.left) / rect.width,
            y: (e.clientY - rect.top) / rect.height,
            pressure: e.pressure
        };

        sendData({
            type: 'STROKE',
            payload: {
                action,
                point: normalizedPoint,
                tool: activeTool,
                color: activeColor,
                ratio: rect.width / rect.height
            }
        });

        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

        // Single touch only for drawing now
        if (pointers.current.size > 1) return;

        const pt = sendStrokeEvent('START', e);
        if (pt) setTrail([pt]);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        e.preventDefault();
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (e.buttons !== 1 || pointers.current.size > 1) return;
        const pt = sendStrokeEvent('MOVE', e);
        if (pt) setTrail(prev => [...prev, pt]);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        e.preventDefault();
        pointers.current.delete(e.pointerId);
        if (pointers.current.size === 0) {
            sendStrokeEvent('END', e);
            setTrail([]);
        }
    };

    const handleJoystickPan = (dx: number, dy: number) => {
        sendData({
            type: 'PAN_ZOOM',
            payload: { scaleFactor: 1, deltaX: dx, deltaY: dy }
        });
    };

    const handleClearCanvas = () => {
        if (window.confirm("Clear Canvas?")) sendData({ type: 'CLEAR', payload: {} });
    };

    const mapColor = (c: string) => {
        if (c === '#000000' || c === '#000') return '#ffffff';
        if (c === '#fafafa' || c === '#ffffff') return '#171717';
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

    const vx = -(hostTransform.x || 0) / (hostTransform.scale || 1);
    const vy = -(hostTransform.y || 0) / (hostTransform.scale || 1);
    const vw = (hostDimensions.width || 1920) / (hostTransform.scale || 1);
    const vh = (hostDimensions.height || 1080) / (hostTransform.scale || 1);

    return (
        <div className="fixed inset-0 bg-neutral-950 text-white flex flex-col select-none overscroll-none overflow-hidden touch-none">
            {/* Status Dot */}
            <div className="absolute top-2 left-2 z-20 flex items-center gap-2 bg-neutral-900/40 backdrop-blur rounded-full px-3 py-1 pointer-events-none">
                <div className={cn("w-2 h-2 rounded-full", isConnected ? "bg-green-500" : "bg-red-500")} />
                <span className="text-[10px] text-neutral-400 font-mono">{isConnected ? "ONLINE" : "OFFLINE"}</span>
            </div>

            {/* Drawing Surface */}
            <div
                ref={padRef}
                className="absolute inset-0 z-0 bg-neutral-900"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={handlePointerUp}
            >
                <div className="absolute inset-0 pointer-events-none opacity-50">
                    <svg className="w-full h-full" viewBox={`${vx} ${vy} ${vw} ${vh}`} preserveAspectRatio="xMidYMid slice">
                        {mirroredStrokes.map((s, i) => (
                            <path key={i} d={renderMirroredStroke(s)} fill={mapColor(s.color)} />
                        ))}
                    </svg>
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

            {/* Joystick - Bottom Right (Portrait) / Top Right (Landscape) */}
            <div className="absolute bottom-28 right-6 z-30 landscape:top-1/2 landscape:right-6 landscape:bottom-auto landscape:-translate-y-1/2 opacity-70 hover:opacity-100 transition-opacity">
                <Joystick onPan={handleJoystickPan} />
            </div>

            {/* Toolbar - Bottom Center (Portrait) / Left Center (Landscape) */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 landscape:bottom-auto landscape:left-6 landscape:top-1/2 landscape:translate-x-0 landscape:-translate-y-1/2 flex landscape:flex-col items-center gap-6 bg-neutral-800/90 backdrop-blur border border-neutral-700 p-3 rounded-full shadow-2xl z-30 pb-safe landscape:pb-3 landscape:pr-safe">
                <button onClick={() => setActiveTool('PEN')} className={cn("p-4 rounded-full transition-all", activeTool === 'PEN' ? "bg-indigo-500 text-white shadow-lg scale-110" : "text-neutral-400 hover:text-white")}>
                    <Edit2 size={24} />
                </button>

                {/* Color Trigger (opens modal) */}
                <button
                    onClick={() => setShowColorModal(true)}
                    className="w-12 h-12 rounded-full border-2 border-white/50 shadow-inner shrink-0 hover:scale-105 transition-transform"
                    style={{ backgroundColor: activeColor }}
                />

                <button onClick={() => setActiveTool('ERASER')} className={cn("p-4 rounded-full transition-all", activeTool === 'ERASER' ? "bg-rose-500 text-white shadow-lg scale-110" : "text-neutral-400 hover:text-white")}>
                    <Eraser size={24} />
                </button>

                <div className="w-px h-8 landscape:w-8 landscape:h-px bg-neutral-700 mx-1 landscape:my-1" />

                <button onClick={handleClearCanvas} className="p-4 rounded-full text-neutral-400 hover:text-red-400 hover:bg-red-900/30 transition-all">
                    <Trash2 size={24} />
                </button>
            </div>

            {/* Color Picker Modal */}
            {showColorModal && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200" onClick={() => setShowColorModal(false)}>
                    <div className="bg-neutral-900 border border-neutral-700 p-6 rounded-3xl w-full max-w-sm grid grid-cols-4 gap-4 shadow-2xl scale-100" onClick={e => e.stopPropagation()}>
                        {COLORS.map(c => (
                            <button
                                key={c.name}
                                onClick={() => { setActiveColor(c.value); setActiveTool('PEN'); setShowColorModal(false); }}
                                className={cn("aspect-square rounded-2xl shadow-lg border-2 transition-transform active:scale-95", activeColor === c.value ? "border-white transform scale-110" : "border-transparent opacity-80 hover:opacity-100")}
                                style={{ backgroundColor: c.value }}
                            />
                        ))}
                    </div>
                </div>
            )}
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
