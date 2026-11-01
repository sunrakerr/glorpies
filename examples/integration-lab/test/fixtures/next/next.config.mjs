import { fileURLToPath } from 'node:url';
export default { serverExternalPackages: ['@napi-rs/canvas'], turbopack: { root: fileURLToPath(new URL('../../..', import.meta.url)) } };
