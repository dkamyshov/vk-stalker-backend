const buildURI = (base, options) => options ? base + '?' + Object.keys(options).map(key => `${key}=${options[key]}`).join('&') : base;

module.exports = buildURI;
