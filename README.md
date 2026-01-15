# Infinite Board

A collaborative infinite canvas whiteboard that turns your phone into a precision trackpad and remote drawing tool.

## Features

- **Infinite Canvas**: Zoomable and pannable infinite whiteboard.
- **Phone as Tablet**: Use your phone as a drawing pad. 
- **Real-time Sync**: Zero-latency stroke rendering using Peer-to-Peer connection.
- **Pressure Sensitivity**: Supports pressure data from capable devices.
- **Multi-Colors**: Switch between colors instantly from the phone.
- **Touch Gestures**: Two-finger pinch to zoom on mobile.

## Technology Stack

- **Framework**: [Next.js](https://nextjs.org/) (React)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Connectivity**: [WebRTC](https://webrtc.org/) via [PeerJS](https://peerjs.com/)
    - Establishes a direct peer-to-peer connection between your computer and phone.
    - No central server stores your drawings; data flows directly between devices.
- **Drawing Engine**: [perfect-freehand](https://github.com/steveruizok/perfect-freehand) for smooth ink interpolation.

## How it Works

1. **Host (Desktop)**: Opens a PeerJS connection and generates a unique ID (displayed as a QR code).
2. **Remote (Phone)**: Scans the QR code to get the Host ID.
3. **Connection**: The phone connects directly to the desktop using WebRTC.
4. **Data**: Touch events (coordinates, pressure) are normalized and sent to the desktop, which renders them on the infinite canvas.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) with your browser.
4. Scan the QR code with your phone (ensure both are on the same WiFi).
