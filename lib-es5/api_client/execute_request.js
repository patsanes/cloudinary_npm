'use strict';

// eslint-disable-next-line import/order
var config = require("../config");
var https = /^http:/.test(config().upload_prefix) ? require('http') : require('https');
var querystring = require("querystring");
var Q = require('q');
var url = require('url');
var utils = require("../utils");
var ensureOption = require('../utils/ensureOption').defaults(config());

var extend = utils.extend,
    includes = utils.includes;


function execute_request(method, params, auth, api_url, callback) {
  var options = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : {};

  var didUserPassCB = typeof callback === "function";
  method = method.toUpperCase();
  var deferred = Q.defer();

  var query_params = void 0,
      handle_response = void 0; // declare to user later
  var key = auth.key;
  var secret = auth.secret;
  var content_type = 'application/x-www-form-urlencoded';

  if (options.content_type === 'json') {
    query_params = JSON.stringify(params);
    content_type = 'application/json';
  } else {
    query_params = querystring.stringify(params);
  }

  if (method === "GET") {
    api_url += "?" + query_params;
  }

  var request_options = url.parse(api_url);

  request_options = extend(request_options, {
    method: method,
    headers: {
      'Content-Type': content_type,
      'User-Agent': utils.getUserAgent()
    },
    auth: key + ":" + secret
  });
  if (options.agent != null) {
    request_options.agent = options.agent;
  }
  if (method !== "GET") {
    request_options.headers['Content-Length'] = Buffer.byteLength(query_params);
  }
  handle_response = function handle_response(res) {
    if (includes([200, 400, 401, 403, 404, 409, 420, 500], res.statusCode)) {
      var buffer = "";
      var error = false;
      res.on("data", function (d) {
        buffer += d;
        return buffer;
      });
      res.on("end", function () {
        var result = void 0;
        if (error) {
          return;
        }
        try {
          result = JSON.parse(buffer);
        } catch (e) {
          result = {
            error: {
              message: "Server return invalid JSON response. Status Code " + res.statusCode
            }
          };
        }

        if (result.error) {
          result.error.http_code = res.statusCode;
        }

        if (result.error && !didUserPassCB) {
          deferred.reject(Object.assign({
            request_options,
            query_params
          }, result));
        }

        if (didUserPassCB) {
          callback(result);
        } else {
          deferred.resolve(result);
        }
      });
      res.on("error", function (e) {
        error = true;
        var err_obj = {
          error: {
            message: e,
            http_code: res.statusCode,
            request_options,
            query_params
          }
        };
        if (didUserPassCB) {
          callback(err_obj);
        } else {
          deferred.reject(err_obj.error);
        }
      });
    } else {
      var err_obj = {
        error: {
          message: "Server returned unexpected status code - " + res.statusCode,
          http_code: res.statusCode,
          request_options,
          query_params
        }
      };
      if (didUserPassCB) {
        callback(err_obj);
      } else {
        deferred.reject(err_obj.error);
      }
    }
  };

  var request = https.request(request_options, handle_response);
  request.on("error", function (e) {
    deferred.reject(e);
    return typeof callback === "function" ? callback({ error: e }) : void 0;
  });
  request.setTimeout(ensureOption(options, "timeout", 60000));
  if (method !== "GET") {
    request.write(query_params);
  }
  request.end();
  return deferred.promise;
}

module.exports = execute_request;