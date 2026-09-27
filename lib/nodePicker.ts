/**
 * The in-frame half of the element tool. The canvas iframe is sandboxed
 * without allow-same-origin, so the editor cannot read its DOM. It posts a
 * point or a node id in, and this script, added to the srcdoc only, answers
 * with the element's box and computed colors. It also applies inspector
 * previews so an edit shows before it is saved. Colors are read back through a
 * 1px canvas, because Tailwind 4 computes oklch() values.
 *
 * The script accepts messages from the parent window only. A page's own
 * scripts can still post a fake answer to the editor, which is why the editor
 * validates every field and only ever uses the node id to look up source it
 * already holds.
 */
import { NODE_ID_ATTRIBUTE, NODE_ID_FORMAT } from "@/lib/pageNodes";
import type { Matrix } from "@/lib/vectorPath";

export interface ReportedNode {
  nodeId: string;
  tag: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string | null;
  background: string | null;
  /** For an SVG shape, maps its own coordinates to page px, for the pen tool's handles. */
  matrix: Matrix | null;
}

export type NodeReportIntent = "hover" | "pick" | "select";

const HEX_COLOR = /^#[0-9a-f]{6}$/;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** Validates a node from a frame message. Anything malformed reads as no node. */
export const parseReportedNode = (value: unknown): ReportedNode | null => {
  if (!value || typeof value !== "object") return null;
  const node = value as Record<string, unknown>;
  if (typeof node.nodeId !== "string" || !NODE_ID_FORMAT.test(node.nodeId)) return null;
  if (typeof node.tag !== "string" || !/^[a-z][a-z0-9-]{0,31}$/.test(node.tag)) return null;
  if (![node.x, node.y, node.width, node.height].every(isFiniteNumber)) return null;
  const color = (entry: unknown) =>
    typeof entry === "string" && HEX_COLOR.test(entry) ? entry : null;
  const matrix =
    Array.isArray(node.matrix) && node.matrix.length === 6 && node.matrix.every(isFiniteNumber)
      ? (node.matrix as Matrix)
      : null;
  return {
    nodeId: node.nodeId,
    tag: node.tag,
    x: node.x as number,
    y: node.y as number,
    width: node.width as number,
    height: node.height as number,
    color: color(node.color),
    background: color(node.background),
    matrix,
  };
};

export const injectNodePicker = (html: string, reporterId: string) => {
  if (!html) return html;

  const script = `<script>(function(){const id=${JSON.stringify(reporterId)};const attr=${JSON.stringify(NODE_ID_ATTRIBUTE)};let paint=null;const hex=function(value){if(!value||value==="transparent")return null;if(!paint){const canvas=document.createElement("canvas");canvas.width=1;canvas.height=1;paint=canvas.getContext("2d",{willReadFrequently:true});}if(!paint)return null;paint.clearRect(0,0,1,1);paint.fillStyle="#000";paint.fillStyle=value;paint.fillRect(0,0,1,1);const d=paint.getImageData(0,0,1,1).data;if(d[3]===0)return null;return "#"+[d[0],d[1],d[2]].map(function(n){return n.toString(16).padStart(2,"0");}).join("");};const find=function(nodeId){return document.querySelector("["+attr+'="'+String(nodeId).replace(/[^a-z0-9]/g,"")+'"]');};const post=function(intent,el){let node=null;if(el){const rect=el.getBoundingClientRect();const style=getComputedStyle(el);node={nodeId:el.getAttribute(attr),tag:el.tagName.toLowerCase(),x:rect.left+scrollX,y:rect.top+scrollY,width:rect.width,height:rect.height,color:hex(style.color),background:hex(style.backgroundColor),matrix:null};const ctm=el.getScreenCTM&&el.getScreenCTM();if(ctm)node.matrix=[ctm.a,ctm.b,ctm.c,ctm.d,ctm.e+scrollX,ctm.f+scrollY];}parent.postMessage({type:"wirely-node",id:id,intent:intent,node:node},"*");};addEventListener("message",function(event){if(event.source!==parent)return;const data=event.data;if(!data||typeof data!=="object")return;if(data.type==="wirely-node-at"){const hit=document.elementFromPoint(data.x,data.y);post(data.intent,hit&&hit.closest("["+attr+"]"));}else if(data.type==="wirely-node-find"){post("select",find(data.nodeId));}else if(data.type==="wirely-node-preview"){const el=find(data.nodeId);if(!el)return;if(typeof data.text==="string")el.textContent=data.text;if(typeof data.color==="string")el.style.color=data.color;if(typeof data.background==="string")el.style.backgroundColor=data.background;if(typeof data.d==="string")el.setAttribute("d",data.d);post("select",el);}});})();</script>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${script}</body>`);
  }
  return `${html}${script}`;
};

/**
 * An inspector edit shown in the frame before it is saved. Sent as a window
 * event, so the sidebar can reach the page's frame without the canvas
 * re-rendering on every keystroke.
 */
export interface NodePreview {
  pageId: string;
  nodeId: string;
  text?: string;
  color?: string;
  background?: string;
  /** A path's geometry while the pen tool drags one of its points. */
  d?: string;
}

export const NODE_PREVIEW_EVENT = "wirely-node-preview";

export const previewNode = (preview: NodePreview) =>
  window.dispatchEvent(new CustomEvent<NodePreview>(NODE_PREVIEW_EVENT, { detail: preview }));
