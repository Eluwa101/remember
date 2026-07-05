import fs from 'fs';

// 1. Fix server.ts JWT_SECRET
let serverContent = fs.readFileSync('server.ts', 'utf8');
serverContent = serverContent.replace(
  'const JWT_SECRET = process.env.JWT_SECRET || randomUUID(); // In production, set JWT_SECRET in .env',
  'const JWT_SECRET = process.env.JWT_SECRET || "fallback_dev_secret_key_123456789"; // Persists across restarts in dev'
);
fs.writeFileSync('server.ts', serverContent);

// 2. Fix App.tsx 401 handling
let appContent = fs.readFileSync('src/App.tsx', 'utf8');

// Need to call a logout function when 401 occurs in fetchUserData
appContent = appContent.replace(
  `      if (res.ok) {
        const data = await res.json();
        setMemories(data.memories || []);
        setReminders(data.reminders || []);
      }`,
  `      if (res.ok) {
        const data = await res.json();
        setMemories(data.memories || []);
        setReminders(data.reminders || []);
      } else if (res.status === 401) {
        // Token expired or invalid, log out
        handleLogout();
      }`
);

fs.writeFileSync('src/App.tsx', appContent);
