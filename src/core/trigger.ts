import type { IPlugin, PluginContext } from "bun_plugins";
import type { ActionRegistry } from "trigger_system/node";
export const PLUGIN_NAMES = {
  ACTION_REGISTRY: "action-registry",
} as const;
/* import { type as arkType, type Type } from "arktype";
import type { Action, TriggerContext,ActionHandler } from "trigger_system/node";
import { ExpressionEngine } from "trigger_system/node"; */
export interface ActionRegistryApi extends IPlugin {
  register: ActionRegistry["register"];
  get: ActionRegistry["get"];
  registry?: ActionRegistry | null;
  registerHelper: (name: string, fn: Function) => void;
  getHelpers: () => Record<string, Function>;
}
export async function getRegistryPlugin(context: PluginContext) {
  const registryPlugin = (await context.getPlugin(
    PLUGIN_NAMES.ACTION_REGISTRY,
  )) as ActionRegistryApi;
  return registryPlugin;
}

export function parseData(data: unknown) {
  if (data === null || data === undefined) return null;

  // Si ya es un objeto, lo devolvemos (clonado para evitar mutaciones)
  if (typeof data === "object") {
    return Array.isArray(data) ? [...data] : { ...data };
  }

  try {
    if (typeof data === "string") {
      const trimmed = data.trim();
      // Validar que parece JSON (empieza con { o [)
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        return JSON.parse(trimmed);
      }
    }
  } catch (e) {
    return { error: "Invalid JSON", data };
  }

  return null;
}
