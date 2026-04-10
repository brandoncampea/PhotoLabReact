import { useState } from "react";
import SmugMugConnect from "../components/SmugMugConnect";
import { getSmugMugAlbums, importSmugMugAlbum } from "../services/smugmugService";

export default function SmugMugImportPage() {
  const [account, setAccount] = useState<{ nickname: string } | null>(null);
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const fetchAlbums = async () => {
    setLoading(true);
    setNotice("");
    try {
      const data = await getSmugMugAlbums();
      setAlbums(Array.isArray(data.albums) ? data.albums : []);
      setNotice(`Loaded ${data.albums?.length || 0} albums.`);
    } catch (err: any) {
      setNotice(err?.message || "Failed to load albums");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (albumKey: string) => {
    setImporting(albumKey);
    setNotice("");
    try {
      await importSmugMugAlbum(albumKey);
      setNotice("Import started. Check import progress in the admin panel.");
    } catch (err: any) {
      setNotice(err?.message || "Failed to import album");
    } finally {
      setImporting(null);
    }
  };

  const handleConnected = (acc: { nickname: string }) => setAccount(acc);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <h2>Import from SmugMug</h2>
      <SmugMugConnect onConnected={handleConnected} />
      {account && (
        <div>
          <button onClick={fetchAlbums} disabled={loading} style={{ marginBottom: 16 }}>
            {loading ? "Loading Albums..." : "Load Albums"}
          </button>
          {notice && <div style={{ marginBottom: 12, color: "#666" }}>{notice}</div>}
          {albums.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th align="left">Album Name</th>
                  <th align="left">Description</th>
                  <th align="left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {albums.map((album: any) => (
                  <tr key={album.albumKey}>
                    <td>{album.name}</td>
                    <td>{album.description || ""}</td>
                    <td>
                      <button
                        onClick={() => handleImport(album.albumKey)}
                        disabled={!!importing}
                      >
                        {importing === album.albumKey ? "Importing..." : "Import"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No albums loaded.</p>
          )}
        </div>
      )}
    </div>
  );
}
