import { useState } from 'react';
import styles from './PlayerSearch.module.css';

interface SearchResult {
  id: number;
  fileName: string;
  playerName: string;
  playerNumber: string;
  thumbnailUrl: string;
}

export default function PlayerSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/photos/album/1?playerName=${encodeURIComponent(query)}`); // TODO: Use actual albumId
      const data = await response.json();
      setResults(data);
    } catch (err) {
      setResults([]);
    }
    setLoading(false);
  };

  return (
    <div>
      <h2>Search by Player Name/Number</h2>
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Enter player name or number"
      />
      <button onClick={handleSearch} disabled={loading || !query}>Search</button>
      {loading && <div>Loading...</div>}
      <ul>
        {results.map(r => (
          <li key={r.id}>
            <img src={r.thumbnailUrl} alt={r.fileName} className={styles.playersearchImg} />
            {r.fileName} — {r.playerName} #{r.playerNumber}
          </li>
        ))}
      </ul>
    </div>
  );
}
