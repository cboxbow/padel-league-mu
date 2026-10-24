const Module = require('node:module');
const orig = Module._resolveFilename;
Module._resolveFilename = function (req, ...a) { return req === '@supabase/supabase-js' ? require.resolve('./fake-supabase.cjs') : orig.call(this, req, ...a); };
