import {  
  DEFAULT_CONFIG,  
  QueryParams,  
  Protocols,  
} from './constants';  
  
// ==========================================  
// Types and Interfaces  
// ==========================================  
  
export interface PicoClawConfig {  
  token?: string;  
  sessionId?: string;  
  host?: string;    // Default: '127.0.0.1'  
  port?: number;    // Default: 18790 for WS, 18800 for HTTP  
  path?: string;    // Default: '/pico/ws' for WS, '/api/pico/token' for HTTP  
  secure?: boolean; // Default: false (ws:// vs wss://)  
}  
  
export interface UrlBuilderOptions {  
  type: 'ws' | 'http';  
  apiPath?: string; // For HTTP API endpoints like '/api/pico/token'  
}  
  
/**  
 * Builds PicoClaw URLs for both WebSocket and HTTP connections  
 * @param config - Configuration object  
 * @param options - URL type and additional options  
 * @returns Complete URL string  
 */  
export function buildPicoClawUrl(  
  config: PicoClawConfig,   
  options: UrlBuilderOptions  
): string {  
  const isSecure = config.secure ?? false;  
  const protocol = options.type === 'ws'   
    ? (isSecure ? Protocols.WSS : Protocols.WS)  
    : (isSecure ? 'https' : 'http');  
    
  // Use different default ports for WS vs HTTP  
  const defaultPort = options.type === 'ws' ? 18790 : 18800;  
  const host = config.host ?? DEFAULT_CONFIG.HOST;  
  const port = config.port ?? defaultPort;  
    
  // Set default paths based on type  
  let path = config.path;  
  if (!path) {  
    if (options.type === 'ws') {  
      path = DEFAULT_CONFIG.PATH; // '/pico/ws'  
    } else {  
      path = options.apiPath ?? '/api/pico/token';  
    }  
  }  
  
  const url = new URL(`${protocol}://${host}:${port}${path}`);  
    
  // Add query parameters  
  if (config.token) {  
    url.searchParams.append(QueryParams.TOKEN, config.token);  
  }  
  if (config.sessionId) {  
    url.searchParams.append(QueryParams.SESSION_ID, config.sessionId);  
  }  
  
  return url.toString();  
}  
  
// Convenience functions  
export function buildWsUrl(config: PicoClawConfig): string {  
  return buildPicoClawUrl(config, { type: 'ws' });  
}  
  
export function buildApiUrl(config: PicoClawConfig, apiPath: string = '/api/pico/token'): string {  
  return buildPicoClawUrl(config, { type: 'http', apiPath });  
}