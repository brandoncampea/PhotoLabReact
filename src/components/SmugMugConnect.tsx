import { useState } from "react";

type SmugMugConnectProps = {
  onConnected?: (account: { nickname: string }) => void;
};
export default function SmugMugConnect({ onConnected }: SmugMugConnectProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [account, setAccount] = useState<{ nickname: string } | null>(null);
  const [error, setError] = useState("");

  // Placeholder for OAuth logic
  const handleConnect = async () => {
    setIsConnecting(true);
    setError("");
    try {
      // TODO: Implement in-page OAuth flow (likely via backend redirect or PKCE)
      // Simulate connection for now
      setTimeout(() => {
        setIsConnected(true);
        setAccount({ nickname: "demoUser" });
        setIsConnecting(false);
        if (onConnected) onConnected({ nickname: "demoUser" });
      }, 1000);
    } catch (e) {
      setError("Failed to connect to SmugMug.");
      setIsConnecting(false);
    }
  };

  if (isConnected && account) {
    return (
      <div>
        <h3>Connected to SmugMug as {account.nickname}</h3>
      </div>
    );
  }

  return (
    <div>
      <button onClick={handleConnect} disabled={isConnecting}>
        {isConnecting ? "Connecting..." : "Connect to SmugMug"}
      </button>
      {error && <div style={{ color: "red" }}>{error}</div>}
    </div>
  );
}
