import { test } from "node:test";
import assert from "node:assert/strict";
import { approvalText, APPROVAL_MESSAGES } from "../src/approval.js";

const def = (name, annotations = {}, extra = {}) => ({ name, provider: name.split(" ")[0], description: name, annotations, input: { type: "object", properties: { item: { type: "string" } } }, positional: ["item"], ...extra });

test("approvalText: one command gets its own question, or the generic one", () => {
  const t = approvalText([{ def: def("cart add", {}, { title: "Add to cart" }), input: { item: "V60" } }]);
  assert.equal(t.lead, APPROVAL_MESSAGES.agentAsks);
  assert.deepEqual(t.lines, ["cart add V60"]);
  assert.match(t.question, /Add to cart/);
  const own = approvalText([{ def: def("cart buy", { consequential: true }, { confirm: ({ item }) => `Buy ${item}?` }), input: { item: "V60" } }]);
  assert.equal(own.question, "Buy V60?");
});

test("approvalText: a batch names its consequential commands; long values are shortened", () => {
  const steps = [
    { def: def("cart add"), input: { item: "x".repeat(500) } },
    { def: def("cart buy", { consequential: true }), input: {} },
  ];
  const t = approvalText(steps);
  assert.equal(t.lead, APPROVAL_MESSAGES.agentAsksBatch(2));
  assert.equal(t.question, "Run these 2 commands? cart buy cannot easily be undone.");
  assert.ok(t.lines[0].length < 200, t.lines[0]);
  assert.equal(approvalText(steps.slice(0, 1).concat(steps.slice(0, 1))).question, "Run these 2 commands?");
  assert.equal(approvalText(steps, { agentAsksBatch: (n) => `${n} Befehle:` }).lead, "2 Befehle:");
});

test("approvalText: a batch keeps each consequential command's own question, and says when earlier steps change the page", () => {
  const order = def("order place", { consequential: true }, { confirm: () => "Place an order for 99 items, €4752.00?" });
  const read = { def: def("listing rows", { readOnly: true }), input: {} };
  const t = approvalText([read, { def: order, input: {} }]);
  assert.equal(t.question, "Run these 2 commands? order place cannot easily be undone.\norder place: Place an order for 99 items, €4752.00?");
  const changed = approvalText([{ def: def("cart add"), input: { item: "V60" } }, { def: order, input: {} }]);
  assert.match(changed.question, /\norder place, about the page before the commands above run: Place an order for 99 items, €4752\.00\?$/);
  assert.match(approvalText([read, { def: order, input: {} }], { stepAsks: (n, q) => `${n} → ${q}` }).question, /\norder place → Place/);
});
