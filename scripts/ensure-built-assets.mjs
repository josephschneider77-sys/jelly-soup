import { existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const model=new URL('../src/assets/model/jelly-baby.bin',import.meta.url);
if(!existsSync(model))throw new Error(`Missing jelly model at ${fileURLToPath(model)}`);
