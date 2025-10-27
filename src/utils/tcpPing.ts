import * as net from 'net';

export interface TcpPingResult {
  success: boolean;
  responseTime?: number;
  error?: string;
}

/**
 * Performs a TCP ping to check if a host:port is reachable
 * This is a lightweight check before attempting WebSocket connection
 */
export async function tcpPing(
  host: string,
  port: number,
  timeout: number = 3000
): Promise<TcpPingResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();

    // Set overall timeout
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({
        success: false,
        error: 'Connection timeout',
      });
    }, timeout);

    socket.on('connect', () => {
      const responseTime = Date.now() - startTime;
      clearTimeout(timer);
      socket.destroy();
      resolve({
        success: true,
        responseTime,
      });
    });

    socket.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      socket.destroy();

      // Map common errors to user-friendly messages
      let errorMessage = 'Connection failed';
      if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Connection timeout';
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Connection refused';
      } else if (error.code === 'EHOSTUNREACH') {
        errorMessage = 'Host unreachable';
      } else if (error.code === 'ENETUNREACH') {
        errorMessage = 'Network unreachable';
      }

      resolve({
        success: false,
        error: errorMessage,
      });
    });

    // Attempt connection
    socket.connect(port, host);
  });
}
