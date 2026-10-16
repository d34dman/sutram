// A prompt for a chat assistant with no browser access (ChatGPT, Claude). The
// assistant answers with command lines, a person pastes them into the console
// (which runs a pasted batch in order) and pastes the output back.
//
// The prompt is generic, like a skill: it lists no commands. The assistant
// finds them with help, man and status, so the same text works on any page and
// never goes stale as commands come and go. No DOM: the browser entry point
// fills in the page's title and URL.

/** The prompt for `task`. `page` names the page the assistant is working on. */
export function agentPrompt(task = "", { title, url } = {}) {
  const page = [title, url && `(${url})`].filter(Boolean).join(" ");
  return `You are helping me use a web page through Sutram, a command line built into the page. You cannot see the page. I run the commands you give me in the page's console and paste back what it prints.

How to reply:
- Put the commands to run in one \`\`\`sh code block, one command per line, nothing else in the block. I paste the whole block: the lines run top to bottom and stop at the first error.
- You do not know this page's commands yet. Find out, do not guess:
  - help lists every command with its usage. help <provider> lists one group.
  - man <command> explains one in full: arguments, output, examples. <command> -h shows short usage.
  - status shows what every part of the page reports right now.
  So your first block is: help, then status.
- Look before you change things. Commands marked [read-only] change nothing. [consequential] ones are hard to undo; I will be asked to confirm them. [navigates] ones leave the page.
- Options are GNU style: --name=value. Quote values that contain spaces. Add --json to any command to get its raw data.
- Commands come and go with the page's state: one may appear only after an earlier step. When you expect a new command, end the block and run help again.
- After I paste the output, continue until the task is done. Then say "Done" and summarise what changed.
${page ? `\nThe page: ${page}\n` : ""}
My task: ${String(task).trim() || "Show me what this page can do."}`;
}
