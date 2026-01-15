"use client";

import { useEffect, useState } from "react";
import InfiniteCanvas from "@/components/Canvas/InfiniteCanvas";
import { usePeer } from "@/hooks/usePeer";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, Smartphone, Users } from "lucide-react";

export default function Home() {
  const { peerId, connections, isConnected, broadcast, setOnData } = usePeer();
  const [remoteData, setRemoteData] = useState<any>(null);

  useEffect(() => {
    setOnData((data) => {
      setRemoteData(data);
    });
  }, [setOnData]);

  const currentUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const connectUrl = `${currentUrl}/remote?hostId=${peerId}`;

  return (
    <main className="flex min-h-screen flex-col items-center justify-between">
      <div className="z-10 w-full h-screen relative font-sans overflow-hidden">
        <InfiniteCanvas
          onStrokeComplete={(stroke) => {
            // handled internally
          }}
          remoteData={remoteData}
          broadcast={broadcast}
          connectionCount={connections.length}
        />

        {/* Overlay UI */}
        <div className="absolute top-6 left-6 flex flex-col gap-4 pointer-events-none">
          <div className="bg-white/90 backdrop-blur shadow-xl rounded-2xl p-6 border border-neutral-100 pointer-events-auto transition-all duration-300 origin-top-left">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent mb-1">
              Infinite Board
            </h1>
            <p className="text-neutral-500 text-sm mb-4">
              Scan to connect your phone
            </p>

            {peerId ? (
              <div className="flex flex-col gap-4">
                <div className="bg-white p-2 rounded-xl border border-neutral-100 shadow-inner w-fit">
                  <QRCodeSVG value={connectUrl} size={160} />
                </div>
                <div className="flex items-center gap-2 text-xs font-mono text-neutral-400">
                  <span className="select-all">ID: {peerId}</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 w-[160px]">
                <Loader2 className="animate-spin text-indigo-500" size={32} />
                <span className="text-xs text-neutral-400">Initializing Host...</span>
              </div>
            )}
          </div>

          {/* Connection Status Pill */}
          <div className="flex items-center gap-3 bg-neutral-900/90 backdrop-blur text-white px-4 py-2 rounded-full shadow-lg w-fit pointer-events-auto">
            <div className="relative">
              <Smartphone size={16} className={isConnected ? "text-green-400" : "text-neutral-500"} />
              {isConnected && <span className="absolute -top-1 -right-1 flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span></span>}
            </div>
            <span className="text-sm font-medium">
              {connections.length} Device{connections.length !== 1 && 's'} Connected
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
