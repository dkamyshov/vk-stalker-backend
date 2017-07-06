/*
    IMPORTANT: predefined header, HMACSHA256 only
*/

const CryptoJS = require('crypto-js');

const URLSafeBase64Encode = x => (x.includes('=') ? x.substring(0, x.indexOf('=')) : x).replace(/\+/g, '-').replace(/\//g, '_'),
      URLSafeBase64Decode = x => x.replace(/\-/g, '+').replace(/_/g, '/'),
      create = (payload, secret) => {
        const header64 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
              payload64 = URLSafeBase64Encode((new Buffer(JSON.stringify(payload))).toString('base64')),
              signature64 = URLSafeBase64Encode((new Buffer(CryptoJS.HmacSHA256(header64+'.'+payload64, secret).toString(), 'hex')).toString('base64'));
        return `${header64}.${payload64}.${signature64}`;
      },
      parse = token => JSON.parse((new Buffer(URLSafeBase64Decode(token.split('.')[1]), 'base64')).toString()),
      verify = (token, secret) => {
        try {
            return (create(parse(token), secret) == token);
        } catch(e) {
            return false;
        }
      };

module.exports = {create, verify, parse};
