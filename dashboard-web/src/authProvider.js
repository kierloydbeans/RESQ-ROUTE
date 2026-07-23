const rawEnv = import.meta.env.VITE_API_URL;
const cleanBase = rawEnv ? rawEnv.replace(/\/$/, '').replace(/\/api\/v1$/, '') : '';
const API_URL = cleanBase ? `${cleanBase}/api/v1` : '';

export const authProvider = {
  login: ({ username, password }) => {
    const formData = new URLSearchParams()
    formData.append('username', username)
    formData.append('password', password)

    const request = new Request(`${API_URL}/auth/login`, {
      method: 'POST',
      body: formData.toString(),
      headers: new Headers({ 'Content-Type': 'application/x-www-form-urlencoded' })
    })

    return fetch(request)
      .then(response => {
        if (response.status < 200 || response.status >= 300) {
          throw new Error(response.statusText)
        }
        return response.json()
      })
      .then(auth => {
        localStorage.setItem('auth', JSON.stringify(auth))
        return auth
      })
  },
  logout: () => {
    localStorage.removeItem('auth')
    return Promise.resolve()
  },
  checkAuth: () => {
    return localStorage.getItem('auth')
      ? Promise.resolve()
      : Promise.reject()
  },
  checkError: ({ status }) => {
    if (status === 401 || status === 403) {
      return Promise.reject()
    }
    return Promise.resolve()
  },
  getPermissions: () => {
    const auth = JSON.parse(localStorage.getItem('auth'))
    if (auth && auth.user) {
      return Promise.resolve(auth.user.role)
    }
    return Promise.reject()
  },
  getIdentity: () => {
    const auth = JSON.parse(localStorage.getItem('auth'))
    if (auth && auth.user) {
      return Promise.resolve({
        id: auth.user.id,
        fullName: auth.user.full_name || auth.user.username,
        avatar: null
      })
    }
    return Promise.reject()
  }
}