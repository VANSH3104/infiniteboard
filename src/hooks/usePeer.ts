import { useEffect, useState, useRef } from 'react';
import Peer, { DataConnection } from 'peerjs';

export type PeerData = {
  type: 'STROKE' | 'CURSOR' | 'CLEAR' | 'ZOOM';
  payload: any;
};

export const usePeer = () => {
  const [peerId, setPeerId] = useState<string>('');
  const [connections, setConnections] = useState<DataConnection[]>([]);
  const peerRef = useRef<Peer | null>(null);
  const isPeerCreated = useRef(false);

  // Buffer for incoming data to act as an event stream
  const onDataRef = useRef<((data: PeerData) => void) | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isPeerCreated.current) return;

    isPeerCreated.current = true; // Mark as created

    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log('My Peer ID is: ' + id);
      setPeerId(id);
    });

    peer.on('connection', (conn) => {
      console.log('Incoming connection from:', conn.peer);

      conn.on('open', () => {
        console.log('Connection fully opened with:', conn.peer);
        setConnections((prev) => [...prev, conn]);
      });

      conn.on('data', (data: any) => {
        if (onDataRef.current) {
          onDataRef.current(data);
        }
      });

      conn.on('close', () => {
        console.log('Connection closed:', conn.peer);
        setConnections((prev) => prev.filter((c) => c !== conn));
      });

      conn.on('error', (err) => {
        console.error('Connection error with peer:', err);
      });
    });

    peer.on('error', (err) => {
      console.error('PeerJS Error:', err);
    });

    return () => {
      // Optional: Clean up if truly leaving
      // peer.destroy();
    };
  }, []);

  const connectToHost = (hostId: string) => {
    if (!peerRef.current) return;
    if (peerRef.current.id === hostId) return;

    console.log('Attempting to connect to host:', hostId);
    const conn = peerRef.current.connect(hostId, {
      reliable: true
    });

    conn.on('open', () => {
      console.log('Connected to host:', hostId);
      setConnections((prev) => [...prev, conn]);
    });

    conn.on('close', () => {
      console.log('Disconnected from host');
      setConnections((prev) => prev.filter((c) => c !== conn));
    });

    conn.on('error', (err) => {
      console.error('Connection error:', err);
    });
  };

  const sendData = (data: PeerData) => {
    connections.forEach((conn) => {
      if (conn.open) {
        conn.send(data);
      } else {
        console.warn('Connection not open, cannot send data');
      }
    });
  };

  const setOnData = (callback: (data: PeerData) => void) => {
    onDataRef.current = callback;
  };

  return { peerId, connections, connectToHost, sendData, setOnData, isConnected: connections.length > 0 };
};
