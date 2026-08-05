import { handleDefaultWebRoute } from '../server/application.mjs';

export default { fetch: (request) => handleDefaultWebRoute('state', request) };
