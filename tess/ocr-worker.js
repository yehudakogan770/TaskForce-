// The English data is stored as eng-traineddata.wasm (gzipped) so any host will serve it.
// Point Tesseract's request for eng.traineddata.gz there; it unzips by looking at the bytes.
const nativeFetch = self.fetch.bind(self);
self.fetch = (url, opts) => nativeFetch(String(url).replace(/eng\.traineddata(\.gz)?$/, "eng-traineddata.wasm"), opts);
importScripts("worker.min.js");
