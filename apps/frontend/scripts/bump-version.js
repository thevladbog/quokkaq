/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

const type = process.argv[2] || 'patch';
const packageJsonPath = path.join(__dirname, '../package.json');
const packageJson = require(packageJsonPath);

const versionParts = packageJson.version.split('.').map(Number);

if (type === 'major') {
  versionParts[0] += 1;
  versionParts[1] = 0;
  versionParts[2] = 0;
} else if (type === 'minor') {
  versionParts[1] += 1;
  versionParts[2] = 0;
} else {
  versionParts[2] += 1;
}

const newVersion = versionParts.join('.');

packageJson.version = newVersion;

fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

console.log(newVersion);
