import assert from "node:assert/strict";
import { test } from "node:test";
import { webToolBlocked, withoutBlockedTools } from "./web-scope.ts";

test("a session started without --tools cannot use web or browser tools", () => {
	const argv = ["node", "pi", "-p", "hello"];
	assert.equal(webToolBlocked("mcp__web__firecrawl_search", argv), true);
	assert.equal(webToolBlocked("mcp__browser__browser_navigate", argv), true);
});

test("other tools are never blocked", () => {
	const argv = ["node", "pi"];
	assert.equal(webToolBlocked("read", argv), false);
	assert.equal(webToolBlocked("bash", argv), false);
	assert.equal(webToolBlocked("mcp__github__search_code", argv), false);
});

test("a run whose --tools names a web server can use that server only", () => {
	const argv = ["node", "pi", "--mode", "json", "--tools", "read,mcp__web__*", "Task: x"];
	assert.equal(webToolBlocked("mcp__web__firecrawl_scrape", argv), false);
	assert.equal(webToolBlocked("mcp__browser__browser_click", argv), true);
});

test("--tools that names no web server keeps them blocked", () => {
	const argv = ["node", "pi", "--tools", "read,bash"];
	assert.equal(webToolBlocked("mcp__web__firecrawl_search", argv), true);
});

test("blocked tools are left out of the request a session sends to the model", () => {
	const argv = ["node", "pi"];
	const payload = {
		model: "m",
		tools: [
			{ type: "function", function: { name: "read" } },
			{ type: "function", function: { name: "mcp__web__firecrawl_search" } },
			{ name: "mcp__browser__browser_click" },
			{ name: "bash" },
		],
	};
	const out = withoutBlockedTools(payload, argv) as typeof payload;
	assert.deepEqual(
		out.tools.map((t: { name?: string; function?: { name?: string } }) => t.function?.name ?? t.name),
		["read", "bash"],
	);
	assert.equal(out.model, "m");
});

test("a request without a tools list is passed through unchanged", () => {
	const payload = { model: "m", messages: [] };
	assert.equal(withoutBlockedTools(payload, ["node", "pi"]), payload);
});
