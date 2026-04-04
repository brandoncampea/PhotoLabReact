/**
 * Utility functions for detecting player names in photo filenames
 */

/**
 * Normalize text for comparison: lowercase, trim, remove extra spaces
 */
const normalize = (text: string): string => {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
};

/**
 * Check if a normalized name is a substring of normalized text
 * This helps find "John Smith" in "John_Smith_Photo.jpg", "photo_john smith_2024.jpg", or "JOHNSMITH.jpg"
 */
const isNameInText = (name: string, text: string): boolean => {
  const normalized = normalize(name);
  const normalizedText = normalize(text.replace(/[_\-\s]/g, ' '));
  
  // Split name into parts and check if all parts exist in sequence
  const nameParts = normalized.split(' ');
  const textParts = normalizedText.split(' ').map(p => p.replace(/[^a-z0-9]/g, ''));
  
  // Check if all name parts appear in the text as substrings
  return nameParts.every(part => 
    textParts.some(textPart => {
      const cleanPart = part.replace(/[^a-z0-9]/g, '');
      return textPart.includes(cleanPart) || cleanPart.includes(textPart);
    })
  );
};

/**
 * Extract player names from a list of filenames
 * Returns array of detected player names from the roster
 */
export function detectPlayersFromFilenames(
  filenames: string[],
  rosterPlayers: Array<{ playerName: string; playerNumber?: string }>
): Array<{ playerName: string; playerNumber?: string }> {
  const detected = new Set<string>();

  for (const filename of filenames) {
    // Remove extension
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
    
    for (const player of rosterPlayers) {
      // Check if player name appears in filename
      if (isNameInText(player.playerName, nameWithoutExt)) {
        detected.add(player.playerName);
      }
    }
  }

  // Return players in roster order to maintain consistency
  return rosterPlayers.filter(p => detected.has(p.playerName));
}

/**
 * Extract potential player names from filenames when no roster is available
 * Looks for capitalized words and name patterns in the filename
 * e.g., "FaithKert51.jpg" -> ["Faith", "Kert"], "John_Smith_photo.jpg" -> ["John", "Smith"]
 */
export function extractPotentialPlayerNamesFromFilenames(
  filenames: string[]
): string[] {
  const potentialNames = new Set<string>();

  for (const filename of filenames) {
    // Remove extension and numbers
    const nameWithoutExt = filename
      .replace(/\.[^/.]+$/, '') // remove extension
      .replace(/\d+/g, ' ') // replace numbers with spaces
      .trim();

    // Match capitalized words or word sequences
    // Handles: "FaithKert", "Faith_Kert", "Faith-Kert", "Faith Kert"
    const words = nameWithoutExt
      .split(/[\s_\-]+/) // split by separators
      .filter(w => w.length > 0);

    // Also handle camelCase: "FaithKert" -> ["Faith", "Kert"]
    for (const word of words) {
      // Split camelCase into words
      const camelCaseParts = word.replace(/([A-Z])/g, ' $1').trim().split(/\s+/);
      camelCaseParts.forEach(part => {
        if (part.length > 1) { // At least 2 chars to be a name
          potentialNames.add(formatPlayerName(part));
        }
      });
    }
  }

  return Array.from(potentialNames).sort();
}

/**
 * Format a player name for display (capitalize properly)
 * e.g., "john smith" -> "John Smith"
 */
export function formatPlayerName(name: string): string {
  return name
    .toLowerCase()
    .split(/[\s\-_]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
