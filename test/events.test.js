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

test("when Sutram starts again, the buffer is cleared, and ids keep counting", async () => {
  const r = createRegistry();
  const ev = createEvents(r);
  ev.define("cart.changed", { description: "The cart changed" });
  let fail = true;
  r.register({
    name: "nav go", provider: "nav", description: "Go", input: { type: "object", properties: {} },
    annotations: { navigates: true },
    run: (_, { reinitializes }) => {
      if (fail) throw new Error("no such page");
      reinitializes();
      ev.emit("cart.changed", {}, { source: "nav" });
    },
  });
  ev.emit("cart.changed");
  await r.run("nav go");
  assert.equal((await r.run("events recent")).data.events.length, 1, "a failed navigation keeps the events");
  fail = false;
  await r.run("nav go");
  r.initialized(); // a single-page app's new commands are there
  const after = (await r.run("events recent")).data;
  assert.deepEqual(after.events.map((e) => [e.id, e.source]), [[2, "nav"]], "only what came after is kept");
  assert.equal(after.cursor, 2);
  ev.emit("cart.changed");
  assert.deepEqual((await r.run("events recent", { since: 2 })).data.events.map((e) => e.id), [3]);
});

test("event payloads are checked strictly and delivered as emitted", () => {
  const r = createRegistry();
  const events = createEvents(r);
  events.define("form.saved", { payload: { type: "object", properties: { saved: { type: "integer" }, draft: { type: "boolean", default: false } } } });
  assert.throws(() => events.emit("form.saved", { saved: "3" }), /saved must be a whole number/);
  const payload = { saved: 3 };
  assert.equal(events.emit("form.saved", payload).payload, payload);
});

test("the event buffer keeps the payload as it was emitted", async () => {
  const r = createRegistry();
  const ev = createEvents(r);
  ev.define("doc.changed", { description: "Changed" });
  const payload = { title: "a" };
  ev.emit("doc.changed", payload);
  payload.title = "b";
  assert.deepEqual((await r.run("events recent", { since: 0 })).data.events[0].payload, { title: "a" });
});
