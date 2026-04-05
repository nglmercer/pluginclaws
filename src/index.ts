import { PicoClawWebSocket, getPicoToken, loginAuth } from "./core/ws";
import { buildWsUrl } from "./core/utils";
import { ClientEvents } from "./core/constants";
import { type PluginContext, type IPlugin } from "bun_plugins";
import { getRegistryPlugin } from "./core/trigger";

const PICO_CLAW_NAME = "pico-claw";
export const AI_RESPOND = "ai_respond";

interface PluginOptions {
  port: number;
  loginToken: string;
  sessionToken: string;
  sessionId: string;
  cookie: string;
}

const DEFAULT_OPTIONS: PluginOptions = {
  port: 18800,
  loginToken: "1234",
  sessionToken: "",
  sessionId: "",
  cookie: "",
};

export class PicoClawPlugin implements IPlugin {
  name = PICO_CLAW_NAME;
  version = "1.0.0";
  description = "PicoClaw plugin for AI response integration";

  private client: PicoClawWebSocket | null = null;
  private eventHandlers: Array<{ event: string; handler: (payload: any) => void }> = [];
  private lastMsg = "";
  private options: PluginOptions = { ...DEFAULT_OPTIONS };
  private context: PluginContext | null = null;

  async onLoad(context: PluginContext) {
    this.context = context;
    this.options.sessionId = crypto.randomUUID();
    try {
      await this.initialize();
    } catch (error) {
      this.context.log.error("Error loading PicoClaw plugin:", error);
    }
  }

  async onReload(context: PluginContext) {
    this.context = context;
    try {
      await this.initialize();
    } catch (error) {
      this.context.log.error("Error reloading PicoClaw plugin:", error);
    }
  }

  async onUnload() {
    this.cleanup();
    this.context = null;
  }

  private cleanup() {
    if (this.client) {
      this.eventHandlers.forEach(({ event, handler }) => {
        this.client?.off(event, handler);
      });
      this.eventHandlers = [];
      this.client.disconnect();
      this.client = null;
    }
  }

  private async initialize() {
    if (!this.context) return;

    const isConnected = await this.ensureConnection();
    if (!isConnected) {
      this.context.log.warn("Initial connection to PicoClaw failed. Will retry on demand.");
    }

    // Set up message handler for the plugin name
    this.context.on(PICO_CLAW_NAME, async (data: string | {content: string}) => {
      const isReady = await this.ensureConnection();
      if (!isReady || !this.client) return;

      const content = typeof data === "string" ? data : data?.content || "";
      if (content) {
        this.client.sendText(PICO_CLAW_NAME, content);
      }
    });

    // Register AI_RESPOND action
    const registryPlugin = await getRegistryPlugin(this.context);
    if (registryPlugin?.registry) {
      registryPlugin.registry.register(AI_RESPOND, async (action, ctx) => {
        this.context?.log.info(`[${AI_RESPOND}]`, action, Object.keys(ctx));
        
        if (!action.params?.prompt) {
          this.context?.log.warn("No prompt provided for AI_RESPOND");
          return null;
        }

        const isReady = await this.ensureConnection();
        if (!isReady || !this.client) {
          this.context?.log.error("Cannot perform AI_RESPOND: connection not ready");
          return null;
        }

        const user = String(action.params.user || "unknown");
        const prompt = String(action.params.prompt);
        this.client.sendText(PICO_CLAW_NAME, `user:[${user}] prompt:${prompt}`);
        return { success: true };
      });
    }
  }

  private async ensureConnection(): Promise<boolean> {
    if (this.client?.isConnected) return true;
    if (!this.context) return false;

    const { storage, log } = this.context;

    // Load saved options and merge with defaults
    const savedOptions = (await storage.get(PICO_CLAW_NAME)) as Partial<PluginOptions> | null;
    this.options = { 
      ...DEFAULT_OPTIONS, 
      ...this.options, // maintain session ID if already set
      ...savedOptions 
    };

    if (!this.options.sessionId) {
      this.options.sessionId = crypto.randomUUID();
    }

    const baseUrl = `http://localhost:${this.options.port}`;
    let currentCookie = this.options.cookie;
    
    // Attempt to get a session token
    let { sessionToken, enabled } = await getPicoToken(baseUrl, { cookie: currentCookie });

    // If session token failed and we have a login token, try to authenticate
    if (!sessionToken && this.options.loginToken) {
      log.info("No session token, attempting login...");
      try {
        const authRes = await loginAuth({ token: this.options.loginToken }, baseUrl);
        if (authRes.cookie) {
          currentCookie = authRes.cookie;
          this.options.cookie = currentCookie;
          
          // Retry getting the token with the new cookie
          const retryRes = await getPicoToken(baseUrl, { cookie: currentCookie });
          sessionToken = retryRes.sessionToken;
          enabled = retryRes.enabled;
        }
      } catch (e) {
        log.error("Login failed:", e);
      }
    }

    this.options.sessionToken = sessionToken;
    this.options.cookie = currentCookie;
    
    // Persist updated options
    await storage.set(PICO_CLAW_NAME, this.options);

    if (!enabled || !sessionToken) {
      log.error("Pico channel not enabled or session token missing", { enabled, hasToken: !!sessionToken });
      return false;
    }

    // Connect WebSocket
    try {
      this.cleanup(); // Clear any existing problematic client

      const wsUrl = buildWsUrl(this.options);
      const protocols = [`token.${sessionToken}`];
      const wsOptions = currentCookie ? { headers: { Cookie: currentCookie } } : undefined;
      
      this.client = new PicoClawWebSocket(wsUrl, protocols, wsOptions);
      await this.client.connect();

      // Set up event listeners
      const eventNames = Object.values(ClientEvents) as string[];
      eventNames.forEach((eventName) => {
        const handler = (payload: string | {content: string}) => {
          this.handleClientEvent(eventName, payload);
        };
        this.client!.on(eventName, handler);
        this.eventHandlers.push({ event: eventName, handler });
      });

      log.info("PicoClaw connected successfully");
      return true;
    } catch (err) {
      log.error("Failed to connect to PicoClaw WebSocket", err);
      this.client = null;
      return false;
    }
  }

  private handleClientEvent(eventName: string, payload: string | {content: string}) {
    if (!this.context) return;

    if (eventName === ClientEvents.MESSAGE_CREATE) {
      const content = typeof payload === "string" ? payload : String(payload?.content || "");
      
      // Basic deduplication
      if (this.lastMsg === content) return;
      this.lastMsg = content;

      this.context.log.info("AI message received", { content });
      
      // Emit a system TTS event
      this.context.emit("system", {
        eventName: "TTS",
        data: { message: content },
      });
    }

    // Emit the event prefixed with the plugin name
    this.context.emit(`${PICO_CLAW_NAME}:${eventName}`, payload);
  }
}

// Export the provider as the default plugin implementation
//export const clawProvider = PicoClawPlugin;

/**
 * Main function for manual testing (bun src/index.ts)
 */
async function main() {
  console.log("--- PicoClaw Manual Test ---");
  
  const testOptions: PluginOptions = {
    ...DEFAULT_OPTIONS,
    sessionId: crypto.randomUUID(),
  };

  const baseUrl = `http://localhost:${testOptions.port}`;
  
  try {
    console.log(`Authenticating at ${baseUrl}...`);
    const authRes = await loginAuth({ token: testOptions.loginToken }, baseUrl);
    const cookie = authRes.cookie || "";
    
    console.log("Fetching session token...");
    const { sessionToken, ws_url, enabled } = await getPicoToken(baseUrl, { cookie });
    
    if (!sessionToken || !enabled) {
      console.error("Failed to get session token or channel not enabled");
      return;
    }

    console.log(`Connecting to WebSocket: ${ws_url}...`);
    testOptions.sessionToken = sessionToken;
    const wsUrl = buildWsUrl(testOptions);
    const protocols = [`token.${sessionToken}`];
    const wsHeaders = cookie ? { headers: { Cookie: cookie } } : undefined;
    
    const client = new PicoClawWebSocket(wsUrl, protocols, wsHeaders);

    client.on(ClientEvents.CONNECTED, () => console.log("✅ Connected!"));
    client.on(ClientEvents.MESSAGE_CREATE, (p) => console.log("\n💬 AI:", p.content || p));
    client.on(ClientEvents.ERROR, (e) => console.error("⚠️ Error:", e));
    client.on(ClientEvents.DISCONNECTED, () => console.log("❌ Disconnected"));

    await client.connect();
    console.log("Sending test message...");
    client.sendText("test-session", "Hello! Are you there?");

  } catch (error) {
    console.error("Test failed:", error);
  }
}

if (import.meta.main) {
  main();
}

