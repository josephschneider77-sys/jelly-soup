import assert from 'node:assert/strict';
import { failureCopy, WEBGPU_REQUIRED } from '../src/app/startup-error.ts';

const missing=failureCopy(new Error('navigator.gpu is undefined'),false);
assert.equal(missing.summary,WEBGPU_REQUIRED,'a missing GPU tells the player what the browser needs');
assert.match(missing.detail,/navigator\.gpu/);

const adapter=failureCopy(new Error('requestAdapter returned null'),true);
assert.equal(adapter.summary,WEBGPU_REQUIRED,'a failed adapter request uses the same message');

const later=failureCopy(new Error('shader boom'),true);
assert.equal(later.summary,'shader boom','a later error keeps its own message for the toast');
assert.match(later.detail,/shader boom/);

console.log('Startup errors name WebGPU, and later errors stay specific.');
