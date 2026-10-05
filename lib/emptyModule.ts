// Stands in for Node's fs in the browser build. CanvasKit's script reads its
// wasm with fs only when it runs under Node; in the browser it fetches it.
export {};
