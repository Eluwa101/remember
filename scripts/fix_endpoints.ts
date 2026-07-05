import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

// Dashboard summary
content = content.replace(
  /app\.get\("\/api\/dashboard\/summary", requireDashboardAuth, async \(req, res\) => \{\n\s*try \{\n\s*const phone = req\.query\.phone as string;/,
  `app.get("/api/dashboard/summary", requireDashboardAuth, async (req: any, res: any) => {
  try {
    const phone = req.user.phone;`
);
content = content.replace(
  /if \(\!phone\) \{\n\s*res\.status\(400\)\.json\(\{ error: "Phone number required" \}\);\n\s*return;\n\s*\}/,
  `` // We don't need this check anymore because it's guaranteed by auth middleware
);


// Post memories
content = content.replace(
  /app\.post\("\/api\/web\/memories", requireDashboardAuth, async \(req, res\) => \{\n\s*const \{ phone, content \} = req\.body;\n\s*if \(\!phone \|\| \!content\) \{/,
  `app.post("/api/web/memories", requireDashboardAuth, async (req: any, res: any) => {
  const { content } = req.body;
  const phone = req.user.phone;
  if (!content) {`
);

// Delete memory
content = content.replace(
  /app\.post\("\/api\/web\/memories\/delete", requireDashboardAuth, async \(req, res\) => \{\n\s*try \{\n\s*const \{ id, phone \} = req\.body;\n\s*if \(\!id \|\| \!phone\) \{/,
  `app.post("/api/web/memories/delete", requireDashboardAuth, async (req: any, res: any) => {
  try {
    const { id } = req.body;
    const phone = req.user.phone;
    if (!id) {`
);

fs.writeFileSync('server.ts', content);
