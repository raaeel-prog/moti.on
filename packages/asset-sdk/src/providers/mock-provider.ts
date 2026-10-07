import type { AssetProvider, AssetRecord, SearchResult } from "../contracts.js";

const MOCK_ASSETS: AssetRecord[] = [
  {
    id: "m-1",
    providerId: "mock",
    title: "Beautiful Landscape",
    type: "video",
    previewUrl: "//videos.pexels.com/video-files/856973/856973-hd_1920_1080_30fps.mp4",
    authorName: "John Doe",
    licenseName: "Free to use",
    dimensions: { width: 1920, height: 1080 },
    durationSeconds: 15
  },
  {
    id: "m-2",
    providerId: "mock",
    title: "City Timelapse",
    type: "video",
    previewUrl: "//videos.pexels.com/video-files/853789/853789-hd_1920_1080_25fps.mp4",
    authorName: "Jane Smith",
    licenseName: "Free to use",
    dimensions: { width: 1920, height: 1080 },
    durationSeconds: 12
  },
  {
    id: "m-3",
    providerId: "mock",
    title: "Abstract Gradient",
    type: "image",
    previewUrl: "//images.pexels.com/photos/2873277/pexels-photo-2873277.jpeg?auto=compress&cs=tinysrgb&w=800",
    authorName: "Studio X",
    licenseName: "Free to use"
  }
];

export const mockProvider: AssetProvider = {
  id: "mock",
  name: "Local Mock",
  capabilities: {
    canSearch: true,
    canFilterByCategory: false,
    hasPagination: false
  },
  
  async search(query: string): Promise<SearchResult> {
    const term = query.toLowerCase();
    const filtered = MOCK_ASSETS.filter(a => a.title.toLowerCase().includes(term));
    return {
      items: filtered,
      totalCount: filtered.length
    };
  }
};
