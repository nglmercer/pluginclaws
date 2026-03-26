import { PicoClawWebSocket, getPicoToken } from "./core/ws";
import { buildWsUrl,buildApiUrl } from "./core/utils";
import { ClientEvents } from "./core/constants";
import { definePlugin, type PluginContext,type IPlugin } from "bun_plugins";
import { getRegistryPlugin } from "./core/trigger";
const PicoClawName = 'pico-claw';
let client: PicoClawWebSocket | null = null;
// Store event handlers to remove them on reload
const eventHandlers: Array<{ event: string; handler: (payload: any) => void }> = [];
// Store the on handler for PicoClawName messages
let lastmsg = '';
let onMessageHandler: ((data: any) => void) | null = null;
export const AI_RESPOND =  "ai_respond";
const sessionId = randomUUID();  
const options = {
  port: 18800,
  token: '',
  sessionId: sessionId
};
async function initialize(context: PluginContext) {
  if (!context) return;

  const { emit, storage, on, log } = context;
  
  // Clean up existing event listeners before re-initializing
  eventHandlers.forEach(({ event, handler }) => {
    if (client) {
      client.off(event, handler);
    }
  });
  eventHandlers.length = 0;
  
  // Disconnect existing client if any
  if (client) {
    client.disconnect();
    client = null;
  }
  const getOptions = await storage.get(PicoClawName) as typeof options | null;
  const httpUrl = buildApiUrl({...getOptions, ...options});
  const { token, enabled } = await getPicoToken(httpUrl);  
    
  if (!enabled) {  
    console.error('Pico channel is not enabled');  
    return;  
  }
  if (token) {
    options.token = token;
  } else {
    if (getOptions) {
      options.token = getOptions.token;
    }
  }
  await storage.set(PicoClawName, options);
  // Generar session ID único  
  const wsUrl = buildWsUrl(options);
  const protocols = [`token.${options.token}`];  
  client = new PicoClawWebSocket(wsUrl, protocols);
  await client.connect();
  // Map all ClientEvents to emit them as plugin events
  const eventNames = Object.values(ClientEvents) as string[];
  eventNames.forEach((eventName) => {
    const handler = (payload: any) => {
      if (eventName === ClientEvents.MESSAGE_CREATE){
        log.info(eventName,payload)
        const result = String(payload.content);
        if (lastmsg === result)return;
        lastmsg = result;
        context?.emit('system', { eventName: 'TTS', data: {message: result} });
      }
      emit(`${PicoClawName}:${eventName}`, payload);
    };
    client!.on(eventName, handler);
    eventHandlers.push({ event: eventName, handler });
  });

  // Listen for incoming messages - reuse existing handler
  onMessageHandler = (data: string | { content: string }) => {
    if (typeof data === 'string') {
      client!.sendText(PicoClawName, data);
    } else {
      client!.sendText(PicoClawName, data.content);
    }
  };
  on(PicoClawName, onMessageHandler);
  const registry = await getRegistryPlugin(context);
  if (!registry) return;
  registry.register(AI_RESPOND, async (action, ctx) => {
    log.info(`[${AI_RESPOND}]`, action, Object.keys(ctx));
      if (!action.params?.prompt) {
        log.warn("No prompt provided for AI_RESPOND");
        return null;
      }
      const user = String(action.params.user)
      const prompt = String(action.params.prompt);
      client!.sendText(PicoClawName, `user:[${user}] prompt:${prompt}`);
  });
  client.on(ClientEvents.MESSAGE_CREATE, (payload: string | { content: string }) => {
    const message = typeof payload === 'string' ? payload : payload.content;
    context.emit('system', { eventName: 'TTS', data: {message} });
  });
}
const err_msg = 'Error initializing PicoClaw plugin:';
export class clawProvider implements IPlugin{
  name: string = PicoClawName;
  version: string = '1.0.0';
  description: string = 'PicoClaw plugin for response ai';
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
};
function randomUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0,
        v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
async function main() {
  const httpUrl = buildApiUrl(options);
  const { token, ws_url, enabled } = await getPicoToken(httpUrl);  
    
  if (!enabled) {  
    console.error('Pico channel is not enabled');  
    return;  
  }
  options.token = token;
  // Generar session ID único  
  const wsUrl = buildWsUrl(options);
  const protocols = [`token.${token}`];  
  console.log(`Pico token: ${token}, ws_url: ${ws_url}`);
  const client = new PicoClawWebSocket(wsUrl, protocols);

  // 1. Configure the "Listeners" BEFORE making requests
  client.on(ClientEvents.CONNECTED, () => console.log('✅ Connected to PicoClaw'));
  client.on(ClientEvents.DISCONNECTED, () => console.log('❌ Disconnected'));

  client.on(ClientEvents.TYPING_START, () => console.log('Thinking...'));
  client.on(ClientEvents.TYPING_STOP, () => console.log('Stopped thinking'));

  client.on(ClientEvents.MESSAGE_CREATE, (payload: any) => {
    console.log('\n💬 AI message received:');
    console.log(payload.content);
  });

  client.on(ClientEvents.ERROR, (err) => console.error('⚠️  Error:', err));

  try {
    // 2. Connect
    await client.connect();

    // 3. Send the message.
    // NOTE: We no longer use 'await' here because it's a 'fire-and-forget' event.
    // The response will come through the 'message.create' event configured above.
    client.sendText('chat-123', 'What are you doing today!');

    // Ping and connection maintenance are now handled automatically by the class.

  } catch (error) {
    console.error(err_msg, error);
  }
}

if (import.meta.main) {
  main();
}
