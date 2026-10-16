// A prompt for a chat assistant with no browser access (ChatGPT, Claude). The
// assistant answers with command lines, a person pastes them into the console
// (which runs a pasted batch in order) and pastes the output back.
//
// The prompt is generic, like a skill: it lists no commands. The assistant
// finds them with help, man and status, so the same text works on any page and
// never goes stale as commands come and go. No DOM: the browser entry point
// fills in the page's title and URL.

/**
 * How to find and use a page's commands, for any agent. Shared by the chat
 * prompt below and by the "use a Sutram page" skill (scripts/docs.mjs), so
 * the two never disagree.
 */
export const DISCOVERY_RULES = Object.freeze([
  "You do not know this page's commands yet. Find out, do not guess:\n  - help lists every command with its usage. help <provider> lists one group.\n  - man <command> explains one in full: arguments, output, examples. <command> -h shows short usage.\n  - status shows what every part of the page reports right now.",
  "Look before you change things. Commands marked [read-only] change nothing. [consequential] ones are hard to undo; the person is asked to confirm them. [navigates] ones leave the page.",
  "Options are GNU style: --name=value. Quote values that contain spaces. For long or multi-line text, such as HTML, end the line with <<END, put the text on the next lines as it is (no escaping), then a line with only END. Add --json to any command to get its raw data, --json=a,b for only some fields.",
  "Commands come and go with the page's state: one may appear only after an earlier step, such as a form field after a choice. When you expect a new command or field, look again (help, or the provider's fields or status command). A block is checked before any line in it runs, so put a command that only appears after an earlier step in your next block.",
  "Change one thing per command. When one fails, read its message, fix that one command, and carry on; do not start over.",
]);

const bullet = (s) => `- ${s}`;

/** The prompt for `task`. `page` names the page the assistant is working on. */
export function agentPrompt(task = "", { title, url } = {}) {
  const page = [title, url && `(${url})`].filter(Boolean).join(" ");
  return `You are helping me use a web page through Sutram, a command line built into the page. You cannot see the page. I run the commands you give me in the page's console and paste back what it prints.

How to reply:
- Put the commands to run in one \`\`\`sh code block, one command per line, nothing else in the block. I paste the whole block: the lines run top to bottom and stop at the first error.
${DISCOVERY_RULES.map(bullet).join("\n")}
- Your first block is: help, then status.
- After I paste the output, continue until the task is done. Then say "Done" and summarise what changed.
${page ? `\nThe page: ${page}\n` : ""}
My task: ${String(task).trim() || "Show me what this page can do."}`;
}
