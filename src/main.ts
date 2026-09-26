import './style.css';
import { flavorPickerMarkup } from './app/flavor-picker.ts';
import { failureCopy } from './app/startup-error.ts';

document.querySelector<HTMLDivElement>('#app')!.innerHTML=`
  <main id="viewport" aria-label="Jelly Soup playground"></main>
  <header class="masthead"><h1>jelly soup<span>.</span></h1></header>
  <nav class="actions" aria-label="Game controls">
    <button id="sound" class="icon-button" aria-label="Mute sound" aria-pressed="false" title="Sound">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path class="sound-waves" d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/><path class="sound-off" d="m15 9 6 6m0-6-6 6"/></svg>
    </button>
    <button id="reset" class="icon-button" aria-label="Reset jelly soup" title="Reset">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4.5 8a8 8 0 1 1-.1 8M4 3v6h6"/></svg>
    </button>
    ${flavorPickerMarkup()}
    <button id="lighting-mode" class="icon-button" type="button" aria-label="Switch to night mode" aria-pressed="false" title="Switch to night mode">
      <svg class="day-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>
      <svg class="night-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"/></svg>
    </button>
  </nav>
  <footer class="desktop-hints" aria-hidden="true">
    <span><kbd>W</kbd><span class="key-row"><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span></span><span class="hint-label">wander</span>
    <span class="separator"></span><kbd class="space-key">space</kbd><span class="hint-label">hop</span>
    <span class="separator"></span><svg class="mouse" viewBox="0 0 20 25" fill="none" stroke="currentColor"><rect x="3.5" y="1.5" width="13" height="21" rx="6.5"/><path d="M10 5v5"/></svg><span class="hint-label">orbit · grab</span>
  </footer>
  <div class="touch-controls" aria-label="Touch controls">
    <button class="joystick" data-joystick type="button" aria-label="Move">
      <span class="joystick-track" aria-hidden="true"></span>
      <span class="joystick-knob" aria-hidden="true"></span>
    </button>
    <button class="jump" data-control="Space" aria-label="Jump"><svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 21V6m-6 6 6-6 6 6M6 24h16"/></svg></button>
  </div>
  <section id="loading" role="status" aria-live="polite"><div class="loading-card"><div class="jelly-mark" aria-hidden="true"></div><h2 id="load-title" class="sr-only">Jelly Soup</h2><p id="load-message" class="sr-only">Warming up the world</p><pre id="fatal" hidden></pre><button id="retry" hidden type="button">Try again</button></div></section>
  <div id="play-error" class="play-error" hidden role="alert"><p id="play-error-message"></p><button id="play-retry" type="button">Try again</button></div>
`;

let stage='Loading the game',failed=false,playing=false,game:{stop:()=>void}|undefined;
function fail(reason:unknown) {
  const hasGpu=typeof navigator.gpu!=='undefined'&&navigator.gpu!=null;
  const {error,summary,detail}=failureCopy(reason,hasGpu);
  console.error(`[Jelly Soup / ${stage}]`,error);
  if(playing) {
    const toast=document.querySelector<HTMLElement>('#play-error')!;
    if(!toast.hidden)return;
    toast.hidden=false;
    document.querySelector('#play-error-message')!.textContent=summary;
    return;
  }
  if(failed)return;failed=true;game?.stop();
  const loading=document.querySelector('#loading')!;
  loading.classList.remove('hidden');loading.classList.add('failed');
  document.querySelector('#load-title')!.classList.remove('sr-only');
  const message=document.querySelector('#load-message')!;
  message.classList.remove('sr-only');message.textContent=summary;
  const fatal=document.querySelector<HTMLPreElement>('#fatal')!;
  fatal.hidden=false;fatal.textContent=detail;
  document.querySelector<HTMLButtonElement>('#retry')!.hidden=false;
}
window.addEventListener('error',event=>fail(event.error||event.message));
window.addEventListener('unhandledrejection',event=>fail(event.reason));
document.querySelector('#retry')!.addEventListener('click',()=>location.reload());
document.querySelector('#play-retry')!.addEventListener('click',()=>location.reload());

// One observed chain covers imports, initialization, compilation, warmup and first render.
void import('./app/runtime.ts').then(({startGame})=>startGame(message=>{
  if(failed)throw new Error('Startup aborted after a GPU failure');
  stage=message;document.querySelector('#load-message')!.textContent=message;
},fail)).then(started=>{
  game=started;
  if(failed){game.stop();return;}
  playing=true;stage='Playing';document.querySelector('#loading')!.classList.add('hidden');
}).catch(fail);
