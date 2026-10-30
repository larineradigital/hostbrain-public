import { describe, expect, it } from "vitest";

import { entitySchema } from "@/lib/qloo/schemas";
import { toSearchItem } from "@/lib/qloo/view";

// Synthetic shapes only (fictional names, FIX- IDs).

describe("toSearchItem", () => {
  it("drops a disambiguation that only repeats the name", () => {
    const entity = entitySchema.parse({
      entity_id: "FIX-A-1",
      name: "MARA SOLÉ",
      disambiguation: "Mara Solé",
    });
    expect(toSearchItem(entity).detail).toBeUndefined();
  });

  it("keeps a real disambiguation", () => {
    const entity = entitySchema.parse({
      entity_id: "FIX-A-2",
      name: "Mara Solé",
      disambiguation: "Lisbon singer",
    });
    expect(toSearchItem(entity).detail).toBe("Lisbon singer");
  });
});
