"use client";

import React, { useEffect, useState, useRef } from "react";
import InfiniteCanvas from "@/components/Canvas/InfiniteCanvas";
import { usePeer, PeerData } from "@/hooks/usePeer";
import { QRCodeSVG } from "qrcode.react";
import { motion, AnimatePresence } from "framer-motion";
import { Smartphone, X, Link as LinkIcon, Share2 } from "lucide-react";

export default function Home() {
  const { peerId, connections, setOnData, isConnected } = usePeer();
  const [remoteData, setRemoteData] = useState<PeerData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(true);
  const [remoteUrl, setRemoteUrl] = useState("");

  useEffect(() => {
    if (peerId) {
      // Construct the URL for the remote device
      // Assuming drawing-pad.vercel.app or localhost
      const baseUrl = window.location.origin;
      const url = `${baseUrl}/remote?hostId=${peerId}`;
      setRemoteUrl(url);
    }
  }, [peerId]);

  useEffect(() => {
    // Pipe peer data to state for the canvas
    setOnData((data) => {
      setRemoteData(data);
    });
  }, [setOnData]);

  // Auto-close modal on connection
  useEffect(() => {
    if (isConnected) {
      setIsModalOpen(false);
    }
  }, [isConnected]);

  return (
    <main className="w-screen h-screen overflow-hidden bg-neutral-100 text-neutral-900 font-sans selection:bg-indigo-100">
      {/* Canvas Layer */}
      <div className="absolute inset-0 z-0">
        <InfiniteCanvas
          onStrokeComplete={() => { }}
          remoteData={remoteData}
        />
      </div>

      {/* UI Overlay */}
      <div className="absolute top-6 left-6 z-10 flex flex-col gap-4 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2"
        >
          <div className="bg-white/80 backdrop-blur-md p-3 rounded-2xl shadow-sm border border-white/20 pointer-events-auto">
            <h1 className="font-bold text-lg tracking-tight bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
              Infinite Pad
            </h1>
          </div>
        </motion.div>
      </div>

      <div className="absolute top-6 right-6 z-10 pointer-events-none">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-full shadow-lg pointer-events-auto hover:bg-neutral-800 transition-colors"
        >
          <Smartphone size={18} />
          <span className="text-sm font-medium">
            {isConnected ? `${connections.length} Connected` : "Connect Phone"}
          </span>
        </motion.button>
      </div>

      {/* Connection Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
            onClick={() => setIsModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-900 transition-colors"
              >
                <X size={20} />
              </button>

              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Share2 size={24} />
                </div>
                <h2 className="text-2xl font-bold mb-2">Connect your Phone</h2>
                <p className="text-neutral-500 text-sm">
                  Scan the QR code to use your phone as a precision trackpad and drawing surface.
                </p>
              </div>

              <div className="bg-neutral-50 p-4 rounded-2xl border-2 border-dashed border-neutral-200 mb-6 flex justify-center">
                {remoteUrl ? (
                  <QRCodeSVG
                    value={remoteUrl}
                    size={200}
                    level="H"
                    includeMargin={true}
                    className="rounded-lg"
                  />
                ) : (
                  <div className="w-[200px] h-[200px] flex items-center justify-center text-neutral-400 animate-pulse">
                    Generating ID...
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 p-3 bg-neutral-50 rounded-lg text-xs font-mono text-neutral-500 break-all border border-neutral-100">
                  <LinkIcon size={12} className="shrink-0" />
                  <span className="line-clamp-1">{remoteUrl}</span>
                </div>
                <p className="text-center text-xs text-neutral-400 mt-2">
                  Make sure both devices have internet access.
                </p>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
