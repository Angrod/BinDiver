export type SortOrder = 'oldest' | 'newest' | 'price';
export type NameKind = 'full' | 'face' | 'token';

export interface Version {
  scryfallId: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  releasedAt: string;
  lang: string;
  finish: string;
  priceCents: number | null;
  frameGroup: string;
  lookFor: string;
  notes: string[];
  sameAs: string[];
  symbolSet: string | null;
  quietKind: string; // '' when the data has none
  key: string; // `${scryfallId}:${finish}`
}

export interface CardGroup {
  oracleId: string;
  name: string;
  qualifying: Version[];
  unpriced: Version[];
  /** Priced versions under the price in the same frame and finish as one at the price (findLookAlikes). */
  lookAlikes: Version[];
  totalVersions: number;
  summary: string;
  versionsByKey: Map<string, Version>;
}
