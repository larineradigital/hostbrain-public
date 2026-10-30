import { distanceM, type Point } from "@/lib/geo/distance";

import type { QlooEntity } from "./schemas";

/** What search UIs (host picks, quiz chips) need from a Qloo entity. */
export interface SearchItem {
  entityId: string;
  name: string;
  detail?: string;
  address?: string;
  imageUrl?: string;
  distanceM?: number;
}

export function toSearchItem(entity: QlooEntity, near?: Point): SearchItem {
  const p = entity.properties;
  const distance =
    entity.distanceM ??
    (near && entity.location
      ? distanceM(near, { lat: entity.location.lat, lng: entity.location.lon })
      : undefined);
  // Qloo sometimes repeats the name as the disambiguation ("PEGGY GOU"); that adds nothing.
  const detail = entity.disambiguation ?? p.neighborhood;
  const repeatsName = detail?.trim().toLowerCase() === entity.name.trim().toLowerCase();
  return {
    entityId: entity.entityId,
    name: entity.name,
    detail: repeatsName ? undefined : detail,
    address: p.address,
    imageUrl: p.image?.url,
    distanceM: distance === undefined ? undefined : Math.round(distance),
  };
}
