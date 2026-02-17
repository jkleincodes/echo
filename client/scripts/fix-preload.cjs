const fs = require('fs');
const f = 'out/preload/index.mjs';
const c = fs.readFileSync(f, 'utf8').replace(
  /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g,
  'const {$1} = require("$2")'
);
fs.writeFileSync('out/preload/index.js', c);
