[![Build Status](https://travis-ci.com/foxbunny/flexhr.svg?branch=master)](https://travis-ci.com/foxbunny/flexhr)

# FleXHR

Flexible XHR library

## Overview

There are many JavaScript XHR libraries out there. The best and most popular
ones are really good. But the good ones, while fully featured, sometimes have
too *many* features. This library has a lot less features, but it makes a few
assumptions about how we want our XHR library to work, and then allows us to
easily override those assumptions.

## Installation

Install from the NPM repository with NPM:

```bash
npm install --save-dev flexhr
```

or with Yarn:

```bash
yarn add --dev flexhr
```

## Usage

This library is generally divided into two parts that are used in conjunction:
making requests, and handling the responses. These parts can be used
independently as well because they rely on standard interfaces like the
one provided by the `Response` object.

### Making requests

The library exports a few low-level functions named after the HTTP methods we
want to use. The supported methods are 'GET', 'POST', 'PUT', 'PATCH', and
'DELETE'. To make a simple GET request, we call the GET function:

```javascript
import {GET} from 'flexhr';

(await function () {
  const resp = await GET('/api/users');
})();
```

The return value is a promise that resolves to a standard `Response` object.
Therefore, the `resp` variable in the above example is a `Response` object.

To specify parameters for the GET request, we can use the params option:

```javascript
import {GET} from 'flexhr';

(async function () {
  const resp = await GET('/api/users', {params: {filter: 12}});
})();
```

The last example results in a GET request to `/api/users?filter=12`.

The following options can be used:

- `params`: key-value pairs that are converted to a query string (default is
  none).
- `headers`: key-value pairs of headers as a plain JavaScript object, or a
  standard `Headers` object (default is to not add any extra headers).
- `skipPlugins`: an array of plugin IDs to omit from this request (more about
  plugins later).

To make a POST request, we use the POST function just like we did with GET
requests:

```javascript
import {POST} from 'flexhr';

(async function () {
  const resp = await POST('/api/users');
})();
```

To pass the parameters as JSON, we use the `params` option like we did with GET:

```javascript
import {POST} from 'flexhr';

(async function () {
  const resp = await POST('/api/users', {params: {
    name: 'John Doe', 
    email: 'doe@example.com',
  }});
})();
```

You will notice that you do not have to say that you want it as JSON as that's
the default. The `Content-Type: application/json` header is automatically added
as well. For payloads other than objects and arrays, the payload is used as is.
The headers must be set appropriately if you are using some exotic payload.

For `FormData` and `UrlSearchParams` object, no specific headers are added.

```javascript
import {POST} from 'flexhr';

const formData = new FormData();
formData.append('name', 'John Doe');
formData.append('email', 'doe@example.com');

(async function () {
  const resp = await POST('/api/users', { params: formData });
})();
```

### Creating request objects without making requests

It is possible to create a request object without actually making a request. 
This is done by passing the `noFetch` option.

```javascript
import {GET} from 'flexhr';

(async function () {
  let request = await GET('/api/users', { noFetch: true })
})();
```

Note that when using the `noFetch` function, no plugins are applied to the 
request objet.

### Handling responses

Handling responses can be done in many ways, and this is why this part of the
FleXHR functionality is provided separately. It is very opinionated about API
will work in a certain way, which may or may not work for us.

When handling responses, we typically want to branch into success and failure
paths, and may further want to know more about the reason of the failure.
FleXHR allows us to separate the execution into different branches at varying
levels of granularity depending on how much we care.

At the very coarse spectrum, we will only have success and failure conditions
(which we call `OK` and `Error`). On top of this, we can handle any number of
specific HTTP status codes which will take precedence over generic `OK` and
`Error` conditions. For instance, 200 or 204 take precedence over `OK` while 404
and 500 take precedence over `Error` branch.

All of this is facilitated through the `handleResponse()` function.

```javascript
import {handleResponse, GET} from 'flexhr'

(async function () {
  const resp = await GET('/api/users/1');
  const result = await handleResponse(resp, {
    onOK: function (user) {
      console.log('We got a user with name ' + user.name);
      return user;
    },
    on404: function (errors) {
      console.log('Could not find a user with this ID');
      return null;
    },
    on0: function (errors) {
      console.log('Could not connect');
      return null;
    },
    onError: function (errors) {
      console.log('Hmm, something else happened');
      return null;
    },
  });
})();
```

As can be seen, various branches are clearly separated and we have a good
overview of what the result of each branch might be. Every branch starts with
`on` prefix followed by either `OK` or `Error` or a valid HTTP status code, or
a `0` (zero). 

Zero is special, as it is a made-up status code for when the connection to the
server cannot be established. This would normally throw (reject) with
`fetch()`, but here it is treated as yet another branch so it can be handled in
a uniform way.

The `OK` branch will catch any status codes that are not specifically handled
and are in the 200 to 299 range (inclusive). All other status codes, including
zero, are caught by `Error` branch if not specifically handled.

### Request plugins

Some behaviors can be defined globally and then applied to all request made in
the application. Examples of such behaviors include prefixing all URls with a
common prefix (e.g., '/api'), adding authentication headers too all requests,
processing all response payloads (e.g., custom deserialization, or retrieving
the contents of a `data` key), and so on.

Global behaviors are defined using plugins.

Plugins are function decorators (functions that take a function and return a
function with modified behavior). They receive a function that behaves like the
browser's `fetch()` function, and is expected to return a function that has a
similar behavior: it must take a URL and an init object (it doesn't need to
handle the case where only a `Request` object is passed). The URL is a string,
and the init object is a subset of the request init object (see
[here](https://mzl.la/2JadzJV)) which includes the keys: `method`, `headers`
and `body`. The `headers` key is always a `Headers` object.

Here is an example that appends the '/api' prefix to all URLs:

```javascript
function apiURLPlugin(next) {
  return function (url, init) {
    url = '/api' + url;
    return next(url, init);
  };
}
```

To add a plugin, we call the `addPlugin()` function:

```javascript
import {addPlugin} from 'flexhr';

addPlugin(apiURLPlugin);
```

Plugins can be skipped on per-request basis. To skip a plugin, the plugin must
first be given an ID. This is achieved by assigning to an `id` property on the
plugin decorator:

```javascript
apiURLPlugin.id = 'apiURLPlugin';
```

The id can be anything as long as it is a valid JavaScript value that can be
compared with using the equality operator `===`. We usually use strings with
(to us) meaningful names.

Now to make a request skip a plugin, we use the `skipPlugin` option:

```javascript
import {GET} from 'flexhr';

(async function () {
  const resp = await GET('/auth/users', {skipPlugins: ['apiURLPlugin']}); 
})();
```

The `skipPlugins` array contains plugin ID's which can be in any order. Plugins
whose ID's are found in this array.

