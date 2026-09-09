import { rm } from 'node:fs/promises';

await rm('frontend/dist/_redirects', { force: true });
