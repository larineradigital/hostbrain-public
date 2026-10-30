import "server-only";

import { readServerEnv } from "@/lib/env";
import { searchArtists, searchMedia } from "@/lib/qloo/endpoints";
import { toSearchItem } from "@/lib/qloo/view";

import type { PopularPicks, QuizPick } from "./quiz";

/**
 * "Popular picks" shown before the guest types in the quiz. Each is a Qloo `/search` hit for
 * a well-known name, so every chip is a real Qloo entity; searches are cached in
 * `qloo_cache`, so only the first visit pays for them. Mock mode searches the fixtures.
 */
const QUERIES = {
  live: {
    artist: ["Daft Punk", "Adele", "Bad Bunny", "Radiohead", "Beyoncé", "Coldplay"],
    media: ["Spirited Away", "The Bear", "Amélie", "Succession", "Parasite", "Fleabag"],
  },
  mock: {
    artist: ["Mara Solé", "The Velvet Tides", "Neon Harbour", "Okra Moon", "Lumi Okafor"],
    media: ["A Quiet Tram", "Saltwater Postcards", "Fixture Bay", "Orbit of Small Things"],
  },
} as const;

export async function loadPopularPicks(): Promise<PopularPicks> {
  const queries = QUERIES[readServerEnv().QLOO_MODE === "mock" ? "mock" : "live"];
  const first = async (search: typeof searchArtists, query: string) => {
    try {
      const { items } = await search(query, { take: 1 });
      const item = items[0] && toSearchItem(items[0]);
      return item ? [{ entityId: item.entityId, name: item.name, imageUrl: item.imageUrl }] : [];
    } catch {
      // Popular picks are a nicety; type-ahead still works without them.
      return [];
    }
  };
  const [artist, media] = await Promise.all([
    Promise.all(queries.artist.map((q) => first(searchArtists, q))),
    Promise.all(queries.media.map((q) => first(searchMedia, q))),
  ]);
  const unique = (picks: QuizPick[]) =>
    picks.filter((p, i) => picks.findIndex((o) => o.entityId === p.entityId) === i);
  return { artist: unique(artist.flat()), media: unique(media.flat()) };
}
