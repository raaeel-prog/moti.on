import type { AssetRecord } from "@motion/asset-sdk";

export interface AssetGridOptions {
  assets: AssetRecord[];
  onSelect?: (asset: AssetRecord) => void;
}

export function assetGrid(document: Document, options: AssetGridOptions): HTMLElement {
  const container = document.createElement("div");
  container.className = "chms-asset-grid";

  if (options.assets.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "chms-asset-grid-empty";
    emptyState.textContent = "Nenhum asset encontrado.";
    container.appendChild(emptyState);
    return container;
  }

  for (const asset of options.assets) {
    const card = document.createElement("div");
    card.className = "chms-asset-card";
    
    // In Premiere/After Effects panel, video playback might be restricted or slow. 
    // Usually a thumbnail is preferred. For this mock, we will use a video element if it's a video,
    // or an image if it's an image.
    if (asset.type === "video") {
      const vid = document.createElement("video");
      vid.className = "chms-asset-thumbnail";
      vid.src = asset.previewUrl;
      vid.muted = true;
      vid.loop = true;
      
      // Hover to play
      card.addEventListener("mouseenter", () => void vid.play().catch(() => {}));
      card.addEventListener("mouseleave", () => void vid.pause());
      card.appendChild(vid);
    } else {
      const img = document.createElement("img");
      img.className = "chms-asset-thumbnail";
      img.src = asset.previewUrl;
      card.appendChild(img);
    }

    const title = document.createElement("div");
    title.className = "chms-asset-title";
    title.textContent = asset.title;

    const author = document.createElement("div");
    author.className = "chms-asset-author";
    author.textContent = asset.authorName ? `Por ${asset.authorName}` : "Desconhecido";

    card.appendChild(title);
    card.appendChild(author);

    if (options.onSelect) {
      card.addEventListener("click", () => options.onSelect!(asset));
    }
    
    container.appendChild(card);
  }

  return container;
}
