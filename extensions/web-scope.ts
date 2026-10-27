import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Web pages can carry instructions aimed at the model. The web and browser
// MCP servers are therefore usable only by runs whose --tools names them
// (the web-scout subagent: no bash, no edit), never by a session that can
// run commands.
const WEB_SERVERS = ["web", "browser"];

function serverOf(toolName: string): string | undefined {
	const match = /^mcp__(.+?)__/.exec(toolName);
	return match?.[1];
}

function namedInTools(server: string, argv: string[]): boolean {
	const i = argv.indexOf("--tools");
	if (i < 0) return false;
	return (argv[i + 1] ?? "").split(",").some((entry) => entry.trim().startsWith(`mcp__${server}__`));
}

export function webToolBlocked(toolName: string, argv: string[]): boolean {
	const server = serverOf(toolName);
	if (!server || !WEB_SERVERS.includes(server)) return false;
	return !namedInTools(server, argv);
}

type ToolDeclaration = { name?: string; function?: { name?: string } };

// Drops blocked tools from a provider request (OpenAI and Anthropic shapes).
// Pi builds a turn's tool list before extensions can deactivate MCP tools
// that connected during the turn, so this is where they are left out.
export function withoutBlockedTools(payload: unknown, argv: string[]): unknown {
	const tools = (payload as { tools?: unknown })?.tools;
	if (!Array.isArray(tools)) return payload;
	const kept = tools.filter((t: ToolDeclaration) => !webToolBlocked(t.function?.name ?? t.name ?? "", argv));
	return { ...(payload as object), tools: kept };
}

export default function (pi: ExtensionAPI) {
	pi.on("before_provider_request", (event) => withoutBlockedTools(event.payload, process.argv));

	pi.on("tool_call", (event) => {
		if (webToolBlocked(event.toolName, process.argv)) {
			return { block: true, reason: `${event.toolName} is only for the web-scout subagent; delegate web lookups to it.` };
		}
	});
}
