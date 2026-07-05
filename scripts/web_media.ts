import fs from 'fs';
let content = fs.readFileSync('server.ts', 'utf8');

// Update /api/web/memories to accept media
content = content.replace(
  `app.post("/api/web/memories", requireDashboardAuth, async (req: any, res: any) => {
  const { content } = req.body;
  const phone = req.user.phone;
  if (!content) {`,
  `app.post("/api/web/memories", requireDashboardAuth, async (req: any, res: any) => {
  const { content: textContent, media } = req.body;
  const phone = req.user.phone;
  if (!textContent && !media) {`
);

content = content.replace(
  `raw_content: content,`,
  `raw_content: textContent || "[Media Upload]",`
);

content = content.replace(
  `const cleanJsonText = await parseWithFallback(systemPrompt, content);`,
  `const cleanJsonText = await parseWithFallback(systemPrompt, textContent || "", media);`
);

content = content.replace(
  `const embeddingValues = await safeEmbedContent(content);`,
  `const embeddingValues = await safeEmbedContent(textContent || "[Media Upload]");`
);

// We should also store the mediaUrl if we had one, but we don't upload it to a bucket in the web path right now, just passing it to Gemini.
// The user said "parse media", so passing it to the parsing agent is the goal.

fs.writeFileSync('server.ts', content);
