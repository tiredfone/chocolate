const isArray = Array.isArray;
function isPlainObject(v) {
  if (v === null || typeof v !== 'object') return false;
  const p = Object.getPrototypeOf(v);
  return p === null || p === Object.prototype;
}
export default { isArray, isPlainObject };
