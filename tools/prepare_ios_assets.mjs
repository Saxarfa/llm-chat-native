// Copy only public, versioned resources required by the existing UI.
import {cp,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'frontend/dist-ios');
await mkdir(path.join(out,'js'),{recursive:true});
await cp(path.join(root,'js/storage.js'),path.join(out,'js/storage.js'));
await cp(path.join(root,'css/icons'),path.join(out,'css/icons'),{recursive:true});
await cp(path.join(root,'manifest.json'),path.join(out,'manifest.json'));
