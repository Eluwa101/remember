import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  '                </button>\n                </div>\n              </form>',
  '                </button>\n              </form>'
);

content = content.replace(
  '                  </button>\n                </div>\n              </form>\n            )}',
  '                  </button>\n                </div>\n              </form>\n            )}' // wait, the second form has <div className="flex gap-2"> around the buttons.
);

fs.writeFileSync('src/App.tsx', content);
