import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  /                <\/div>\n                <\/div>\n              <\/form>/,
  '                </div>\n              </form>'
);
fs.writeFileSync('src/App.tsx', content);
