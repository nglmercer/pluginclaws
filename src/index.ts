import { PicoClawWebSocket, getPicoToken, loginAuth } from "./core/ws";
import { buildWsUrl } from "./core/utils";
import { ClientEvents } from "./core/constants";
import { definePlugin, type PluginContext, type IPlugin } from "bun_plugins";
import { getRegistryPlugin } from "./core/trigger";
const PicoClawName = "pico-claw";
let client: PicoClawWebSocket | null = null;
// Store event handlers to remove them on reload
const eventHandlers: Array<{ event: string; handler: (payload: any) => void }> =
  [];
// Store the on handler for PicoClawName messages
let lastmsg = "";
let onMessageHandler: ((data: any) => void) | null = null;
export const AI_RESPOND = "ai_respond";
const sessionId = randomUUID();
const options = {
  port: 18800,
  loginToken: "1234",
  sessionToken: "",
  sessionId: sessionId,
  cookie: "",
};
async function ensurePicoConnection(context: PluginContext): Promise<boolean> {
  if (client?.isConnected) return true;

  const { emit, storage, log } = context;

  if (client) {
    eventHandlers.forEach(({ event, handler }) => {
      client!.off(event, handler);
    });
    eventHandlers.length = 0;
    client.disconnect();
    client = null;
  }

  const getOptions = (await storage.get(PicoClawName)) as typeof options | null;
  const baseUrl = `http://localhost:${options.port}`;
  const httpUrl = baseUrl;
  let loginToken = getOptions?.loginToken || options.loginToken || "";
  let currentCookie = getOptions?.cookie || options.cookie || "";
  
  let { sessionToken, enabled } = await getPicoToken(httpUrl, { cookie: currentCookie });

  if (!sessionToken && loginToken) {
    log.info("No session token obtained, attempting loginAuth...");
    try {
      const oauthRes = await loginAuth({
        token: loginToken
      }, baseUrl);
      
      log.info("loginAuth response (cookie updated):", !!oauthRes.cookie);
      
      if (oauthRes.cookie) {
        currentCookie = oauthRes.cookie;
      }
      
      const retryPico = await getPicoToken(httpUrl, { cookie: currentCookie });
      sessionToken = retryPico.sessionToken;
      enabled = retryPico.enabled;
    } catch (e) {
      log.error("Failed to login OAuth:", e);
    }
  }
  
  if (typeof loginToken === "string" && loginToken.length > 0) {
    options.sessionToken = sessionToken;
  }
  options.cookie = currentCookie;
  
  await storage.set(PicoClawName, options);
  
  if (!enabled || !sessionToken) {
    console.error("Pico channel is not enabled or session token not found", options);
    return false;
  }

  try {
    const wsUrl = buildWsUrl(options);
    const protocols = [`token.${sessionToken}`];
    const wsOptions = options.cookie ? { headers: { Cookie: options.cookie } } : undefined;
    client = new PicoClawWebSocket(wsUrl, protocols, wsOptions);
    await client.connect();

    const eventNames = Object.values(ClientEvents) as string[];
    eventNames.forEach((eventName) => {
      const handler = (payload: string | {content:string}) => {
        if (eventName === ClientEvents.MESSAGE_CREATE) {
          log.info(eventName, payload);
          const result = typeof payload === "string" ? payload : String(payload?.content);
          if (lastmsg === result) return;
          lastmsg = result;
          context.emit("system", {
            eventName: "TTS",
            data: { message: result },
          });
        }
        emit(`${PicoClawName}:${eventName}`, payload);
      };
      client!.on(eventName, handler);
      eventHandlers.push({ event: eventName, handler });
    });
    log.info("Pico channel connected successfully");
    return true;
  } catch (err) {
    console.error("Failed to connect to Pico channel WS", err);
    client = null;
    return false;
  }
}

async function initialize(context: PluginContext) {
  if (!context) return;
  const { on, log } = context;

  await ensurePicoConnection(context);

  onMessageHandler = async (data: string | { content: string }) => {
    if (!await ensurePicoConnection(context)) return;
    if (typeof data === "string") {
      client!.sendText(PicoClawName, data);
    } else {
      client!.sendText(PicoClawName, data.content);
    }
  };
  on(PicoClawName, onMessageHandler);

  const plugin = await getRegistryPlugin(context);
  if (plugin?.registry) {
    plugin.registry.register(AI_RESPOND, async (action, ctx) => {
      log.info(`[${AI_RESPOND}]`, action, Object.keys(ctx));
      if (!action.params?.prompt) {
        log.warn("No prompt provided for AI_RESPOND");
        return null;
      }
      
      const isReady = await ensurePicoConnection(context);
      if (!isReady) {
        log.error("Cannot perform AI_RESPOND, connection not ready or enabled");
        return null;
      }

      const user = String(action.params.user);
      const prompt = String(action.params.prompt);
      client!.sendText(PicoClawName, `user:[${user}] prompt:${prompt}`);
    });
  }
}
const err_msg = "Error initializing PicoClaw plugin:";
export class clawProvider implements IPlugin {
  name: string = PicoClawName;
  version: string = "1.0.0";
  description: string = "PicoClaw plugin for response ai";
  async onLoad(context: PluginContext) {
    try {
      await initialize(context);
    } catch (error) {
      console.error(err_msg, error);
    }
  }
  async onReload(context: PluginContext) {
    try {
      await initialize(context);
    } catch (error) {
      console.error(err_msg, error);
    }
  }
  onUnload() {
    // Clean up event handlers
    if (client) {
      eventHandlers.forEach(({ event, handler }) => {
        client!.off(event, handler);
      });
      eventHandlers.length = 0;
      client.disconnect();
      client = null;
    }
  }
}
function randomUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
async function main() {
  let loginToken = options.loginToken;
  const baseUrl = `http://localhost:${options.port}`;
  const httpUrl = baseUrl;
  
  console.log("Starting main, loginToken:", loginToken);
  
  let oauthRes = await loginAuth({ token: loginToken }, baseUrl);
  const cookie = oauthRes.cookie || "";
  console.log("Retrieved cookie:", cookie);

  let { sessionToken, ws_url, enabled } = await getPicoToken(httpUrl, { cookie });
  console.log("Pico Token Session:", sessionToken, "ws_url:", ws_url, "enabled:", enabled);

  if (!sessionToken) {
    console.log("No session token, aborting.");
    return;
  }

  if (!enabled) {
    console.error("Pico channel is not enabled");
    return;
  }
  options.sessionToken = sessionToken;
  
  // Generar session ID único
  //options.port = 18790;
  const wsUrl = buildWsUrl(options);
  const protocols = [`token.${sessionToken}`];
  console.log(`Pico session token: ${sessionToken}, ws_url: ${ws_url}`);
  const wsOptions = cookie ? { headers: { Cookie: cookie } } : undefined;
  const client = new PicoClawWebSocket(wsUrl, protocols, wsOptions);

  // 1. Configure the "Listeners" BEFORE making requests
  client.on(ClientEvents.CONNECTED, () =>
    console.log("✅ Connected to PicoClaw"),
  );
  client.on(ClientEvents.DISCONNECTED, () => console.log("❌ Disconnected"));

  client.on(ClientEvents.TYPING_START, () => console.log("Thinking..."));
  client.on(ClientEvents.TYPING_STOP, () => console.log("Stopped thinking"));

  client.on(ClientEvents.MESSAGE_CREATE, (payload: any) => {
    console.log("\n💬 AI message received:");
    console.log(payload.content);
  });

  client.on(ClientEvents.ERROR, (err) => console.error("⚠️  Error:", err));

  try {
    // 2. Connect
    await client.connect();

    // 3. Send the message.
    // NOTE: We no longer use 'await' here because it's a 'fire-and-forget' event.
    // The response will come through the 'message.create' event configured above.
    client.sendText("chat-123", "What are you doing today!");

    // Ping and connection maintenance are now handled automatically by the class.
  } catch (error) {
    console.error(err_msg, error);
  }
}
/*
// recommend change in pico
      "enabled": true,  
      "token": "tu-token",  
      "allow_token_query": false  
*/
if (import.meta.main) {
  main();
}
