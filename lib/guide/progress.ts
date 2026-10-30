import { GENERATION_STEPS, type GenerationEvent, type GenerationStep } from "./types";

/** The building screen's step list, updated from generation events. */

export interface ProgressRow {
  step: GenerationStep;
  label: string;
  status: "pending" | "active" | "done";
}

export interface Progress {
  rows: ProgressRow[];
  phase: "running" | "done" | "failed";
  /** Another request is running this guide; the screen polls for the result. */
  waiting?: boolean;
  error?: string;
}

/** Labels before the first event; the server's own labels replace them as steps start. */
export function initialProgress(street: string): Progress {
  const labels: Record<GenerationStep, string> = {
    taste: "Reading your taste",
    eat: `Finding restaurants near ${street} that fit you`,
    drink: "Picking bars and cafés",
    do: "Choosing things to do",
    rainy: "Finding rainy-day plans",
    host_picks: "Ranking your host's favourite spots for you",
    playlist: "Making your playlist",
    films: "Choosing films and shows",
    heatmap: "Mapping your taste",
    writing: "Writing your guide",
    saving: "Putting it together",
  };
  return {
    rows: GENERATION_STEPS.map((step) => ({ step, label: labels[step], status: "pending" })),
    phase: "running",
  };
}

export function applyEvent(progress: Progress, event: GenerationEvent): Progress {
  switch (event.type) {
    case "step": {
      const { step, status, label } = event;
      // A skipped step (no host picks, no taste signals) leaves the list.
      if (status === "skipped") {
        return { ...progress, rows: progress.rows.filter((row) => row.step !== step) };
      }
      return {
        ...progress,
        rows: progress.rows.map((row) =>
          row.step === step
            ? // Steps run in parallel; a late "active" never undoes "done".
              { ...row, label, status: row.status === "done" ? "done" : status }
            : row,
        ),
      };
    }
    case "done":
      return {
        rows: progress.rows.map((row) => ({ ...row, status: "done" })),
        phase: "done",
      };
    case "error":
      return { ...progress, phase: "failed", error: event.message };
  }
}
