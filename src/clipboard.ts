interface ClipboardTextarea {
  value: string;
  readOnly: boolean;
  tabIndex: number;
  style: { position: string; inset: string; fontSize: string };
  setAttribute(name: string, value: string): void;
  focus(): void;
  select(): void;
  setSelectionRange(start: number, end: number): void;
  remove(): void;
}

interface ClipboardEnvironment {
  navigator?: { clipboard?: { writeText(text: string): Promise<void> } };
  document?: {
    createElement(tagName: "textarea"): ClipboardTextarea;
    body: { appendChild(node: ClipboardTextarea): unknown };
    execCommand?(command: string): boolean;
  };
}

export async function copyText(text: string): Promise<boolean> {
  const environment = globalThis as unknown as ClipboardEnvironment;
  const clipboard = environment.navigator?.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Local network addresses over HTTP often block the modern Clipboard API.
      // Continue with the user-gesture based fallback below.
    }
  }

  const clipboardDocument = environment.document;
  if (!clipboardDocument || typeof clipboardDocument.execCommand !== "function") return false;

  const textarea = clipboardDocument.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  textarea.tabIndex = -1;
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto -9999px";
  textarea.style.fontSize = "16px";
  clipboardDocument.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    return clipboardDocument.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}
