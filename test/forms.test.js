import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegistry, EXIT } from "../src/index.js";
import { complete, parse } from "../src/client.js";
import { forms } from "../src/forms.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A fake app: one contact form whose topic billing asks for an invoice. */
function app() {
  const values = { email: "", topic: "", gear: [], callback: false, body: "<p>Hi</p>" };
  const fields = () => [
    { field: "email", label: "Email", type: "string", required: true, value: "" },
    { field: "topic", label: "Topic", type: "choice", options: { billing: "Billing", bug: "Bug" }, value: "" },
    { field: "gear", label: "Gear", type: "choices", options: { v60: "V60", aero: "AeroPress", pour: "Pour-over, by hand" }, value: [] },
    { field: "callback", label: "Call back", type: "boolean", value: false },
    { field: "body", label: "Message", type: "html", value: "<p>Hi</p>" },
    { field: "when", label: "When", type: "date", value: "" },
    { field: "map", label: "Map", type: "unsupported", value: "" },
    ...(values.topic === "billing" ? [{ field: "invoice", label: "Invoice", type: "string", required: true, value: "" }] : []),
  ];
  return {
    values,
    sent: [],
    adapter: {
      forms: () => [{ id: "contact", label: "Contact", entity: { type: "message" }, fields: fields(), errors: [] }],
      read: (form, f) => values[f.field] ?? "",
      write: (form, f, v) => { values[f.field] = v; },
      submit() {},
      reloads: false,
      types: {
        date: {
          coerce(f, raw) {
            if (!/^\d{4}-\d\d-\d\d$/.test(raw)) throw new Error("not a date");
            return raw;
          },
          format: "YYYY-MM-DD",
        },
      },
    },
  };
}

/** Runs a command line the way the console does. */
async function line(r, text) {
  try {
    const { def, input } = parse(r, text);
    return await r.run(def.name, input);
  } catch (err) {
    return { code: err.code, message: err.message };
  }
}

function setup(over = {}) {
  const a = app();
  const r = createRegistry();
  r.initialized();
  const off = forms({ ...a.adapter, submit: (form) => { a.sent.push({ ...a.values }); return { text: "Sent. Thank you." }; }, ...over }, { registry: r });
  return { r, a, off };
}

test("registers the core seven with titles; the optional four only with the adapter's functions", () => {
  const { r, off } = setup();
  const core = ["form list", "form status", "form fields", "form get", "form set", "form submit", "form discard"];
  for (const name of core) assert.ok(r.get(name).title, name);
  for (const name of ["form add", "form remove", "form search", "form upload"]) assert.equal(r.get(name), undefined, name);
  assert.deepEqual(r.get("form submit").annotations, { consequential: true });
  off();
  assert.equal(r.get("form set"), undefined);

  const all = setup({ reloads: true, add() {}, remove() {}, search() {}, upload() {} }).r;
  for (const name of ["form add", "form remove", "form search", "form upload"]) assert.ok(all.get(name), name);
  assert.deepEqual(all.get("form submit").annotations, { consequential: true, navigates: true });
  assert.deepEqual(all.get("form remove").annotations, { consequential: true });
  assert.deepEqual(all.get("form upload").annotations, { consequential: true });
  assert.deepEqual(all.get("form search").annotations, { readOnly: true });
});

test("the adapter is checked", () => {
  const r = createRegistry();
  assert.throws(() => forms({ forms() {}, read() {}, write() {}, submit() {} }, { registry: r }), /reloads: true or false/);
  assert.throws(() => forms({ forms() {}, read() {}, write() {}, reloads: true }, { registry: r }), /submit\(form\)/);
  assert.throws(() => forms({ forms() {}, read() {}, write() {}, submit() {}, reloads: true, add: 1 }, { registry: r }), /add must be a function/);
});

test("form list, status and fields read the form as it is now", async () => {
  const { r, a } = setup();
  a.values.email = "ada@example.com";
  const list = await line(r, "form list");
  assert.deepEqual(list.data.forms, [{ form: "contact", label: "Contact", unsaved: 1, errors: 0 }]);

  const st = await line(r, "form status contact");
  assert.equal(st.text, "Unsaved changes in Contact: email. form submit contact sends them.");
  assert.deepEqual(st.data.unsaved, [{ field: "email", from: "", to: "ada@example.com" }]);
  assert.deepEqual(st.data.missing, []);
  assert.deepEqual(st.data.entity, { type: "message" });

  a.values.email = "";
  assert.match((await line(r, "form status contact")).text, /No unsaved changes in Contact\.\nStill required: email\./);

  const fields = await line(r, "form fields contact");
  const by = Object.fromEntries(fields.data.fields.map((f) => [f.field, f]));
  assert.equal(by.callback.format, "true or false");
  assert.equal(by.when.format, "YYYY-MM-DD", "an adapter type's format");
  assert.equal(by.map.type, "unsupported", "listed, never filled");
  assert.deepEqual(by.gear.options, { v60: "V60", aero: "AeroPress", pour: "Pour-over, by hand" });
});

test("an unknown form or field is an error that names the ones there are", async () => {
  const { r } = setup();
  const form = await line(r, "form status nope");
  assert.equal(form.code, EXIT.NOT_FOUND);
  assert.match(form.message, /no form "nope" on this page\. Open: contact\./);
  const field = await line(r, "form get contact nope");
  assert.equal(field.code, EXIT.USAGE);
  assert.match(field.message, /contact has no field "nope"\. Fields: email, topic, .*form fields contact lists them\./);
  assert.match((await line(r, "form set contact map x")).message, /no field "map"/, "an unsupported field cannot be set");
  const none = createRegistry();
  none.initialized();
  forms({ ...app().adapter, forms: () => [] }, { registry: none });
  assert.match((await line(none, "form status contact")).message, /there is no form on this page/);
  assert.equal((await line(none, "form list")).text, "There is no form on this page.");
});

test("form set converts the basic types, with messages that say what a field takes", async () => {
  const { r, a } = setup();
  assert.equal((await line(r, "form set contact callback yes")).data.to, true);
  assert.match((await line(r, "form set contact callback maybe")).message, /callback is a yes\/no field\. Use true or false\./);
  assert.equal((await line(r, "form set contact topic bug")).data.to, "bug");
  assert.equal((await line(r, 'form set contact topic "billing"')).data.to, "billing");
  assert.equal((await line(r, "form set contact topic BUG")).data.to, "bug", "a label in any case");
  assert.match((await line(r, "form set contact topic sales")).message, /topic takes one of: billing \(Billing\), bug \(Bug\)\./);
  assert.deepEqual((await line(r, 'form set contact gear "V60, Pour-over, by hand"')).data.to, ["v60", "pour"], "a label with a comma");
  assert.deepEqual((await line(r, 'form set contact gear \'["aero"]\'')).data.to, ["aero"]);
  assert.match((await line(r, "form set contact gear v60,kettle")).message, /no option "kettle"\. It takes one or more of: v60 \(V60\)/);
  assert.match((await line(r, "form set contact topic ''")).text, /topic: .* → \(empty\)/, "empty clears a choice that is not required");
  assert.match((await line(r, "form set contact when tomorrow")).message, /not a date/, "the adapter's type converts");
  assert.equal(a.values.when, undefined);
  const html = await line(r, "form set contact body '<p>Hi</p>'");
  assert.equal(html.text, 'body: "<p>Hi</p>" → "<p>Hi</p>". Not sent yet.');
});

test("form set names the fields an answer adds and removes", async () => {
  const { r } = setup();
  const res = await line(r, "form set contact topic billing");
  assert.equal(res.text, 'topic: (empty) → "billing". Not sent yet. The form now also asks for: invoice.');
  assert.deepEqual(res.data.added, ["invoice"]);
  const back = await line(r, "form set contact topic bug");
  assert.deepEqual(back.data.removed, ["invoice"]);
  assert.match(back.text, /No longer asked: invoice\./);
});

test("form submit checks required fields and the app's own check, then sends", async () => {
  const problems = [];
  const { r, a } = setup({ check: () => problems });
  assert.match((await line(r, "form submit contact")).message, /email is required\. Set it first, for example: form set contact email …/);
  await line(r, "form set contact email ada@example.com");
  problems.push({ field: "email", message: "Please include an @" });
  assert.match((await line(r, "form submit contact")).message, /form submit: email: Please include an @\./);
  problems.length = 0;
  const res = await line(r, "form submit contact");
  assert.equal(res.text, "Sent. Thank you.");
  assert.deepEqual(res.data, { form: "contact", submitted: true });
  assert.equal(a.sent[0].email, "ada@example.com");
});

test("form submit on a page that reloads starts Sutram again and submits after answering", async () => {
  const sent = [];
  const { r } = setup({ reloads: true, submit: (form) => sent.push(form.id), notes: { submit: () => "It will be published." } });
  await line(r, "form set contact email ada@example.com");
  assert.equal(r.get("form submit").confirm({ form: "contact" }), "Submit Contact with 1 change? It will be published.");
  const res = await line(r, "form submit contact");
  assert.match(res.text, /^Submitting Contact\. The page reloads; then messages says how it went/);
  assert.deepEqual(sent, [], "not before the answer");
  await tick();
  assert.deepEqual(sent, ["contact"]);
});

test("form discard puts back the values the form loaded with", async () => {
  const { r, a } = setup();
  await line(r, "form set contact email ada@example.com");
  await line(r, "form set contact gear v60");
  assert.equal(r.get("form discard").confirm({ form: "contact" }), "Discard the unsaved changes in email, gear?");
  const res = await line(r, "form discard contact");
  assert.deepEqual(res.data.discarded, ["email", "gear"]);
  assert.equal(a.values.email, "");
  assert.deepEqual(a.values.gear, []);
  assert.equal((await line(r, "form discard contact")).text, "Nothing to discard.");
});

test("a question for the person falls back to the generic one when the adapter is async", async () => {
  const { r } = setup({ forms: async () => app().adapter.forms() });
  assert.throws(() => r.get("form discard").confirm({ form: "contact" }));
  assert.equal((await line(r, "form status contact")).code, 0, "commands still run");
});

test("form add, remove, search and upload go to the adapter, with the kit's texts", async () => {
  const calls = [];
  const { r } = setup({
    add: (form, field, value) => { calls.push(["add", field, value]); return { data: { item: `${field}.1`, added: [`${field}.1.uri`, `${field}.1.title`] } }; },
    addable: () => [{ field: "links", label: "Links" }],
    remove: (form, target) => { calls.push(["remove", target]); return { data: { removed: target, items: 1 } }; },
    search: (form, field, text) => ({ data: { field, candidates: text === "cof" ? [{ value: "Coffee (3)", label: "Coffee", id: "3" }] : [] } }),
    upload: (form, field, files) => ({ data: { uploaded: files.map((f, i) => ({ field: `${field}.${i}`, filename: f.name, size: f.size, fid: 9 })) } }),
  });
  const add = await line(r, "form add contact links");
  assert.equal(add.text, "Added links.1 to Contact: links.1.uri, links.1.title. form set contact links.1.uri … fills it.");
  await line(r, "form add contact media Druplicon");
  assert.deepEqual(calls[1], ["add", "media", "Druplicon"]);
  assert.equal((await line(r, "form remove contact links.1")).text, "Removed links.1 from Contact; it has 1 item now. Not sent yet.");
  assert.equal((await line(r, "form search contact tags cof")).text, "Coffee (3)");
  assert.equal((await line(r, "form search contact tags zz")).text, 'Nothing in tags matches "zz".');
  const up = await line(r, 'form upload contact files --name=notes.txt --text="Grind at 18"');
  assert.equal(up.code, 0, up.message);
  assert.deepEqual(up.data.uploaded, [{ field: "files.0", filename: "notes.txt", size: 11, fid: 9 }], "the adapter's own keys pass through");
  assert.match((await line(r, "form upload contact files --text=a --base64=YQ== --name=a.txt")).message, /give one source/);
  assert.match((await line(r, "form upload contact files --text=a")).message, /give the file a name/);
  assert.match((await line(r, "form upload contact files --base64=@@@ --name=a.bin")).message, /not valid base64/);
  const data = await line(r, "form upload contact files data:text/plain;base64,SGk= --name=hi.txt");
  assert.deepEqual(data.data.uploaded[0], { field: "files.0", filename: "hi.txt", size: 2, fid: 9 });
});

test("an adapter's optional command must answer with data", async () => {
  const { r } = setup({ remove: () => ({ text: "done" }) });
  const res = await line(r, "form remove contact links.1");
  assert.equal(res.code, EXIT.FAILED);
  assert.match(res.message, /adapter answered without \{ data: \{ removed \} \}/);
});

test("completion: forms, fields, values of choices, and the adapter's lists", async () => {
  const { r } = setup({ add() {}, addable: () => [{ field: "links", label: "Links" }] });
  const values = async (line) => (await complete(r, line)).items.map((i) => i.value.trim());
  assert.deepEqual(await values("form status c"), ["contact"]);
  assert.ok((await values("form set contact t")).includes("topic"));
  assert.deepEqual(await values("form set contact topic b"), ["billing", "bug"]);
  assert.deepEqual(await values("form set contact callback t"), ["true"]);
  assert.deepEqual(await values("form add contact l"), ["links"]);
});
