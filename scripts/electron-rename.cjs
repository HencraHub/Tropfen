// electron preload must be CommonJS with a .cjs extension when package.json has "type": "module"
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, '..', 'dist-electron');
for (const f of ['preload', 'steam', 'main']) { const js = path.join(dir, f + '.js'); if (fs.existsSync(js) && f === 'preload') fs.renameSync(js, path.join(dir, f + '.cjs')); }
console.log('electron files ready in', dir);
