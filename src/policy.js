// Who is asked before a command runs. Annotations describe a command; the
// policy decides, per kind of caller, which commands need the user's yes.
// Clients (the console, WebMCP, Sutram.call) consult it. The registry's run()
// stays neutral: app code that calls it directly is never asked.

/** How much a kind of caller is asked about, from least to most. */
export const LEVELS = Object.freeze(["none", "consequential", "changes"]);

/** The kind of caller a policy level applies to: a person at the console, or an agent. */
export const whoIs = (caller) => (caller === "console" ? "person" : caller === "agent" ? "agent" : null);

const check = (who, level) => {
  if (!["person", "agent"].includes(who)) throw new TypeError(`policy: unknown caller kind "${who}"; use person or agent`);
  if (!LEVELS.includes(level)) throw new TypeError(`policy: unknown level "${level}"; use ${LEVELS.join(", ")}`);
};

/**
 * Creates a policy. The default asks people and agents before consequential
 * commands only. `agent: "changes"` also asks before every command that is
 * not read-only, for apps where an agent should never change the document
 * unseen. `none` never asks.
 */
export function createPolicy({ person = "consequential", agent = "consequential" } = {}) {
  const levels = {};
  for (const [who, level] of Object.entries({ person, agent })) { check(who, level); levels[who] = level; }
  let asker = null;

  const policy = {
    /** The current levels, as { person, agent }. */
    get: () => ({ ...levels }),

    /** Changes one or both levels: set({ agent: "changes" }). */
    set(next = {}) {
      for (const [who, level] of Object.entries(next)) { check(who, level); levels[who] = level; }
    },

    /** True when this kind of caller must agree before the command runs. */
    needs(def, who) {
      const level = levels[who];
      if (!level || level === "none") return false;
      const a = (def && def.annotations) || {};
      if (a.consequential) return true;
      return level === "changes" && !a.readOnly;
    },

    /**
     * Sets the function that asks the user, for callers that cannot ask
     * themselves (an agent through WebMCP). It gets { who, caller, steps,
     * signal? }, where steps is [{ def, input }]; when the signal aborts, the
     * call is withdrawn and the question can go. It resolves to true for yes;
     * anything else is no. Every call that needs approval is asked about: a
     * yes covers that call only. A console sets itself as the asker when it
     * connects and none is set. Returns a function that removes it.
     */
    setAsker(fn) {
      if (typeof fn !== "function") throw new TypeError("policy: setAsker needs a function");
      asker = fn;
      return () => { if (asker === fn) asker = null; };
    },

    hasAsker: () => asker !== null,

    /**
     * Asks through the asker. Resolves to true when the user agreed, false
     * otherwise, including when there is no asker.
     */
    async ask(request) {
      if (!asker) return false;
      const { signal } = request;
      if (signal && signal.aborted) return false;
      let answer;
      try {
        // An aborted call withdraws its question: the answer is no.
        const aborted = signal && new Promise((resolve) => signal.addEventListener("abort", () => resolve(false), { once: true }));
        answer = await (aborted ? Promise.race([asker(request), aborted]) : asker(request));
      } catch (err) { console.error(err); return false; }
      if (signal && signal.aborted) return false;
      return answer === true;
    },
  };
  return policy;
}

/**
 * The question a command asks in its own words, or null when it has none.
 * `input` is the checked value. A confirm() that throws or returns no text
 * gets the generic question.
 */
export function ownQuestion(def, input) {
  if (typeof def.confirm !== "function") return null;
  try {
    const q = def.confirm(input);
    return typeof q === "string" && q ? q : null;
  } catch (err) {
    console.warn(`sutram: ${def.name}: confirm() failed, so the generic question is asked: ${(err && err.message) || err}`);
    return null;
  }
}

/** The question for a command without its own: its title when it has one, "Submit a form? (form submit)", else "Run form submit?". */
export const genericQuestion = (def) => (def.title ? `${def.title.trim().replace(/[.?!]+$/, "")}? (${def.name})` : `Run ${def.name}?`);
