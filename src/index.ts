import { PicoClawWebSocket } from "./core/ws";
import { buildPicoClawUrl } from "./core/utils";
import { ClientEvents } from "./core/constants";
import { definePlugin, type PluginContext } from "bun_plugins";
import { getRegistryPlugin } from "./core/trigger";
const PicoClawName = 'pico-claw';
let client: PicoClawWebSocket | null = null;
// Store event handlers to remove them on reload
const eventHandlers: Array<{ event: string; handler: (payload: any) => void }> = [];
// Store the on handler for PicoClawName messages
let lastmsg = '';
let onMessageHandler: ((data: any) => void) | null = null;
export const AI_RESPOND =  "ai_respond";
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

  const token = await storage.get(PicoClawName) as string | null;
  const url = buildPicoClawUrl({
    token: `${typeof token === 'string' ? token : "0dc4bf3f208b1670e9be0eac77bb3279"}`
  });
  client = new PicoClawWebSocket(url);
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
  onMessageHandler = (data: any) => {
    if (typeof data === 'string') {
      client!.sendText(PicoClawName, data);
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
}

export default definePlugin({
  name: PicoClawName,
  version: '1.0.0',
  async onLoad(context: PluginContext) {
    await initialize(context);
  },
  async onReload(context) {
    await initialize(context);
  },
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
  },
});

async function main() {
  const url = buildPicoClawUrl({
    token: '0dc4bf3f208b1670e9be0eac77bb3279',
    sessionId: 'baa1e0d4-f4ff-4af0-9c77-4af5e2674443de'
  });
  const client = new PicoClawWebSocket(url);

  // 1. Configure the "Listeners" BEFORE making requests
  client.on(ClientEvents.CONNECTED, () => console.log('✅ Connected to PicoClaw'));
  client.on(ClientEvents.DISCONNECTED, () => console.log('❌ Disconnected'));

  client.on(ClientEvents.TYPING_START, () => console.log('✍️  AI is typing...'));
  client.on(ClientEvents.TYPING_STOP, () => console.log('🛑 AI stopped typing'));

  client.on(ClientEvents.MESSAGE_CREATE, (payload: any) => {
    console.log('\n💬 AI message received:');
    console.log(payload.content);
  });

  client.on(ClientEvents.ERROR, (err: any) => console.error('⚠️  Error:', err));

  try {
    // 2. Connect
    await client.connect();

    // 3. Send the message.
    // NOTE: We no longer use 'await' here because it's a 'fire-and-forget' event.
    // The response will come through the 'message.create' event configured above.
    client.sendText('chat-123', 'What are you doing today!');

    // Ping and connection maintenance are now handled automatically by the class.

  } catch (error) {
    console.error('Critical error connecting:', error);
  }
}

if (import.meta.main) {
  main();
}
