// Inspect complete quoted configuration literals, never URL substrings.
function hasFixtureOrigin(sources) {
  if (!Array.isArray(sources)) return false;
  return sources.some(source => typeof source === 'string' && source.split(/["'`]/).some(value => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname === 'fixture.supabase.co' &&
        url.port === '' && url.pathname === '/' && url.search === '' && url.hash === '' &&
        url.username === '' && url.password === '';
    } catch { return false; }
  }));
}
module.exports = { hasFixtureOrigin };
