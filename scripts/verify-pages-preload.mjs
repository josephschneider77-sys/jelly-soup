import assert from 'node:assert/strict';
import { rewriteRootUrls } from '../vite.config.js';

const html=`<link rel="preload" href="data:application/json;base64,abc" as="fetch" crossorigin="anonymous" />
<link rel="preload" href="/src/assets/model/jelly-baby.bin" as="fetch" crossorigin="anonymous" />
<link rel="preload" href="/src/assets/model/jelly-baby.json" as="fetch" crossorigin="anonymous" />`;
const bundle={
  bin:{
    type:'asset',
    fileName:'assets/jelly-baby-abc.bin',
    name:'jelly-baby.bin',
    originalFileName:'src/assets/model/jelly-baby.bin',
    originalFileNames:['src/assets/model/jelly-baby.bin'],
    names:['jelly-baby.bin'],
  },
};
const out=rewriteRootUrls(html,bundle,'/jelly-soup/');
assert.doesNotMatch(out,/data:/,'inlined model JSON is not preloaded');
assert.doesNotMatch(out,/jelly-baby\.json/,'a missing emitted asset is not left as a root preload');
assert.match(out,/\/jelly-soup\/assets\/jelly-baby-abc\.bin/,'real assets still get the pages prefix');
console.log('Pages preloads skip inlined assets.');
