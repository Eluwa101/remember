import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

// Fix parseWithFallback to handle non-image media properly, and improve Gemini error handling
const oldParseWithFallback = `async function parseWithFallback(systemPrompt: string, userText: string, mediaData: any = null): Promise<string> {`;

content = content.replace(oldParseWithFallback, `async function parseWithFallback(systemPrompt: string, userText: string, mediaData: any = null): Promise<string> {
  const hasMedia = !!mediaData;
  const isImage = hasMedia && mediaData.mimeType.startsWith("image/");
  
  // If there's media (especially audio/documents), Gemini is our best bet natively.
  // We'll try Gemini first if we have a real API key OR if there's media.
  if (process.env.GEMINI_API_KEY && hasMedia) {
    try {
      console.log("[Parsing] Attempting Gemini API for Multimodal...");
      const contents: any[] = [{
        inlineData: {
          data: mediaData.data,
          mimeType: mediaData.mimeType
        }
      }];
      if (userText.trim()) contents.push({ text: \`Message to parse: "\${userText}"\` });
      else contents.push({ text: "Please analyze the attached media and summarize it according to the system instructions." });
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: {
          responseMimeType: "application/json",
          systemInstruction: systemPrompt
        }
      });
      if (response.text) return response.text;
    } catch (err: any) {
      console.error("[Parsing] Gemini Multimodal failed:", err.message);
      if (err.message.includes("SCOPE_INSUFFICIENT") || err.message.includes("UNAUTHENTICATED") || err.status === 403 || err.status === 401) {
         throw new Error("Missing or invalid GEMINI_API_KEY in Secrets. Please configure it in AI Studio.");
      }
    }
  }
`);

// Now replace the isImage checks below
content = content.replace(/const isImage = !!mediaData;/, '');
content = content.replace(/if \(!isImage && groqApiKey\)/, 'if (!hasMedia && groqApiKey)');

// Ensure Gemini fallback works for text if others fail
content = content.replace(/console\.log\("\[Parsing\] Falling back to official Gemini API\.\.\."\);/, `console.log("[Parsing] Falling back to official Gemini API...");
  if (!process.env.GEMINI_API_KEY) {
     throw new Error("Missing GEMINI_API_KEY in Secrets. Please configure it in AI Studio to use this feature.");
  }`);


fs.writeFileSync('server.ts', content);
