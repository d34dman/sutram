import type { Registry, Schema } from "./index.js";

export interface SutramEvent<P = Record<string, unknown>> {
  id: number;
  name: string;
  payload: P;
  source: string;
  heardBy: string[];
}

export interface Events {
  define(name: string, def: { description?: string; payload?: Schema }): void;
  emit<P extends Record<string, unknown>>(name: string, payload?: P, options?: { source?: string }): SutramEvent<P>;
  on(name: string, fn: (event: SutramEvent) => void, options?: { as?: string; hidden?: boolean }): () => void;
  list(): Array<{ name: string; description?: string }>;
  lastId(): number;
  clear(upTo?: number): void;
}

export declare function createEvents(registry: Registry, options?: { bufferSize?: number }): Events;
export declare function getEvents(registry?: Registry): Events;
