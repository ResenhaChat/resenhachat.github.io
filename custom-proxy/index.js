'use strict';

const http = require('http');
const https = require('https');

const PROXIED_PREFIXES = ['/service', '/auth'];

function isProxied(path) {
    return PROXIED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + '/') || path.startsWith(prefix + '?'));
}

function forward(targetUrl) {
    const target = new URL(targetUrl);
    const mod = target.protocol === 'https:' ? https : http;

    return function proxyRequest(req, res, next) {
        if (!isProxied(req.url)) {
            next();
            return;
        }

        const headers = Object.assign({}, req.headers);
        headers.host = target.host;

        const upstream = mod.request({
            hostname: target.hostname,
            port: target.port || (target.protocol === 'https:' ? 443 : 80),
            path: req.url,
            method: req.method,
            headers: headers
        }, (up) => {
            res.writeHead(up.statusCode, up.headers);
            up.pipe(res);
        });

        upstream.on('error', (error) => {
            process.stderr.write('[resenha-local-proxy] upstream error: ' + error.message + '\n');
            if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'text/plain' });
            }
            res.end('Backend unreachable');
        });

        req.pipe(upstream);
    };
}

module.exports = ({ options } = {}) => {
    const configuration = (options && options.configuration) || {};
    const backend = configuration.backend || (options && options.backend);

    if (!backend) {
        throw new Error('resenha-local-proxy: configuration.backend is required');
    }

    return forward(backend);
};
