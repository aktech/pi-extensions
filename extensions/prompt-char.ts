import { CustomEditor } from "@earendil-works/pi-coding-agent";

class PromptCharEditor extends CustomEditor {
  // Override setPaddingX to enforce minimum of 2 for prompt char
  setPaddingX(padding: number): void {
    super.setPaddingX(Math.max(padding, 2));
  }

  render(width: number): string[] {
    const lines = super.render(width);
    // lines[0] = top border, lines[1] = first content line with padding
    for (let i = 1; i < lines.length; i++) {
      // Find first content line (starts with spaces, not border chars)
      if (lines[i].startsWith("  ")) {
        lines[i] = "❯ " + lines[i].slice(2);
        break;
      }
    }
    return lines;
  }
}

export default function (pi: any) {
  pi.on("session_start", async (_event: any, ctx: any) => {
    ctx.ui.setEditorComponent((tui: any, theme: any, keybindings: any) => {
      const editor = new PromptCharEditor(tui, theme, keybindings, { paddingX: 2 });
      return editor;
    });
  });
}
