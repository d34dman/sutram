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
  /**
   * The first event named `name` ("*" for any) with an id above `since`: one
   * still kept, or else the next one emitted. `since` defaults to the newest
   * id. Resolves to null after `timeout` ms (default 10000) or on abort.
   */
  next(name?: string, options?: { since?: number; timeout?: number; signal?: AbortSignal }): Promise<Omit<SutramEvent, "heardBy"> | null>;
  list(): Array<{ name: string; description?: string }>;
  lastId(): number;
  clear(upTo?: number): void;
}

export declare function createEvents(registry: Registry, options?: { bufferSize?: number }): Events;
export declare function getEvents(registry?: Registry): Events;
