/** getRandomValues also works on LAN HTTP, unlike the secure-context randomUUID API. */
export function randomId(){return Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('')}
