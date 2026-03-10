// ==========================================
// Core Constants - Centralized Enums and Constants
// ==========================================

// --- Default Configuration Values ---
export const DEFAULT_CONFIG = Object.freeze({
  HOST: '127.0.0.1',
  PORT: 18790,
  PATH: '/pico/ws',
  SECURE: false,
  PING_INTERVAL_MS: 30000,
  DEFAULT_TIMEOUT_MS: 15000,
});

// --- WebSocket Event Names (Client-side) ---
export const ClientEvents = Object.freeze({
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  TYPING_START: 'typing.start',
  TYPING_STOP: 'typing.stop',
  MESSAGE_CREATE: 'message.create',
  ERROR: 'error',
});

// --- WebSocket Message Types (Server commands) ---
export const MessageTypes = Object.freeze({
  PING: 'ping',
  MESSAGE_SEND: 'message.send',
  MEDIA_SEND: 'media.send',
  TYPING_START: 'typing.start',
  TYPING_STOP: 'typing.stop',
  ERROR: 'error',
});

// --- Media Types ---
export const MediaTypes = Object.freeze({
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  DOCUMENT: 'document',
});

// --- WebSocket Ready States ---
export const ReadyState = Object.freeze({
  CONNECTING: WebSocket.CONNECTING,
  OPEN: WebSocket.OPEN,
  CLOSING: WebSocket.CLOSING,
  CLOSED: WebSocket.CLOSED,
});

// --- Query Parameter Names ---
export const QueryParams = Object.freeze({
  TOKEN: 'token',
  SESSION_ID: 'session_id',
});

// --- Protocol Schemes ---
export const Protocols = Object.freeze({
  WS: 'ws',
  WSS: 'wss',
});
