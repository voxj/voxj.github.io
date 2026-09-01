const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('=== Fictional Browser Builder ===\n');

// 1. Install regular deps if missing
if (!fs.existsSync(path.join(__dirname, 'node_modules', 'electron'))) {
  console.log('[1/3] Installing dependencies…');
  execSync('npm install', { stdio: 'inherit', cwd: __dirname });
} else {
  console.log('[1/3] Dependencies already installed');
}

// 2. Install electron-builder if missing
let hasBuilder = false;
try {
  require.resolve('electron-builder');
  hasBuilder = true;
} catch (e) {
  hasBuilder = false;
}

if (!hasBuilder) {
  console.log('[2/3] Installing electron-builder…');
  execSync('npm install --save-dev electron-builder@^25.0.0', { stdio: 'inherit', cwd: __dirname });
} else {
  console.log('[2/3] electron-builder already installed');
}

// 3. Build portable .exe
console.log('[3/3] Building portable .exe…');
execSync('npx electron-builder --win portable', { stdio: 'inherit', cwd: __dirname });

console.log('\n=== Done! ===');
console.log('Your single .exe is in:  dist/Fictional Browser.exe');
console.log('You can rename it however you like.');
