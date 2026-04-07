const fs = require('fs');
const path = require('path');

const versionFilePath = path.join(__dirname, '../VERSION');
const currentVersion = fs.readFileSync(versionFilePath, 'utf8').trim();

const versionParts = currentVersion.split('.').map(Number);
const type = process.argv[2] || 'patch';

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

fs.writeFileSync(versionFilePath, newVersion);

console.log(newVersion);
