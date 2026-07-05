import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  'type="tel"\n                      value={phoneInput}',
  'type="tel"\n                      required\n                      value={phoneInput}'
);

content = content.replace(
  'type="text"\n                      value={otpInput}',
  'type="text"\n                      required\n                      value={otpInput}'
);

fs.writeFileSync('src/App.tsx', content);
