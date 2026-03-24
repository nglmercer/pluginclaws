// ==========================================
// PicoClaw WebSocket Client
// ==========================================

import {
  ClientEvents,
  MessageTypes,
  DEFAULT_CONFIG,
  ReadyState,
} from './constants';

// ==========================================
// Types and Interfaces
// ==========================================

export interface WSMessage {
  type: string;
  id?: string;
  timestamp?: number;
  payload?: any;
}

type EventHandler = (payload: any) => void;
export async function getPicoToken(URL:string = 'http://127.0.0.1:18800/api/pico/token'): Promise<{ token: string; ws_url: string; enabled: boolean }> {  
  const response = await fetch(URL);  
  if (!response.ok) {  
    throw new Error('Failed to get Pico token');  
  }  
  return await response.json() as { token: string; ws_url: string; enabled: boolean };  
}  
export class PicoClawWebSocket {
  private ws: WebSocket | null = null;
  private messageId = 0;
  
  // For messages that DO expect a direct response with ID
  private pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();

  // For server events (pub/sub)
  private eventListeners = new Map<string, Set<EventHandler>>();
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private url: string, private protocols?: string | string[]) {}

  // --- Connection Management ---
  
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url, this.protocols);

      this.ws.onopen = () => {
        this.startHeartbeat();
        this.emitLocal('connected', null);
        resolve();
      };

      this.ws.onerror = (error) => {
        this.emitLocal('error', error);
        reject(error);
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          this.handleIncomingMessage(message);
        } catch (err) {
          console.error('Error parsing WS message:', err);
        }
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        this.clearPendingRequests();
        this.emitLocal('disconnected', null);
      };
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // --- Event Management (Pub/Sub) ---
  
  /** Subscribe to a server event (e.g., 'message.create') */
  on(event: string, handler: EventHandler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
  }

  /** Unsubscribe from an event */
  off(event: string, handler: EventHandler) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(handler);
    }
  }

  private emitLocal(event: string, payload: any) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(handler => handler(payload));
    }
  }

  // --- Message Processing ---

  private handleIncomingMessage(message: WSMessage) {
    const { type, id, payload } = message;

    // 1. If it's a response to a specific request by ID
    if (id && this.pendingRequests.has(id)) {
      const request = this.pendingRequests.get(id)!;
      clearTimeout(request.timeout);
      this.pendingRequests.delete(id);

      if (type === MessageTypes.ERROR) {
        request.reject(new Error(payload?.message || 'Server error'));
      } else {
        request.resolve({ type, payload });
      }
      return; // End of processing for this message
    }

    // 2. If it's a general server event, dispatch to listeners
    this.emitLocal(type, payload);
  }

  // --- Sending Methods ---

  /** Send a message without expecting a direct response with ID (Fire and Forget) */
  private emitToServer(type: string, payload: any = {}): void {
    if (!this.ws || this.ws.readyState !== ReadyState.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    const message: WSMessage = {
      type,
      id: (++this.messageId).toString(),
      timestamp: Date.now(),
      payload
    };

    this.ws.send(JSON.stringify(message));
  }

  /** Send a message and wait for a response containing the same ID (RPC) */
/*   private requestFromServer(type: string, payload: any = {}, timeoutMs = DEFAULT_CONFIG.DEFAULT_TIMEOUT_MS): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        const id = (++this.messageId).toString();
        const message: WSMessage = { type, id, timestamp: Date.now(), payload };
        
        const timeout = setTimeout(() => {
          this.pendingRequests.delete(id);
          reject(new Error(`Timeout of ${timeoutMs}ms waiting for response for ${type}`));
        }, timeoutMs);

        this.pendingRequests.set(id, { resolve, reject, timeout });
        this.ws!.send(JSON.stringify(message));
      } catch (error) {
        reject(error);
      }
    });
  } */

  // --- Public Client API ---

  // Since the AI responds with 'message.create' events, we only emit.
  sendText(chatId: string, content: string): void {
    this.emitToServer(MessageTypes.MESSAGE_SEND, { chat_id: chatId, content });
  }

  sendMedia(chatId: string, mediaType: string, data: string | ArrayBuffer): void {
    this.emitToServer(MessageTypes.MEDIA_SEND, { chat_id: chatId, media_type: mediaType, data });
  }

  startTyping(chatId: string): void {
    this.emitToServer(MessageTypes.TYPING_START, { chat_id: chatId });
  }

  stopTyping(chatId: string): void {
    this.emitToServer(MessageTypes.TYPING_STOP, { chat_id: chatId });
  }

  // --- Internal Tasks ---

  private startHeartbeat() {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === ReadyState.OPEN) {
        this.emitToServer(MessageTypes.PING);
      }
    }, DEFAULT_CONFIG.PING_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private clearPendingRequests() {
    this.pendingRequests.forEach(({ timeout, reject }) => {
      clearTimeout(timeout);
      reject(new Error('Connection closed before receiving response'));
    });
    this.pendingRequests.clear();
  }
}
