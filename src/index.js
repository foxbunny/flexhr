import {stringify} from 'query-string';

const plugins = [];

/**
 * Connection error object
 *
 * This Error object is returned when fetch() is unable to establish a
 * connection with the server for whatever reason. The object has properties
 * like `ok` and `status` which allow us to treat it as a `Response` object
 * when handling errors.
 *
 * The original error raised by `fetch()` is passed to the constructor, and is
 * kept as the `error` property.
 */
class ConnectionError extends Error {
  constructor(originalError) {
    super(originalError.message);
    this.error = originalError;
    this.status = 0;
    this.ok = false;
  }
}

/**
 * Add an XHR plugin
 *
 * The plugins are applied in order in which they are added, such that the last
 * one wraps the previous one. For example, if we have plugins `A`, `B` and `C`,
 * the result is `C(B(A(fetch)))`. In other words, the first plugin added is
 * the closest to bare metal.
 *
 * The plugin functions are decorators that receive a `fetch()`-like function,
 * and return a function that behaves like the `fetch()` function.
 *
 * Plugin functions can have an ID (string identifier) associated with them via
 * an `id` property. This can be used to skip the plugin.
 *
 * Here is an example of a plugin that prefixes all URLs with '/api':
 *
 *     function apiURLPlugin(next) {
 *       return function (url, init) {
 *         url = '/api' + url;
 *         return next(url, init);
 *       };
 *     }
 */
export function addPlugin(fn) {
  plugins.push(fn);
}

/**
 * Remove all plugins from the plugin stack
 *
 * This function is intended mostly for testing purposes.
 */
export function __clearPlugins() {
  plugins.length = 0;
}

/**
 * Convert parameters to appropriate request body
 *
 * The rules for conversion are as follows:
 *
 * - Any plain objects and arrays are converted to JSON.
 * - Any `FormData` objects are used as is.
 * - Any `URLSearchParams` objects are used as is.
 * - Any form elements are converted to either JSON or `UrlSearchParams` or
 *   `FormData` based on the `enctype` attribute (you can use
 *   'application/json', 'application/x-www-form-urlencoded', and
 *   'applicaiton/json'; default is 'application/x-www-form-urlencoded').
 * - Anything else is coerced to string and treated as text body.
 *
 * For JSON payload, the 'application/json' content type is set. For
 * `URLSearchParams`, content type is set to
 * 'application/x-www-form-urlencoded'. For everything else, the content type
 * is not set requiring either the caller to set it, or delegating to the fetch
 * API.
 */
function encodeParams(params, headers) {
  if (
    {}.toString.call(params) === '[object Object]' ||
    Array.isArray(params)
  ) {
    headers.set('Content-Type', 'application/json');
    return JSON.stringify(params);
  }
  return params
}

/**
 * Perform an XHR request to a specified URL
 *
 * The first two arguments are method name (string, all caps) and the request
 * URL. The third parameter is the request options. It's an object with one or
 * more of the following keys:
 *
 * - `params` - request parameters as plain object or request body.
 * - `headers` - custom request headers.
 * - `skipPlugins` - an array of plugins that should be skipped.
 * - `skipEncode` - do not JSON-encode the parameters or set the headers
 *   (default: encode parameters as JSON).
 *
 * Regardless of the requet method, the request parametes are always set as the
 * request body. For GET requests, it's the caller's responsibility to encode
 * the parameters in the URL (there is a `GET` function that does this for
 * you).
 *
 * How the request parametes are used is dependent on the `skipEncode` flag.
 *
 * Unless `skipEncode` is set, and the `params` option is specified, params
 * will be converted to a JSON string and used as request body *regardless* of
 * the HTTP method being used. It's the job of the higher-level functions to
 * handle the difference between GET and non-GET methods in terms of how the
 * parameters are encoded.
 *
 * If `skipEncode` is set, and the `params` options is specified, then the
 * value of the params is used as the request body for POST/PUT/PATCH/DELETE
 * methods.
 */
function request(method, url, options = {}) {
  const init = {
    method,
  };

  // Create the headers object and add any custom headers
  init.headers = new Headers(options.headers || {});

  // Set parameters
  if (options.params) {
    init.body = encodeParams(options.params, init.headers);
  }

  let applicablePlugins = plugins;

  // Remove skipped plugins from the plugin stack
  if (options.skipPlugins) {
    applicablePlugins = plugins.filter(function (plugin) {
      if (typeof plugin.id === 'undefined') return true;
      return !options.skipPlugins.includes(plugin.id);
    });
  }

  // Decorate the fetch function with plugins
  const fetcher = applicablePlugins.reduce(function (next, plugin) {
    return plugin(next);
  }, async function (url, init) {
    try {
      return await fetch(url, init);
    } catch (e) {
      return Promise.resolve(new ConnectionError(e));
    }
  });

  return fetcher(url, init);
}

/**
 * Shorthand for `request()` for making GET requests
 */
export function GET(url, options = {}) {
  if (options.params) {
    url += `?${stringify(options.params)}`;
    options = {...options, params: undefined};
  }

  return request('GET', url, options);
}

export const POST = request.bind(null, 'POST');
export const PUT = request.bind(null, 'PUT');
export const PATCH = request.bind(null, 'PATCH');
export const DELETE = request.bind(null, 'DELETE');

/**
 * Return a Promise that resolves to decoded response body
 *
 * Response body is decoded according to `Content-Type` header and falls back
 * on `text/plain` if the header is missing. For status code 204, the decoded
 * payload is always `undefined`.
 */
function decodeBody(response) {
  if (response instanceof Error) {
    return Promise.resolve({error: response.message});
  }

  const cTypeHeader = response.headers.get('content-type')
  const contentType = cTypeHeader ? cTypeHeader.split(';')[0] : 'text/plain';

  if (response.status === 204) {
    return;
  }

  if (contentType === 'application/json') {
    return response.json();
  }

  return response.text();
}

/**
 * Handler responses using provided handler methods
 *
 * This function accepts the handlers object as its only argument. The
 * object has methods for handling different status codes and/or general error
 * or success conditions.
 *
 * `onOK` and `onError` methods on the handlers object are mandatory. In
 * addition, any number of `onNNN` methods can be used for specific status
 * codes. For `ok` status codes (200-299), the `onOK` method is used as a
 * fallback if `on200`~`on299` methods are not specified. For other status
 * codes, the `onError` method is used.
 *
 * If the handlers object has a `decode` method, it will be called with the
 * response object and is expected to return a promise that resolves to decoded
 * response payload. By default, the response is decoded as either JSON or
 * plain-text based on the `Content-Type` header.
 */
export async function handleResponse(response, handlers) {
  const decoder = handlers.decode || decodeBody;
  const status = response.status;
  const fallback = response.ok ? handlers.onOK : handlers.onError;
  const data = await decoder(response);
  return (handlers[`on${status}`] || fallback)(data);
}

