import { describe, expect, it } from "vitest";

import { applyEvent, initialProgress } from "@/lib/guide/progress";
import { hasSignal, quizInputSchema } from "@/lib/guide/quiz";
import { parseSse } from "@/lib/guide/sse";
import type { GenerationEvent } from "@/lib/guide/types";

const sse = (event: GenerationEvent) => `data: ${JSON.stringify(event)}\n\n`;

describe("parseSse", () => {
  it("returns complete events and keeps a partial one for the next chunk", () => {
    const first = sse({ type: "step", step: "taste", status: "done", label: "Reading your taste" });
    const second = sse({ type: "done", guideId: "g", token: "t" });
    const cut = 10;
    const a = parseSse(first + second.slice(0, cut));
    expect(a.events).toEqual([
      { type: "step", step: "taste", status: "done", label: "Reading your taste" },
    ]);
    const b = parseSse(a.rest + second.slice(cut));
    expect(b.events).toEqual([{ type: "done", guideId: "g", token: "t" }]);
    expect(b.rest).toBe("");
  });

  it("skips malformed events and comments", () => {
    const { events } = parseSse(`: ping\n\ndata: {oops\n\n${sse({ type: "error", message: "x" })}`);
    expect(events).toEqual([{ type: "error", message: "x" }]);
  });
});

describe("building progress", () => {
  it("starts with every step pending and the street in the restaurant line", () => {
    const progress = initialProgress("Rua Nova");
    expect(progress.phase).toBe("running");
    expect(progress.rows.every((row) => row.status === "pending")).toBe(true);
    expect(progress.rows.find((row) => row.step === "eat")?.label).toContain("Rua Nova");
  });

  it("ticks steps, drops skipped ones and never moves a done step back", () => {
    let p = initialProgress("Rua Nova");
    p = applyEvent(p, { type: "step", step: "drink", status: "active", label: "Cafés" });
    expect(p.rows.find((r) => r.step === "drink")).toMatchObject({
      status: "active",
      label: "Cafés",
    });
    p = applyEvent(p, { type: "step", step: "drink", status: "done", label: "Cafés", count: 4 });
    p = applyEvent(p, { type: "step", step: "drink", status: "active", label: "Cafés" });
    expect(p.rows.find((r) => r.step === "drink")?.status).toBe("done");
    p = applyEvent(p, { type: "step", step: "host_picks", status: "skipped", label: "Host" });
    expect(p.rows.some((r) => r.step === "host_picks")).toBe(false);
  });

  it("marks everything done on done, and failed on error", () => {
    const start = initialProgress("Rua Nova");
    const done = applyEvent(start, { type: "done", guideId: "g", token: "t" });
    expect(done.phase).toBe("done");
    expect(done.rows.every((r) => r.status === "done")).toBe(true);
    expect(applyEvent(start, { type: "error", message: "boom" }).phase).toBe("failed");
  });
});

describe("quiz input", () => {
  const empty = { artists: [], media: [], tags: [], dietary: [] };

  it("needs at least one signal", () => {
    expect(hasSignal(empty)).toBe(false);
    expect(hasSignal({ ...empty, tags: ["cosy"] })).toBe(true);
  });

  it("caps picks at five and rejects odd entity IDs", () => {
    const pick = (i: number) => ({ entityId: `FIX-A-00${i}`, name: `Artist ${i}` });
    const six = Array.from({ length: 6 }, (_, i) => pick(i));
    expect(quizInputSchema.safeParse({ ...empty, artists: six }).success).toBe(false);
    expect(quizInputSchema.safeParse({ ...empty, artists: six.slice(0, 5) }).success).toBe(true);
    expect(
      quizInputSchema.safeParse({ ...empty, media: [{ entityId: "a b", name: "x" }] }).success,
    ).toBe(false);
  });
});
