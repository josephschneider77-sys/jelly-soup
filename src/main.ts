import './style.css';
import { flavorPickerMarkup } from './app/flavor-picker.ts';
import { failureCopy } from './app/startup-error.ts';

document.querySelector<HTMLDivElement>('#app')!.innerHTML=`
  <main id="viewport" aria-label="Jelly Soup bath"></main>
  <header class="masthead"><h1>bath time<span>.</span></h1></header>
  <nav class="actions" aria-label="Game controls">
    <button id="sound" class="icon-button" aria-label="Mute sound" aria-pressed="false" title="Sound">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path class="sound-waves" d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/><path class="sound-off" d="m15 9 6 6m0-6-6 6"/></svg>
    </button>
    <button id="reset" class="icon-button" aria-label="Drain and refill the bath" title="Reset">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4.5 8a8 8 0 1 1-.1 8M4 3v6h6"/></svg>
    </button>
    ${flavorPickerMarkup()}
  </nav>
  <section id="loading" role="status" aria-live="polite"><div class="loading-card"><div class="jelly-mark" aria-hidden="true"></div><h2 id="load-title" class="sr-only">Jelly Soup: Bath Time</h2><p id="load-message" class="sr-only">Filling the tub</p><pre id="fatal" hidden></pre><button id="retry" hidden type="button">Try again</button></div></section>
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

void import('./app/runtime.ts').then(({startGame})=>startGame(message=>{
  if(failed)throw new Error('Startup aborted after a GPU failure');
  stage=message;document.querySelector('#load-message')!.textContent=message;
},fail)).then(started=>{
  game=started;
  if(failed){game.stop();return;}
  playing=true;stage='Playing';document.querySelector('#loading')!.classList.add('hidden');
}).catch(fail);
