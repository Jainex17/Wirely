/**
 * Adds a script to a srcdoc that posts the page's full height to the parent.
 * The frame is sandboxed without allow-same-origin, so the parent cannot
 * measure it, and a frame drawn at its full height lets the parent scroll it
 * and lay things over it in page coordinates.
 *
 * The frame has no pointer events, so only the page's own scripts change it
 * after load. The mutation observer watches added and removed nodes only: a
 * carousel or JS animation rewriting attributes every frame would otherwise
 * re-measure every element four times a second for as long as the page is
 * mounted. Size changes still arrive through the ResizeObserver. The walk
 * skips getComputedStyle because a display:none element has a zero box and
 * adds nothing. Load, fonts, and the observers cover the early moments, so
 * the only timed measure is one late pass for content that grows without
 * resizing the body, since every pass walks the whole document.
 */
const MUTATION_MEASURE_INTERVAL_MS = 250;

export const injectIframeHeightReporter = (html: string, reporterId: string) => {
  if (!html) return html;

  const script = `<script>(function(){const reporterId=${JSON.stringify(reporterId)};let rafId=0;let lastHeight=-1;const measure=()=>{const root=document.documentElement;const body=document.body;if(!root||!body)return;const bodyRect=body.getBoundingClientRect();let maxHeight=Math.max(root.scrollHeight||0,root.offsetHeight||0,root.clientHeight||0,body.scrollHeight||0,body.offsetHeight||0,body.clientHeight||0);const allElements=body.querySelectorAll("*");for(const element of allElements){const rect=element.getBoundingClientRect();const relativeTop=rect.top-bodyRect.top;const visualBottom=rect.bottom-bodyRect.top;const scrollBottom=relativeTop+Math.max(element.scrollHeight||0,element.clientHeight||0,element.offsetHeight||0);maxHeight=Math.max(maxHeight,visualBottom,scrollBottom);}const height=Math.ceil(maxHeight);if(height!==lastHeight){lastHeight=height;window.parent.postMessage({type:"wirely-iframe-height",id:reporterId,height:height},"*");}const cursorTarget=document.querySelector("[data-wirely-cursor]");if(cursorTarget){const cursorRect=cursorTarget.getBoundingClientRect();window.parent.postMessage({type:"wirely-iframe-cursor",id:reporterId,x:cursorRect.left+window.scrollX,y:cursorRect.top+window.scrollY},"*");}};const queueMeasure=()=>{if(rafId)return;rafId=window.requestAnimationFrame(()=>{rafId=0;measure();});};if(typeof ResizeObserver==="function"){const resizeObserver=new ResizeObserver(queueMeasure);resizeObserver.observe(document.documentElement);resizeObserver.observe(document.body);}let lastMutationMeasure=0;let mutationTimer=0;const queueMutationMeasure=()=>{if(mutationTimer)return;mutationTimer=window.setTimeout(()=>{mutationTimer=0;lastMutationMeasure=Date.now();queueMeasure();},Math.max(0,${MUTATION_MEASURE_INTERVAL_MS}-(Date.now()-lastMutationMeasure)));};if(typeof MutationObserver==="function"){const mutationObserver=new MutationObserver(queueMutationMeasure);mutationObserver.observe(document.documentElement,{subtree:true,childList:true});}window.addEventListener("load",queueMeasure);document.addEventListener("DOMContentLoaded",queueMeasure);if(document.fonts&&document.fonts.ready){document.fonts.ready.then(queueMeasure).catch(()=>{});}window.setTimeout(queueMeasure,1200);queueMeasure();})();</script>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${script}</body>`);
  }
  return `${html}${script}`;
};
