import type { Session } from 'next-auth'
import { useFetch, createError, useState } from '#app'
import { nanoid } from 'nanoid'

interface UseSessionOptions {
  required?: boolean
  onUnauthenticated?: () => void
}

interface FetchOptions {
  params?: Record<string, string>
  method?: string
  headers?: Record<string, string>
  body?: any
  onResponse?: ({ response }: { response?: any }) => void
  onResponseError?: ({ request, response, options }: { request?: any, response?: any, options?: any }) => void
  onRequest?: ({ request, options }: { request?: any, options?: any }) => void
  onRequestError?: ({ request, options, error }: { request?: any, options?: any, error?: any }) => void
}

type SessionStatus = 'authenticated' | 'unauthenticated' | 'loading'
type SessionData = Session | undefined | null

// TODO: Better type this so that TS can narrow whether the full `result` or just `result.data` is returned
const _fetch = async (path: string, { body, params, method, headers, onResponse, onRequest, onRequestError, onResponseError }: FetchOptions = { params: {}, headers: {}, method: 'GET' }) => {
  const result = await useFetch(`/api/auth/${path}`, {
    method,
    params,
    headers,
    body,
    onResponse,
    onRequest,
    onRequestError,
    onResponseError,
    server: false,
    key: nanoid()
  })

  return result.data
}

export default async ({ required, onUnauthenticated }: UseSessionOptions = { required: true }) => {
  const data = useState<SessionData>('session:data', () => undefined)
  const status = useState<SessionStatus>('session:status', () => 'unauthenticated')

  const signIn = () => {
    const url = '/api/auth/signin'
    window.location.href = url
  }

  // TODO: add callback url support https://github.com/nextauthjs/next-auth/blob/main/packages/next-auth/src/react/index.tsx#L284
  const signOut = async () => {
    const csrfTokenResult = await getCsrfToken()

    // @ts-ignore The underlying `_fetch` method should be better typed to avoid this
    const csrfToken = csrfTokenResult?.value?.csrfToken
    if (!csrfToken) {
      throw createError({ statusCode: 400, statusMessage: 'Could not fetch CSRF Token for signing out' })
    }

    const body = new URLSearchParams({
      csrfToken: csrfToken as string,
      callbackUrl: window.location.href,
      json: 'true'
    })

    const signoutData = await _fetch('signout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    })

    // TODO: Support redirect if necesseray, see https://github.com/nextauthjs/next-auth/blob/4dbbe5b2d9806353b30a868f7e728b018afeb90b/packages/next-auth/src/react/index.tsx#L303-L310

    status.value = 'unauthenticated'
    data.value = undefined

    return signoutData
  }

  const getCsrfToken = () => _fetch('csrf')
  const getProviders = () => _fetch('providers')
  const getSession = ({ required } : { required?: boolean } = { required: false }) => {
    const onRequest = () => {
      status.value = 'loading'
    }

    const onResponse = ({ response }) => {
      const sessionData = response._data

      if (!sessionData || Object.keys(sessionData).length === 0) {
        status.value = 'unauthenticated'
        data.value = null

        if (required) {
          onUnauthenticated ? onUnauthenticated() : signIn()
        }
      } else {
        status.value = 'authenticated'
        data.value = sessionData
      }

      return sessionData
    }

    const onError = () => {
      status.value = 'unauthenticated'
    }

    return _fetch('session', {
      onResponse,
      onRequest,
      onRequestError: onError,
      onResponseError: onError
    })
  }

  if (process.client) {
    await getSession({ required })
  }

  return {
    status,
    data,
    getSession,
    getCsrfToken,
    getProviders,
    signIn,
    signOut
  }
}