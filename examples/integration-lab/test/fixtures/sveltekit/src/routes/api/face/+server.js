import { createFaceHandler } from 'glorpies/server';
const faces = createFaceHandler({ look: 'ink', size: 48 });
export const GET = ({ request }) => faces(request);
