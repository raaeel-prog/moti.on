export interface AssetProvider {
  id: string;
  name: string;
  capabilities: {
    canSearch: boolean;
    canFilterByCategory: boolean;
    hasPagination: boolean;
  };
  search(query: string, options?: SearchOptions): Promise<SearchResult>;
  getCategory?(categoryId: string, options?: SearchOptions): Promise<SearchResult>;
}

export interface SearchOptions {
  page?: number;
  perPage?: number;
  signal?: AbortSignal;
}

export interface SearchResult {
  items: AssetRecord[];
  totalCount: number;
  nextPage?: number;
}

export interface AssetRecord {
  id: string;
  providerId: string;
  title: string;
  type: "video" | "image" | "audio";
  previewUrl: string;
  downloadUrl?: string;
  authorName?: string;
  authorUrl?: string;
  licenseName?: string;
  dimensions?: { width: number; height: number };
  durationSeconds?: number;
}
