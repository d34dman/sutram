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

    /** Stops asking this kind of caller about ordinary changes: "changes" becomes "consequential". */
    relax(who) {
      if (levels[who] === "changes") levels[who] = "consequential";
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
     * themselves (an agent through WebMCP). It gets { who, caller, steps },
     * where steps is [{ def, input }], and resolves to true, false, or
     * "always": yes, and stop asking this kind of caller about ordinary
     * changes for the rest of the page's life. A console sets itself as the
     * asker when it connects and none is set. Returns a function that removes it.
     */
    setAsker(fn) {
      if (typeof fn !== "function") throw new TypeError("policy: setAsker needs a function");
      asker = fn;
      return () => { if (asker === fn) asker = null; };
    },

    hasAsker: () => asker !== null,

    /**
     * Asks through the asker. Resolves to true when the user agreed, false
     * otherwise, including when there is no asker. "always" lowers the
     * level from "changes" to "consequential"; it never covers a
     * consequential command.
     */
    async ask(request) {
      if (!asker) return false;
      let answer;
      try { answer = await asker(request); } catch (err) { console.error(err); return false; }
      if (answer === "always" && !request.steps.some((s) => s.def.annotations.consequential)) policy.relax(request.who);
      return answer === true || answer === "always";
    },
  };
  return policy;
}

/** The question a command asks in its own words, or null when it has none. */
export const ownQuestion = (def, input) => (typeof def.confirm === "function" ? def.confirm(input) : null);
