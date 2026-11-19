import { handleCoachRequest } from './protocol.mjs';

export default {
  async fetch(request, env) {
    try {
      return await handleCoachRequest(request, env);
    } catch (error) {
      return new Response(JSON.stringify({ status: 'proxy_error', reason: error?.name || 'Error' }), {
        status: 500,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }
  },
};
