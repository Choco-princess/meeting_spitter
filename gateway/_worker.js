// Cloudflare service binding keeps credentials and processing in the API Worker.
// Pages supplies an alternate public hostname for networks unable to reach workers.dev.
export default {
  fetch(request, env) {
    return env.API.fetch(request);
  },
};
