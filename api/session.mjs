import { handleDefaultWebRoute } from '../server/application.mjs';

export default { fetch: (request) => handleDefaultWebRoute('session', request) };
