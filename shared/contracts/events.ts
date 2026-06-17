export type MarketSnapshotUpdatedEvent = {
  at: string;
  payload: {
    status: { status: string };
    summary: unknown;
    indices: { aspi: unknown; snp: unknown };
    topGainers: unknown[];
    topLosers: unknown[];
    mostActive: unknown[];
    sectorPerformance: Array<{
      sectorId: number;
      symbol: string;
      indexName: string;
      period: string;
      first: number | null;
      last: number | null;
      change: number | null;
      changePct: number | null;
    }>;
  };
};

export const EVENT_KEYS = {
  MARKET_SNAPSHOT_UPDATED: "market.snapshot.updated"
} as const;

