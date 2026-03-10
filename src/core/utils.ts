import {
  DEFAULT_CONFIG,
  QueryParams,
  Protocols,
} from './constants';

// ==========================================
// Types and Interfaces
// ==========================================

export interface PicoClawConfig {
  token: string;
  sessionId?: string;
  host?: string;    // Default: '127.0.0.1'
  port?: number;    // Default: 18790
  path?: string;    // Default: '/pico/ws'
  secure?: boolean; // Default: false (ws:// vs wss://)
}
/**
 * Builds the PicoClaw WebSocket URL from configuration
 * @param config - Configuration object containing token, sessionId, and optional settings
 * @returns Complete WebSocket URL string
 */
export function buildPicoClawUrl(config: PicoClawConfig): string {
  const protocol = config.secure ? Protocols.WSS : Protocols.WS;
  const host = config.host ?? DEFAULT_CONFIG.HOST;
  const port = config.port ?? DEFAULT_CONFIG.PORT;
  const path = config.path ?? DEFAULT_CONFIG.PATH;

  // Use native URL API for secure URL construction
  const url = new URL(`${protocol}://${host}:${port}${path}`);
  
  url.searchParams.append(QueryParams.TOKEN, config.token);
  if (config.sessionId)
  url.searchParams.append(QueryParams.SESSION_ID, config.sessionId);

  return url.toString();
}