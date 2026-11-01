import { createFaceHandler } from 'glorpies/server';
const faces = createFaceHandler({ look: 'ink', size: 48 });
export default defineEventHandler((event) => faces(toWebRequest(event)));
