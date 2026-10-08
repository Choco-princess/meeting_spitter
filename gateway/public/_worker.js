// Credentials and processing remain in the API Worker behind a service binding.
export default {
  fetch(request, env) {
    return env.API.fetch(request);
  },
};
