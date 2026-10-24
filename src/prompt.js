// A prompt that hands a task to an agent that drives a browser (Playwright,
// a browser extension, a WebMCP browser). Commands run only in a running
// page, so the agent opens it and types into the console, where the person
// watches every command run.
//
// The prompt is short on purpose: it says the console exists and to ask it for
// help. help, man and the console's errors teach the rest, so the same text
// works on any page and never goes stale as the console changes. No DOM: the
// browser entry point fills in the page's title and URL.

/**
 * How to find and use a page's commands, for an agent that drives a browser:
 * the "use a Sutram page" skill (scripts/docs.mjs) is built from it.
 * agentPrompt() leaves these to the console, whose help prints the syntax.
 */
export const DISCOVERY_RULES = Object.freeze([
  "You do not know this page's commands yet. Find out, do not guess:\n  - help lists every command with its usage. help <provider> lists one group.\n  - man <command> explains one in full: arguments, output, examples. <command> -h shows short usage.\n  - status shows what every part of the page reports right now.",
  "Look before you change things. Commands marked [read-only] change nothing. [consequential] ones are hard to undo; the person is asked to confirm them. [navigates] ones leave the page, and [reinitializes] ones may start Sutram again; put either last in a block.",
  "When a command says Sutram is starting again, or a page loads, wait until it is ready (the console is back; with JavaScript, await Sutram.ready), then look again with status, and with messages where the page has it: it says what the page showed, such as Saved or an error. Nothing carries over from before: remember yourself what you need, such as who was logged in, and compare.",
  "Options are GNU style: --name=value. Quote values that contain spaces. For long or multi-line text, such as HTML, end the line with <<END, put the text on the next lines as it is (no escaping), then a line with only END. Add --json to any command to get its raw data, --json=a,b for only some fields.",
  "Commands come and go with the page's state: one may appear only after an earlier step, such as a form field after a choice. When you expect a new command or field, look again (help, or the provider's fields or status command). Where the page declares events (events list), events wait <name> waits for the one you expect instead of asking again and again. A block is checked before any line in it runs, so put a command that only appears after an earlier step in your next block.",
  "Change one thing per command. When one fails, read its message, fix that one command, and carry on; do not start over.",
]);

/** The prompt for `task`. `page` names the page the agent is to open. */
export function agentPrompt(task = "", { title, url } = {}) {
  const page = [title, url && `(${url})`].filter(Boolean).join(" ");
  return `Use a web page for me through Sutram, a command line built into the page. You need a real browser you can drive (Playwright, a browser extension, a WebMCP browser): the commands only exist in a running page, so fetching the URL is not enough.

Open ${url || "the page"} and type the commands into its console: it is the <sutram-console> element, usually opened with the key left of 1 (\`). That way I see every command as it runs. Use the page's WebMCP tools or Sutram.call() only if you cannot type into the console.

Do not guess commands: the console explains itself. Start with help, then status, and ask the console (man <command>, <command> -h) whenever you are unsure. When a command fails, read the message and fix it. Commands that are hard to undo ask me first; never confirm one for me. When the task is done, say "Done" and summarise what changed.
${page ? `\nThe page: ${page}\n` : ""}
My task: ${String(task).trim() || "Show me what this page can do."}`;
}
