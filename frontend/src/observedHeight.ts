// ResizeObserver has already performed layout. Its border box includes padding
// and borders like getBoundingClientRect, without forcing a second measurement.
export function observedHeight(entry:ResizeObserverEntry){
 const box=entry.borderBoxSize as readonly ResizeObserverSize[]|ResizeObserverSize|undefined;
 return (Array.isArray(box)?box[0]?.blockSize:(box as ResizeObserverSize|undefined)?.blockSize)??entry.contentRect.height;
}
