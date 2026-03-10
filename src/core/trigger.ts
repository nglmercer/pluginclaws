import type { IPlugin,PluginContext } from "bun_plugins";
import type { ActionRegistry } from "trigger_system/node";
export const PLUGIN_NAMES = {
  ACTION_REGISTRY: "action-registry",
} as const;
export interface ActionRegistryApi extends IPlugin {
  register: ActionRegistry["register"];
  get: ActionRegistry["get"];
  registry?: ActionRegistry | null;
  registerHelper: (name: string, fn: Function) => void;
  getHelpers: () => Record<string, Function>;
  discovery?: any | null;
}
export async function getRegistryPlugin(context: PluginContext){
    const registryPlugin = (await context.getPlugin(
      PLUGIN_NAMES.ACTION_REGISTRY
    )) as ActionRegistryApi;
    return registryPlugin
}