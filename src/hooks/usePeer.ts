import { useEffect, useState, useRef } from 'react';
import Peer, { DataConnection } from 'peerjs';

export type PeerData = {
  type: 'STROKE' | 'CURSOR' | 'CLEAR';
  payload: any;
};

export const usePeer = () => {
  const [peerId, setPeerId] = useState<string>('');
  const [connections, setConnections] = useState<DataConnection[]>([]);
  const peerRef = useRef<Peer | null>(null);

  // Buffer for incoming data to act as an event stream
  const onDataRef = useRef<((data: PeerData) => void) | null>(null);

  useEffect(() => {
    // Initialize PeerJS (auto-generates ID)
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log('My Peer ID is: ' + id);
      setPeerId(id);
    });

    peer.on('connection', (conn) => {
      console.log('Incoming connection from:', conn.peer);
      
      conn.on('open', () => {
        setConnections((prev) => [...prev, conn]);
      });

      conn.on('data', (data: any) => {
        if (onDataRef.current) {
          onDataRef.current(data);
        }
      });

      conn.on('close', () => {
        setConnections((prev) => prev.filter((c) => c !== conn));
      });
    });

    return () => {
      peer.destroy();
    };
  }, []);

  const connectToHost = (hostId: string) => {
    if (!peerRef.current) return;
    const conn = peerRef.current.connect(hostId);
    
    conn.on('open', () => {
      console.log('Connected to host:', hostId);
      setConnections((prev) => [...prev, conn]);
    });

    conn.on('close', () => {
        console.log('Disconnected from host');
         setConnections((prev) => prev.filter((c) => c !== conn));
    });
  };

  const sendData = (data: PeerData) => {
    connections.forEach((conn) => {
      if (conn.open) {
        conn.send(data);
      }
    });
  };

  const setOnData = (callback: (data: PeerData) => void) => {
    onDataRef.current = callback;
  };

  return { peerId, connectToHost, sendData, setOnData, isConnected: connections.length > 0 };
};
