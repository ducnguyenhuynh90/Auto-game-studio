// The shared game code (../src) reads its build settings the Vite way: import.meta.env.VITE_* and the
// __SUPABASE__ / __FIREBASE__ / __GA__ flags (vite.config.ts). Metro has neither, so this Babel plugin
// writes the values in at build time, from VITE_* or EXPO_PUBLIC_* environment variables (either name).
const env = (name) => {
  const short = name.replace(/^VITE_/, '');
  return process.env[name] ?? process.env[`EXPO_PUBLIC_${short}`] ?? undefined;
};
const flags = () => ({
  __SUPABASE__: !!(env('VITE_SUPABASE_URL') && env('VITE_SUPABASE_ANON_KEY')),
  __FIREBASE__: !!(env('VITE_FIREBASE_API_KEY') && env('VITE_FIREBASE_PROJECT_ID')) && !(env('VITE_SUPABASE_URL') && env('VITE_SUPABASE_ANON_KEY')),
  // the app sends GA through the Measurement Protocol (src/ga.ts), never the web gtag script
  __GA__: false,
});

/** Everything the plugin reads, so Metro's cache key changes when a setting does. */
module.exports.cacheKey = () => JSON.stringify(Object.entries(process.env).filter(([k]) => /^(VITE|EXPO_PUBLIC)_/.test(k)).sort());

module.exports = Object.assign(function viteEnv({ types: t }) {
  const isImportMetaEnv = (node) =>
    node &&
    (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') &&
    node.object.type === 'MetaProperty' &&
    node.object.meta.name === 'import' &&
    node.object.property.name === 'meta' &&
    !node.computed &&
    node.property.name === 'env';
  const literal = (v) => (v === undefined ? t.identifier('undefined') : typeof v === 'boolean' ? t.booleanLiteral(v) : t.stringLiteral(v));
  const visitMember = (path) => {
    const { node } = path;
    if (!isImportMetaEnv(node.object) || node.computed) return;
    const name = node.property.name;
    if (name === 'DEV') path.replaceWith(t.identifier('__DEV__'));
    else if (name === 'PROD') path.replaceWith(t.unaryExpression('!', t.identifier('__DEV__')));
    else if (name === 'MODE') path.replaceWith(t.stringLiteral(process.env.NODE_ENV === 'production' ? 'production' : 'development'));
    else path.replaceWith(literal(env(name)));
  };
  return {
    name: 'vite-env',
    visitor: {
      MemberExpression: visitMember,
      OptionalMemberExpression: visitMember,
      Identifier(path) {
        const f = flags();
        const name = path.node.name;
        if (!Object.prototype.hasOwnProperty.call(f, name)) return;
        if (path.scope.hasBinding(name)) return;
        // only a value use, not a declaration (`declare const __GA__` is removed by TypeScript)
        if (path.parentPath.isMemberExpression({ property: path.node }) || path.parentPath.isVariableDeclarator({ id: path.node })) return;
        path.replaceWith(t.booleanLiteral(f[name]));
      },
    },
  };
}, { cacheKey: module.exports.cacheKey });
