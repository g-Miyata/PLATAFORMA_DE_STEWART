import { useEffect, useState, useRef } from 'react';

export function useWebSocket(url: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}${url}`;

    const connect = () => {
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          console.log('[WS] Connected');
        };

        ws.onclose = () => {
          setIsConnected(false);
          console.log('[WS] Disconnected');
          setTimeout(connect, 3000);
        };

        ws.onmessage = (event) => {
          setLastMessage(event.data);
        };

        ws.onerror = (error) => {
          console.error('[WS] Error:', error);
        };
      } catch (error) {
        console.error('[WS] Connection error:', error);
        setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [url]);

  return { isConnected, lastMessage };
}
