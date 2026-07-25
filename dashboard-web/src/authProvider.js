// src/authProvider.js

// Resolve the backend base URL safely so auth requests do not target the frontend host.
const rawEnv = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'https://resq-route.onrender.com';
let cleanBase = rawEnv ? rawEnv.replace(/\/$/, '') : '';

if (cleanBase.endsWith('/api/v1')) {
  cleanBase = cleanBase.replace(/\/api\/v1$/, '');
}

const BASE_URL = cleanBase || 'https://resq-route.onrender.com';
const API_URL = `${BASE_URL}/api/v1`;

export const authProvider = {
  login: ({ username, password }) => {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    const request = new Request(`${API_URL}/auth/login`, {
      method: 'POST',
      body: formData.toString(),
      headers: new Headers({ 'Content-Type': 'application/x-www-form-urlencoded' })
    });

    return fetch(request)
      .then(async response => {
        if (response.status < 200 || response.status >= 300) {
          const errorText = await response.text();
          throw new Error(errorText || response.statusText);
        }
        return response.json();
      })
      .then(auth => {
        localStorage.setItem('auth', JSON.stringify(auth));
        return auth;
      });
  },
  logout: () => {
    localStorage.removeItem('auth');
    return Promise.resolve();
  },
  checkAuth: () => {
    return localStorage.getItem('auth')
      ? Promise.resolve()
      : Promise.reject();
  },
  checkError: ({ status }) => {
    if (status === 401 || status === 403) {
      return Promise.reject();
    }
    return Promise.resolve();
  },
  getPermissions: () => {
    const auth = JSON.parse(localStorage.getItem('auth'));
    if (auth && auth.user) {
      return Promise.resolve(auth.user.role);
    }
    return Promise.reject();
  },
  getIdentity: () => {
    const auth = JSON.parse(localStorage.getItem('auth'));
    if (auth && auth.user) {
      return Promise.resolve({
        id: auth.user.id,
        fullName: auth.user.full_name || auth.user.username,
        avatar: null
      });
    }
    return Promise.reject();
  }
};