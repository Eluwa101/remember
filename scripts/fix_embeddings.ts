import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

const helper = `
async function safeEmbedContent(text: string): Promise<number[] | null> {
  try {
    const res = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: text
    });
    return res.embeddings?.[0]?.values || null;
  } catch (err: any) {
    console.error("[Embedding Error] Skipping embedding:", err.message);
    return null;
  }
}
`;

content = content.replace(
  '// Helper to send WhatsApp messages',
  helper + '\n// Helper to send WhatsApp messages'
);


// Fix search
content = content.replace(
  /const embedResponse = await ai\.models\.embedContent\(\{\n\s*model: "text-embedding-004",\n\s*contents: cleanedQuery\n\s*\}\);\n\n\s*const embeddingValues = embedResponse\.embeddings\?\.\[0\]\?\.values;\n\n\s*if \(\!embeddingValues\) \{\n\s*throw new Error\("Failed to generate embedding vectors\."\);\n\s*\}/,
  `const embeddingValues = await safeEmbedContent(cleanedQuery);
      if (!embeddingValues) {
        await sendWhatsApp(phone, "Semantic search is unavailable. Please configure a valid Gemini API Key in the AI Studio Secrets panel.");
        return;
      }`
);


// Fix webhook save
content = content.replace(
  /const \[cleanJsonText, embedResponse\] = await Promise\.all\(\[\n\s*parseWithFallback\(systemPrompt, queryText, mediaData\),\n\s*ai\.models\.embedContent\(\{\n\s*model: "text-embedding-004",\n\s*contents: queryText\n\s*\}\)\n\s*\]\);/,
  `const [cleanJsonText, embeddingValues] = await Promise.all([
        parseWithFallback(systemPrompt, queryText, mediaData),
        safeEmbedContent(queryText)
      ]);`
);

content = content.replace(
  /const embeddingValues = embedResponse\.embeddings\?\.\[0\]\?\.values;/,
  ``
);

// Fix /api/web/memories
content = content.replace(
  /const embedResponse = await ai\.models\.embedContent\(\{\n\s*model: "text-embedding-004",\n\s*contents: content\n\s*\}\);\n\n\s*const embeddingValues = embedResponse\.embeddings\?\.\[0\]\?\.values;/,
  `const embeddingValues = await safeEmbedContent(content);`
);


fs.writeFileSync('server.ts', content);
