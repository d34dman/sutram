import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry, EXIT } from "../src/index.js";
import { createEvents } from "../src/events.js";
import { messages } from "../src/messages.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(initial = []) {
  const r = createRegistry();
  const events = createEvents(r);
  let list = initial;
  let changed;
  const off = messages({ messages: () => list, watch: (fn) => { changed = fn; return () => { changed = null; }; } }, { registry: r, events });
  const shown = async () => (await r.run("events recent")).data.events.filter((e) => e.name === "message.shown").map((e) => e.payload.text);
  return { r, events, off, shown, set: (l) => { list = l; }, changed: () => changed && changed(), watching: () => !!changed };
}

test("messages lists what the adapter says the page showed", async () => {
  const { r, set } = setup([{ type: "status", text: "Saved." }, { type: "error", text: "Title is required." }]);
  const res = await r.run("messages");
  assert.deepEqual(res.data.messages, [{ type: "status", text: "Saved." }, { type: "error", text: "Title is required." }]);
  assert.equal(r.get("messages").title, "Show messages");
  assert.deepEqual(r.get("messages").annotations, { readOnly: true });
  set([]);
  const none = await r.run("messages");
  assert.equal(none.text, "No messages on this page.");
  assert.deepEqual(none.data, { messages: [] });
});

test("each message is emitted once as message.shown: at the start, then the new ones after changed()", async () => {
  const { shown, set, changed, events } = setup([{ type: "status", text: "Saved." }]);
  await tick();
  assert.ok(events.list().some((e) => e.name === "message.shown"));
  assert.deepEqual(await shown(), ["Saved."]);
  set([{ type: "status", text: "Saved." }, { type: "warning", text: "Low disk." }]);
  changed();
  await tick();
  assert.deepEqual(await shown(), ["Saved.", "Low disk."]);
  // Asked again with nothing new: nothing emitted.
  changed();
  await tick();
  assert.deepEqual(await shown(), ["Saved.", "Low disk."]);
  // A list that starts afresh: all of it is new.
  set([{ type: "status", text: "Saved." }]);
  changed();
  await tick();
  assert.deepEqual(await shown(), ["Saved.", "Low disk.", "Saved."]);
});

test("a bad list fails the command, not the page", async () => {
  const { r, set } = setup();
  set(null);
  assert.equal((await r.run("messages")).message, "messages: the app's adapter returned no list of messages");
  set([{ type: "info", text: "x" }]);
  const bad = await r.run("messages");
  assert.equal(bad.code, EXIT.FAILED);
  assert.match(bad.message, /not \{ type: status \| warning \| error, text \}/);
});

test("removing the kit stops watching; the event stays declared for a second setup", async () => {
  const { r, off, watching, events } = setup();
  assert.ok(watching());
  off();
  assert.equal(r.get("messages"), undefined);
  assert.ok(!watching());
  messages({ messages: () => [] }, { registry: r, events });
  assert.ok(r.get("messages"));
});

test("messages refuses an adapter without messages()", () => {
  const r = createRegistry();
  const events = createEvents(r);
  assert.throws(() => messages({}, { registry: r, events }), /needs a messages\(\) function/);
  assert.throws(() => messages({ messages: () => [], watch: 1 }, { registry: r, events }), /watch must be a function/);
  assert.equal(r.get("messages"), undefined);
});
