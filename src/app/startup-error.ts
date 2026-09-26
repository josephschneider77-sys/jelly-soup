export const WEBGPU_REQUIRED='This game needs a browser with WebGPU';

export function failureCopy(reason:unknown,hasGpu:boolean) {
  const error=reason instanceof Error?reason:new Error(reason==null?'Unknown error':String(reason));
  const mentionsGpu=/webgpu|requestadapter|adapter/i.test(`${error.name} ${error.message}`);
  const summary=!hasGpu||mentionsGpu||error.message===WEBGPU_REQUIRED?WEBGPU_REQUIRED:error.message;
  return {error,summary,detail:error.stack??`${error.name}: ${error.message}`};
}
