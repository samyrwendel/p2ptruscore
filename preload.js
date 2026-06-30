/**
 * PRELOAD CRÍTICO - FORÇAR IPv4
 *
 * Este arquivo DEVE ser carregado ANTES de qualquer outro módulo
 * para garantir que todas as conexões HTTP/HTTPS usem IPv4.
 *
 * Problema: Node.js em alguns sistemas tenta IPv6 primeiro, que pode
 * não funcionar corretamente, causando ETIMEDOUT nas conexões.
 *
 * Solução: Forçar IPv4 globalmente antes de qualquer módulo ser carregado.
 */

'use strict';

// 1. Configurar DNS para priorizar IPv4
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

// 2. Patch global no módulo HTTPS para forçar family=4
const https = require('https');
const http = require('http');

const originalHttpsRequest = https.request;
https.request = function(options, callback) {
  if (typeof options === 'object' && options !== null) {
    options.family = 4;
  }
  return originalHttpsRequest.apply(this, arguments);
};

const originalHttpsGet = https.get;
https.get = function(options, callback) {
  if (typeof options === 'object' && options !== null) {
    options.family = 4;
  }
  return originalHttpsGet.apply(this, arguments);
};

const originalHttpRequest = http.request;
http.request = function(options, callback) {
  if (typeof options === 'object' && options !== null) {
    options.family = 4;
  }
  return originalHttpRequest.apply(this, arguments);
};

const originalHttpGet = http.get;
http.get = function(options, callback) {
  if (typeof options === 'object' && options !== null) {
    options.family = 4;
  }
  return originalHttpGet.apply(this, arguments);
};

// 3. Configurar variável de ambiente como fallback
process.env.NODE_OPTIONS = (process.env.NODE_OPTIONS || '') + ' --dns-result-order=ipv4first';

// Log silencioso para confirmar que o preload foi carregado
// console.log('[PRELOAD] IPv4 forçado com sucesso');
