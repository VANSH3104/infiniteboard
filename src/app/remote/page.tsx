"use client";

import React, { useEffect, useState, useRef } from "react";
import { usePeer } from "@/hooks/usePeer";
import { useSearchParams } from "next/navigation";
import { Edit2, Eraser, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

const COLORS = [
    { name: "Black", value: "#000000" },
    { name: "Red", value: "#ef4444" },
    { name: "Blue", value: "#3b82f6" },
    { name: "Green", value: "#22c55e" },
    { name: "Purple", value: "#a855f7" },
    { name: "Orange", value: "#f97316" },
];

export default function RemotePage() {
    const searchParams = useSearchParams();
    const hostId = searchParams.get("hostId");
    const { connectToHost, sendData, isConnected } = usePeer();
    const [activeTool, setActiveTool] = useState<'PEN' | 'ERASER'>('PEN');
    const [activeColor, setActiveColor] = useState<string>(COLORS[0].value);
    const [trail, setTrail] = useState<{ x: number, y: number }[]>([]);

    const padRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (hostId) {
            const timer = setTimeout(() => {
                connectToHost(hostId);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [hostId]);

    // -------- INPUT HANDLING (NORMALIZED) --------
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

        sendData({
            type: 'STROKE',
            payload: {
                action,
                point: normalizedPoint,
                tool: activeTool,
                color: activeColor // Send selected color
            }
        });

        return { x: relativeX, y: relativeY };
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
        const pt = sendStrokeEvent('START', e);
        if (pt) setTrail([pt]);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        e.preventDefault();
        if (e.buttons !== 1) return;
        const pt = sendStrokeEvent('MOVE', e);
        if (pt) setTrail(prev => [...prev, pt]);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        e.preventDefault();
        sendStrokeEvent('END', e);
        setTrail([]);
    };

    useEffect(() => {
        const preventDefault = (e: Event) => e.preventDefault();
        document.body.addEventListener('touchmove', preventDefault, { passive: false });
        return () => document.body.removeEventListener('touchmove', preventDefault);
    }, []);

    if (!hostId) {
        return (
            <div className="flex items-center justify-center h-screen bg-neutral-900 text-white p-6 text-center">
                <p>No Host ID found. Please scan the QR code again.</p>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-neutral-950 text-white flex flex-col select-none overscroll-none">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md z-10">
                <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", isConnected ? "bg-green-500 shadow-[0_0_10px_#22c55e]" : "bg-red-500 animate-pulse")} />
                    <span className="text-xs font-mono text-neutral-400">
                        {isConnected ? "CONNECTED" : "CONNECTING..."}
                    </span>
                </div>
                {!isConnected && <Loader2 className="animate-spin text-neutral-600" size={16} />}
                <div className="text-xs text-neutral-600 font-mono">ID: {hostId.slice(0, 4)}...</div>
            </div>

            {/* Touch Surface */}
            <div
                ref={padRef}
                className="flex-1 w-full bg-neutral-900 relative touch-none cursor-none overflow-hidden"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
                    <div className="grid grid-cols-6 grid-rows-6 w-full h-full">
                        {[...Array(36)].map((_, i) => (
                            <div key={i} className="border border-white/20" />
                        ))}
                    </div>
                </div>

                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-neutral-800 font-bold text-4xl tracking-widest opacity-20 transform -rotate-12">
                        PAD AREA
                    </span>
                </div>

                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    <polyline
                        points={trail.map(p => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke={activeTool === 'ERASER' ? '#ffffff' : activeColor}
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={0.6}
                    />
                </svg>
            </div>

            {/* Toolbar */}
            <div className="bg-neutral-900 border-t border-neutral-800 z-10 w-full flex flex-col">

                {/* Color Palette */}
                {activeTool === 'PEN' && (
                    <div className="flex items-center gap-3 p-4 overflow-x-auto no-scrollbar justify-center">
                        {COLORS.map((c) => (
                            <button
                                key={c.name}
                                onClick={() => setActiveColor(c.value)}
                                className={cn(
                                    "w-8 h-8 rounded-full border-2 transition-all",
                                    activeColor === c.value ? "border-white scale-110" : "border-transparent"
                                )}
                                style={{ backgroundColor: c.value }}
                            />
                        ))}
                    </div>
                )}

                {/* Tools */}
                <div className="flex items-center justify-center gap-6 p-4 pb-8 border-t border-neutral-800">
                    <button
                        onClick={() => setActiveTool('PEN')}
                        className={cn(
                            "flex flex-col items-center gap-2 transition-all p-3 rounded-2xl w-24",
                            activeTool === 'PEN'
                                ? "bg-neutral-800 text-white"
                                : "text-neutral-500"
                        )}
                    >
                        <Edit2 size={20} className={activeTool === 'PEN' ? "text-indigo-400" : ""} />
                        <span className="text-[10px] font-medium uppercase tracking-wider">Pen</span>
                    </button>

                    <button
                        onClick={() => setActiveTool('ERASER')}
                        className={cn(
                            "flex flex-col items-center gap-2 transition-all p-3 rounded-2xl w-24",
                            activeTool === 'ERASER'
                                ? "bg-neutral-800 text-white"
                                : "text-neutral-500"
                        )}
                    >
                        <Eraser size={20} className={activeTool === 'ERASER' ? "text-rose-400" : ""} />
                        <span className="text-[10px] font-medium uppercase tracking-wider">Eraser</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
