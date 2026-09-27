/**
 * Keeps a page's own animations still on the canvas until the user asks to
 * see them.
 *
 * A canvas holds many live frames. Letting each one play its entrance motion
 * on every load, or loop a spinner forever, is noise and repaint cost. This
 * script finishes every CSS animation and transition as it starts, so a frame
 * shows its end state, and pauses loops that have no end. The editor's Replay
 * button posts `FRAME_MOTION_REPLAY`, and the script restarts everything it
 * held from the beginning, in place, with no reload.
 *
 * Finished animations drop out of `document.getAnimations()`, so the script
 * keeps its own set. Motion driven by a page's own JavaScript is out of reach
 * and plays as the page wrote it.
 */

export const FRAME_MOTION_REPLAY = "wirely-motion-replay";
/** Posted once, the first time a page starts an animation, so the editor can offer Replay. */
export const FRAME_MOTION_FOUND = "wirely-motion-found";

// When a page's styles land late (the Tailwind browser runtime compiles after
// load), their animations start late too. These passes catch them.
const SETTLE_PASSES_MS = [0, 60, 250, 700, 1500];

export const injectFrameMotion = (html: string, reporterId: string) => {
  if (!html) return html;

  const script = `<script>(function(){const id=${JSON.stringify(reporterId)};const held=new Set();let playing=false;let found=false;const settle=function(){if(playing)return;const list=document.getAnimations();for(const a of list){if(held.has(a))continue;held.add(a);try{a.finish();}catch(e){a.pause();}}if(!found&&held.size>0){found=true;parent.postMessage({type:${JSON.stringify(FRAME_MOTION_FOUND)},id:id},"*");}};document.addEventListener("animationstart",settle,true);document.addEventListener("transitionrun",settle,true);if(typeof MutationObserver==="function"&&document.head){new MutationObserver(settle).observe(document.head,{childList:true,subtree:true});}for(const ms of ${JSON.stringify(SETTLE_PASSES_MS)}){setTimeout(settle,ms);}addEventListener("load",settle);addEventListener("message",function(event){if(event.source!==parent)return;const data=event.data;if(!data||data.type!==${JSON.stringify(FRAME_MOTION_REPLAY)})return;playing=true;for(const a of document.getAnimations())held.add(a);for(const a of held){try{a.cancel();a.play();}catch(e){}}});})();</script>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${script}</body>`);
  }
  return `${html}${script}`;
};
