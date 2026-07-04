const PATTERNS = [
  /^(\d+)\s*\|\s*(\d+)/,
  /^(\d+)\s*-\s*(\d+)/,
  /^(\d+)\s*\(\s*(\d+)\s*\)/,
  /^(\d+)\s+(\d+)/,
];

function parseUserInput(text) {
  const results = [];
  const seen = new Set();
  const errors = [];

  String(text || '')
    .split(/\r?\n/)
    .forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (!line || /^user\s*\|/i.test(line)) {
        return;
      }

      let userId = null;
      let zoneId = null;

      for (const pattern of PATTERNS) {
        const match = line.match(pattern);
        if (match) {
          userId = match[1];
          zoneId = match[2];
          break;
        }
      }

      if (!userId || !zoneId) {
        errors.push(`Baris ${index + 1}: format tidak dikenali (${line})`);
        return;
      }

      const key = `${userId}|${zoneId}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      results.push({ userId, zoneId });
    });

  return { users: results, errors };
}

module.exports = {
  parseUserInput,
};