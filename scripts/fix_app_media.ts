import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Add lucide react imports
content = content.replace(
  'Info, AlertTriangle, CloudCheck } from "lucide-react";',
  'Info, AlertTriangle, CloudCheck, Paperclip, X } from "lucide-react";'
);

// 2. Add state for file
const stateOld = 'const [newMemoryContent, setNewMemoryContent] = useState<string>("");\n  const [isSavingMemory, setIsSavingMemory] = useState<boolean>(false);';
const stateNew = `const [newMemoryContent, setNewMemoryContent] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<{name: string, data: string, mimeType: string} | null>(null);
  const [isSavingMemory, setIsSavingMemory] = useState<boolean>(false);`;

content = content.replace(stateOld, stateNew);

// 3. Update handleManualSave
content = content.replace(
  `const handleManualSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryContent.trim()) return;`,
  `const handleManualSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryContent.trim() && !selectedFile) return;`
);

content = content.replace(
  `body: JSON.stringify({
          phone: phoneNumber,
          content: newMemoryContent
        })`,
  `body: JSON.stringify({
          phone: phoneNumber,
          content: newMemoryContent,
          media: selectedFile ? {
            data: selectedFile.data,
            mimeType: selectedFile.mimeType
          } : null
        })`
);

content = content.replace(
  `setNewMemoryContent("");\n        fetchUserData();`,
  `setNewMemoryContent("");\n        setSelectedFile(null);\n        fetchUserData();`
);

// 4. File input handler
const fileHandler = `
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Check size (max 5MB for base64 safety)
    if (file.size > 5 * 1024 * 1024) {
      alert("File size must be under 5MB");
      return;
    }
    
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1];
      setSelectedFile({
        name: file.name,
        data: base64Data,
        mimeType: file.type || "application/octet-stream"
      });
    };
    reader.readAsDataURL(file);
  };
`;
content = content.replace('const handleManualSave', fileHandler + '\n  const handleManualSave');

// 5. Update UI
const oldTextArea = `<textarea
                  value={newMemoryContent}`;

const newUI = `
                {selectedFile && (
                  <div className="flex items-center justify-between bg-slate-900 border border-slate-700 rounded-lg p-2 px-3 mb-2">
                    <div className="flex items-center gap-2 text-xs text-slate-300 truncate">
                      <Paperclip size={12} className="text-blue-400" />
                      <span className="truncate">{selectedFile.name}</span>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setSelectedFile(null)}
                      className="text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                <div className="relative">
                  <textarea
                    value={newMemoryContent}`;
content = content.replace(oldTextArea, newUI);

const oldSubmit = `<div className="flex justify-end">`;
const newSubmit = `
                </div>
                <div className="flex justify-between items-center mt-3">
                  <label className="cursor-pointer p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors group relative">
                     <Paperclip size={16} />
                     <input type="file" className="hidden" onChange={handleFileChange} accept="image/*,audio/*,video/*,.pdf,.txt,.md" />
                     <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-slate-800 text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap text-slate-200">Attach Media</span>
                  </label>
                  <div className="flex justify-end">`;

content = content.replace(oldSubmit, newSubmit);

// Also fix the disabled button
content = content.replace(
  `disabled={isSavingMemory || !newMemoryContent.trim()}`,
  `disabled={isSavingMemory || (!newMemoryContent.trim() && !selectedFile)}`
);

fs.writeFileSync('src/App.tsx', content);
