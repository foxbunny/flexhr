import 'cross-fetch/polyfill'
import * as flexhr from '.'

const defaultResponse = new Response('response', {status: 200})
const mockFetch = jest.fn(async function () {
  return defaultResponse
})

beforeEach(function () {
  global.fetch = window.fetch = mockFetch
})

afterEach(function () {
  mockFetch.mockClear()
})

describe('request.GET', function () {
  test('response', async function () {
    const resp = await flexhr.GET('/foo/bar')
    expect(resp).toBe(defaultResponse)
  })

  test('parameters', async function () {
    await flexhr.GET('/foo/bar', {params: {param: 'val'}})
    expect(mockFetch).toHaveBeenCalledWith('/foo/bar?param=val', {
      headers: new Headers({}),
      method: 'GET',
    })
  })

  test('headers', async function () {
    await flexhr.GET('/foo/bar', {headers: {Authorization: 'Bearer 1234'}})
    expect(mockFetch).toHaveBeenCalledWith('/foo/bar', {
      headers: new Headers({Authorization: 'Bearer 1234'}),
      method: 'GET',
    })
  })
})

describe.each([
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
])(
  'request.%s',
  function (method) {
    test('response', async function () {
      const resp = await flexhr[method]('/foo/bar')
      expect(resp).toBe(defaultResponse)
    })

    test('parameters', async function () {
      await flexhr[method]('/foo/bar', {params: {param: 'val'}})
      expect(mockFetch).toHaveBeenCalledWith('/foo/bar', {
        body: '{"param":"val"}',
        headers: new Headers({'content-type': 'application/json'}),
        method,
      })
    })

    test('FormData as paramters', async function () {
      const f = new FormData()
      f.append('param', 'val')
      await flexhr[method]('/foo/bar', {params: f})
      expect(mockFetch).toHaveBeenCalledWith('/foo/bar', {
        body: f,
        headers: new Headers({}),
        method,
      })
    })

    test('URLSearchParams as paramters', async function () {
      const u = new URLSearchParams()
      u.append('param', 'val')
      await flexhr[method]('/foo/bar', {params: u})
      expect(mockFetch).toHaveBeenCalledWith('/foo/bar', {
        body: u,
        headers: new Headers({}),
        method,
      })
    })

    test('headers', async function () {
      await flexhr[method](
        '/foo/bar',
        {headers: {Authorization: 'Bearer 1234'}},
      )
      expect(mockFetch).toHaveBeenCalledWith('/foo/bar', {
        headers: new Headers({Authorization: 'Bearer 1234'}),
        method,
      })
    })
  },
)

describe('plugins', function () {
  beforeEach(function () {
    // Add a plugin that replaces the global fetch with a mock one
    flexhr.addPlugin(function () {
      return mockFetch
    })
  })

  afterEach(function () {
    flexhr.__clearPlugins()
  })

  test('use a single plugin', async function () {
    function plugin(next) {
      return function (url, init) {
        return next('/api' + url, init)
      }
    }

    flexhr.addPlugin(plugin)

    await flexhr.GET('/test')

    expect(mockFetch).toHaveBeenCalledWith('/api/test', {
      headers: new Headers({}),
      method: 'GET',
    })
  })

  test('use multiple plugins', async function () {
    function plugin1(next) {
      return function (url, init) {
        return next('/api' + url, init)
      }
    }

    function plugin2(next) {
      return function (url, init) {
        init.headers.append('Authorization', 'Bearer abcd1234')
        return next(url, init)
      }
    }

    flexhr.addPlugin(plugin1)
    flexhr.addPlugin(plugin2)

    await flexhr.GET('/test')

    expect(mockFetch).toHaveBeenCalledWith('/api/test', {
      headers: new Headers({
        Authorization: 'Bearer abcd1234',
      }),
      method: 'GET',
    })
  })

  test('plugin blacklist', async function () {
    function plugin1(next) {
      return function (url, init) {
        return next('/api' + url, init)
      }
    }

    plugin1.id = 'apiUrl'

    function plugin2() {
      throw Error('Plugin 2 should never be used in this test')
    }

    plugin2.id = 'auth'

    flexhr.addPlugin(plugin1)
    flexhr.addPlugin(plugin2)

    await flexhr.GET('/test', {skipPlugins: ['auth']})

    expect(mockFetch).toHaveBeenCalledWith('/api/test', {
      headers: new Headers({}),
      method: 'GET',
    })
  })

  test('return request only', async function () {
    let r = await flexhr.GET('/test', {noFetch: true})

    expect(r).toBeInstanceOf(Request)
    expect(r.url).toBe('/test')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('noFetch option does not trigger plugins', async function () {
    let plugin = jest.fn()

    flexhr.addPlugin(plugin)

    let r = await flexhr.GET('/test', {noFetch: true})

    expect(plugin).not.toHaveBeenCalled()
  })
})


describe('handleResponse', function () {

  const identity = function (x) {
    return x
  }

  test('handle 200 response', async function () {
    const handlers = {
      onOK: jest.fn(identity),
      onError: jest.fn(identity),
    }
    const resp = new Response('{"data": "foo"}', {
      status: 200,
      headers: {'Content-Type': 'application/json'},
    })
    const result = await flexhr.handleResponse(resp, handlers)
    expect(handlers.onOK).toHaveBeenCalledWith({data: 'foo'})
    expect(handlers.onError).not.toHaveBeenCalled()
    expect(result).toEqual({data: 'foo'})
  })

  test('handle 200 response with charset', async function () {
    const handlers = {
      onOK: jest.fn(identity),
      onError: jest.fn(identity),
    }
    const resp = new Response('{"data": "foo"}', {
      status: 200,
      headers: {'Content-Type': 'application/json;chaset=utf8'},
    })
    await flexhr.handleResponse(resp, handlers)
    expect(handlers.onOK).toHaveBeenCalledWith({data: 'foo'})
  })

  test('handle 200 response with on200', async function () {
    const handlers = {
      onOK: jest.fn(x => x),
      on200: jest.fn(x => x),
      onError: jest.fn(x => x),
    }
    const resp = new Response('{"data": "foo"}', {
      status: 200,
      headers: {'Content-Type': 'application/json'},
    })
    await flexhr.handleResponse(resp, handlers)
    expect(handlers.onOK).not.toHaveBeenCalled()
    expect(handlers.on200).toHaveBeenCalledWith({data: 'foo'})
  })

  test('handle 204 response', async function () {
    const handlers = {
      onOK: jest.fn(x => x),
      onError: jest.fn(x => x),
    }
    const resp = new Response(null, {status: 204})
    const result = await flexhr.handleResponse(resp, handlers)
    expect(handlers.onOK).toHaveBeenCalledWith(undefined)
    expect(handlers.onError).not.toHaveBeenCalled()
    expect(result).toBe(undefined)
  })

  test('handle 204 response with on204', async function () {
    const handlers = {
      onOK: jest.fn(x => x),
      on204: jest.fn(x => x),
      onError: jest.fn(x => x),
    }
    const resp = new Response(null, {status: 204})
    await flexhr.handleResponse(resp, handlers)
    expect(handlers.onOK).not.toHaveBeenCalled()
    expect(handlers.on204).toHaveBeenCalledWith(undefined)
  })

  test('handle 400 request', async function () {
    const handlers = {
      onOK: jest.fn(x => x),
      onError: jest.fn(x => x),
    }
    const resp = new Response('{"error": "omg"}', {
      status: 400,
      headers: {'Content-Type': 'application/json'},
    })
    const result = await flexhr.handleResponse(resp, handlers)
    expect(handlers.onError).toHaveBeenCalledWith({error: 'omg'})
    expect(handlers.onOK).not.toHaveBeenCalled()
    expect(result).toEqual({error: 'omg'})
  })

  test('handle 400 response with on400', async function () {
    const handlers = {
      onOK: jest.fn(x => x),
      onError: jest.fn(x => x),
      on400: jest.fn(x => x),
    }
    const resp = new Response('{"error": "omg"}', {
      status: 400,
      headers: {'Content-Type': 'application/json'},
    })
    await flexhr.handleResponse(resp, handlers)
    expect(handlers.on400).toHaveBeenCalledWith({error: 'omg'})
    expect(handlers.onError).not.toHaveBeenCalled()
  })

  test('handle a 500 response', async function () {
    const handlers = {
      onOK: jest.fn(x => x),
      onError: jest.fn(x => x),
    }
    const resp = new Response('Server error', {status: 400})
    const result = await flexhr.handleResponse(resp, handlers)
    expect(handlers.onError).toHaveBeenCalledWith('Server error')
    expect(handlers.onOK).not.toHaveBeenCalled()
    expect(result).toEqual('Server error')
  })
})

