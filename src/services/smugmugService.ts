import axios from "axios";

// Start OAuth flow (returns authorizeUrl or token info)
export async function startSmugMugOAuth() {
  const res = await axios.post("/api/smugmug-new/oauth/start", {});
  return res.data;
}

// Complete OAuth flow (exchange verifier for access token)
export async function completeSmugMugOAuth(params: Record<string, any>) {
  const res = await axios.post("/api/smugmug-new/oauth/callback", params);
  return res.data;
}

// Get albums for the connected user
export async function getSmugMugAlbums() {
  const res = await axios.get("/api/smugmug-new/albums");
  return res.data;
}

// Import an album by key
export async function importSmugMugAlbum(albumKey: string) {
  const res = await axios.post("/api/smugmug-new/import", { albumKey });
  return res.data;
}
