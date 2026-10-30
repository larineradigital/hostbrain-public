import messages from "@/messages/en.json";

/** Copy from `messages/en.json`. One language for now (language selection is P2). */
export const copy = messages;

/** Fills `{name}` placeholders in a copy string. */
export const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
