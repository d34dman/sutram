import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry } from "../src/index.js";
import { createEvents } from "../src/events.js";

test("declared events are checked, heard, and readable through commands", async () => {
  const r = createRegistry();
  const ev = createEvents(r);
  ev.define("cart.changed", { description: "The cart changed", payload: { type: "object", properties: { count: { type: "integer" } }, required: ["count"] } });
  const heard = [];
  ev.on("cart.changed", (e) => heard.push(e.payload.count), { as: "mini-cart" });
  assert.throws(() => ev.emit("cart.changed", {}), /count is required/);
  assert.throws(() => ev.emit("nope"), /not defined/);
  ev.emit("cart.changed", { count: 2 }, { source: "agent" });
  assert.deepEqual(heard, [2]);
  const res = await r.run("events recent", { since: 0 });
  assert.equal(res.data.cursor, 1);
  assert.deepEqual(res.data.events, [{ id: 1, name: "cart.changed", payload: { count: 2 }, source: "agent" }]);
  assert.equal((await r.run("events recent", { since: 1 })).text, "No events after #1.");
});
