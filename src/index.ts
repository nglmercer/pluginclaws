import { PicoClawWebSocket } from "./core/ws";
import { buildPicoClawUrl } from "./core/utils";
import { ClientEvents } from "./core/constants";
import { definePlugin, type PluginContext } from "bun_plugins";

export default definePlugin({
  name: 'pico-claw',
  version: '1.0.0',
  async onLoad(context: PluginContext) {
    const { emit, storage } = context;
    const token = await storage.get('pico-claw') as string | { token: string };
    const url = buildPicoClawUrl({
      token: `${typeof token === 'string' ? token : token.token}`
    });
    const client = new PicoClawWebSocket(url);

    // Map all ClientEvents to emit them as plugin events
    const eventNames = Object.values(ClientEvents) as string[];
    eventNames.forEach((eventName) => {
      client.on(eventName, (payload: any) => {
        emit(eventName, payload);
      });
    });
  },
  onUnload() {
    // Cleanup if needed
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
