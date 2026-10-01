/**
 * The in-frame half of the element tool. The canvas iframe is sandboxed
 * without allow-same-origin, so the editor cannot read its DOM. It posts a
 * point or a node id in, and this script, added to the srcdoc only, answers
 * with the element's box, computed colors, and the computed values the
 * inspector edits, and on a pick where the element sits among its siblings,
 * for dragging it. It edits text in place on request, and applies inspector
 * previews so an edit shows before it is saved. Colors are read back through a
 * 1px canvas, because Tailwind 4 computes oklch() values.
 *
 * The script accepts messages from the parent window only. A page's own
 * scripts can still post a fake answer to the editor, which is why the editor
 * validates every field and only ever uses the node id to look up source it
 * already holds.
 */
import {
  NODE_ID_ATTRIBUTE,
  NODE_ID_FORMAT,
  NODE_STYLE_PROPERTIES,
  type NodeStyleProperty,
} from "@/lib/pageNodes";
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
  /** Computed values of the properties the inspector edits: px, a weight, or opacity from 0 to 1. */
  styles: Partial<Record<NodeStyleProperty, number>>;
  /** An SVG element, which takes fill and stroke rather than CSS box styles. */
  isSvg: boolean;
  /**
   * Where the element sits, for dragging it on the canvas. Only a pick or a
   * select carries it, not a hover. Null at the top of the page.
   */
  layout: NodeLayout | null;
}

export interface NodeBox {
  nodeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NodeLayout {
  /** The nearest ancestor with an id, or null when the element is top level. */
  parentId: string | null;
  /** The direction siblings flow in: a row for flex rows and grids, else a column. */
  axis: "row" | "column";
  /** The element and its siblings with ids, in document order. */
  siblings: NodeBox[];
  /** The parent element's box, so a drag can snap to its edges and center. */
  parentBox: Omit<NodeBox, "nodeId"> | null;
  /** Absolutely positioned elements move by left and top; the rest reorder. */
  isAbsolute: boolean;
  /** Computed left and top in px, for an absolute element. */
  left: number;
  top: number;
}

// A parent with more children than this is not something to drag through.
const MAX_REPORTED_SIBLINGS = 200;

export type NodeReportIntent = "hover" | "pick" | "select";

const HEX_COLOR = /^#[0-9a-f]{6}$/;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const parseRect = (value: unknown): Omit<NodeBox, "nodeId"> | null => {
  if (!value || typeof value !== "object") return null;
  const box = value as Record<string, unknown>;
  if (![box.x, box.y, box.width, box.height].every(isFiniteNumber)) return null;
  return {
    x: box.x as number,
    y: box.y as number,
    width: box.width as number,
    height: box.height as number,
  };
};

const parseBox = (value: unknown): NodeBox | null => {
  if (!value || typeof value !== "object") return null;
  const nodeId = (value as Record<string, unknown>).nodeId;
  if (typeof nodeId !== "string" || !NODE_ID_FORMAT.test(nodeId)) return null;
  const rect = parseRect(value);
  return rect ? { nodeId, ...rect } : null;
};

const parseLayout = (value: unknown): NodeLayout | null => {
  if (!value || typeof value !== "object") return null;
  const layout = value as Record<string, unknown>;
  const parentId =
    typeof layout.parentId === "string" && NODE_ID_FORMAT.test(layout.parentId)
      ? layout.parentId
      : null;
  if (!Array.isArray(layout.siblings) || layout.siblings.length > MAX_REPORTED_SIBLINGS) return null;
  const siblings = layout.siblings.map(parseBox);
  if (siblings.some((box) => box === null)) return null;
  return {
    parentId,
    axis: layout.axis === "row" ? "row" : "column",
    siblings: siblings as NodeBox[],
    parentBox: parseRect(layout.parentBox),
    isAbsolute: layout.isAbsolute === true,
    left: isFiniteNumber(layout.left) ? layout.left : 0,
    top: isFiniteNumber(layout.top) ? layout.top : 0,
  };
};

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
  const styles: ReportedNode["styles"] = {};
  if (node.styles && typeof node.styles === "object") {
    for (const [property, value] of Object.entries(node.styles)) {
      if (property in NODE_STYLE_PROPERTIES && isFiniteNumber(value) && value >= 0) {
        styles[property as NodeStyleProperty] = value;
      }
    }
  }
  return {
    layout: parseLayout(node.layout),
    nodeId: node.nodeId,
    tag: node.tag,
    x: node.x as number,
    y: node.y as number,
    width: node.width as number,
    height: node.height as number,
    color: color(node.color),
    background: color(node.background),
    matrix,
    styles,
    isSvg: node.isSvg === true,
  };
};

export const injectNodePicker = (html: string, reporterId: string) => {
  if (!html) return html;

  const script = `<script>(function(){const id=${JSON.stringify(reporterId)};const attr=${JSON.stringify(NODE_ID_ATTRIBUTE)};let paint=null;const hex=function(value){if(!value||value==="transparent")return null;if(!paint){const canvas=document.createElement("canvas");canvas.width=1;canvas.height=1;paint=canvas.getContext("2d",{willReadFrequently:true});}if(!paint)return null;paint.clearRect(0,0,1,1);paint.fillStyle="#000";paint.fillStyle=value;paint.fillRect(0,0,1,1);const d=paint.getImageData(0,0,1,1).data;if(d[3]===0)return null;return "#"+[d[0],d[1],d[2]].map(function(n){return n.toString(16).padStart(2,"0");}).join("");};const find=function(nodeId){return document.querySelector("["+attr+'="'+String(nodeId).replace(/[^a-z0-9]/g,"")+'"]');};const post=function(intent,el){let node=null;if(el){const rect=el.getBoundingClientRect();const style=getComputedStyle(el);node={nodeId:el.getAttribute(attr),tag:el.tagName.toLowerCase(),x:rect.left+scrollX,y:rect.top+scrollY,width:rect.width,height:rect.height,color:hex(style.color),background:hex(style.backgroundColor),matrix:null,isSvg:el instanceof SVGElement,styles:{width:rect.width,height:rect.height,opacity:parseFloat(style.opacity),"font-size":parseFloat(style.fontSize),"font-weight":parseFloat(style.fontWeight),"padding-block":parseFloat(style.paddingTop),"padding-inline":parseFloat(style.paddingLeft),gap:parseFloat(style.rowGap)||0,"border-radius":parseFloat(style.borderTopLeftRadius)}};if(intent!=="hover"){const box=function(child){const r=child.getBoundingClientRect();return{nodeId:child.getAttribute(attr),x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height};};const holder=el.parentElement;const parentEl=holder&&holder.closest("["+attr+"]");const ps=holder?getComputedStyle(holder):null;const row=!!ps&&((ps.display.indexOf("flex")!==-1&&ps.flexDirection.indexOf("row")===0)||ps.display.indexOf("grid")!==-1);const siblings=holder?Array.prototype.filter.call(holder.children,function(child){return child.hasAttribute(attr);}).slice(0,${MAX_REPORTED_SIBLINGS}).map(box):[box(el)];const pr=holder?holder.getBoundingClientRect():null;node.layout={parentId:parentEl?parentEl.getAttribute(attr):null,axis:row?"row":"column",siblings:siblings,parentBox:pr?{x:pr.left+scrollX,y:pr.top+scrollY,width:pr.width,height:pr.height}:null,isAbsolute:style.position==="absolute",left:parseFloat(style.left)||0,top:parseFloat(style.top)||0};}const ctm=el.getScreenCTM&&el.getScreenCTM();if(ctm)node.matrix=[ctm.a,ctm.b,ctm.c,ctm.d,ctm.e+scrollX,ctm.f+scrollY];}parent.postMessage({type:"wirely-node",id:id,intent:intent,node:node},"*");};addEventListener("message",function(event){if(event.source!==parent)return;const data=event.data;if(!data||typeof data!=="object")return;if(data.type==="wirely-node-at"){const hit=document.elementFromPoint(data.x,data.y);post(data.intent,hit&&hit.closest("["+attr+"]"));}else if(data.type==="wirely-node-find"){post("select",find(data.nodeId));}else if(data.type==="wirely-node-edit"){const el=find(data.nodeId);if(!el)return;const original=el.textContent;el.setAttribute("contenteditable","plaintext-only");el.focus();const range=document.createRange();range.selectNodeContents(el);const selection=getSelection();if(selection){selection.removeAllRanges();selection.addRange(range);}let done=false;const finish=function(cancel){if(done)return;done=true;el.removeEventListener("keydown",onKey);el.removeEventListener("blur",onBlur);el.removeAttribute("contenteditable");if(cancel)el.textContent=original;parent.postMessage({type:"wirely-node-text",id:id,nodeId:data.nodeId,text:cancel?null:el.textContent},"*");};const onKey=function(event){if(event.key==="Escape"){event.preventDefault();finish(true);}else if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();finish(false);}};const onBlur=function(){finish(false);};el.addEventListener("keydown",onKey);el.addEventListener("blur",onBlur);}else if(data.type==="wirely-node-preview"){const el=find(data.nodeId);if(!el)return;if(typeof data.text==="string")el.textContent=data.text;if(typeof data.color==="string")el.style.color=data.color;if(typeof data.background==="string")el.style.backgroundColor=data.background;if(typeof data.d==="string")el.setAttribute("d",data.d);if(data.style&&typeof data.style==="object"){Object.keys(data.style).forEach(function(name){if(/^[a-z-]+$/.test(name)&&typeof data.style[name]==="string")el.style.setProperty(name,data.style[name]);});}post("select",el);}});})();</script>`;

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
  /** Inline style values, where an empty string clears one. */
  style?: Partial<Record<NodeStyleProperty, string>>;
}

export const NODE_PREVIEW_EVENT = "wirely-node-preview";

export const previewNode = (preview: NodePreview) =>
  window.dispatchEvent(new CustomEvent<NodePreview>(NODE_PREVIEW_EVENT, { detail: preview }));

export const NODE_EDIT_REQUEST_EVENT = "wirely-node-edit-request";

/** Asks a page's frame to start typing into an element once it reports it, as after inserting text. */
export const requestTextEdit = (pageId: string, nodeId: string) =>
  window.dispatchEvent(
    new CustomEvent<{ pageId: string; nodeId: string }>(NODE_EDIT_REQUEST_EVENT, {
      detail: { pageId, nodeId },
    }),
  );
