import { fetchUtils } from 'react-admin';

// Log the exact value Vite injected into the build
const rawEnv = import.meta.env.VITE_API_URL;
console.log("Raw VITE_API_URL from build:", rawEnv);

let cleanBase = rawEnv ? rawEnv.replace(/\/$/, '') : '';
if (cleanBase.endsWith('/api/v1')) {
  cleanBase = cleanBase.replace(/\/api\/v1$/, '');
}

export const BASE_URL = cleanBase || 'http://localhost:8000';
export const API_URL = `${BASE_URL}/api/v1`;

console.log("Final Resolved API_URL:", API_URL);

// WebSocket URL matching FastAPI prefix
const wsProtocol = BASE_URL.startsWith('https') ? 'wss' : 'ws';
const wsHost = BASE_URL.replace(/^https?:\/\//, '');

export const WS_URL = `${wsProtocol}://${wsHost}/api/v1/ws`;

const httpClient = fetchUtils.fetchJson;

export const dataProvider = {
  getList: (resource, params) => {
    const { page, perPage } = params.pagination;
    const query = new URLSearchParams({
      skip: ((page - 1) * perPage).toString(),
      limit: perPage.toString()
    });

    return httpClient(`${API_URL}/${resource}?${query}`).then(({ json }) => ({
      data: json.items,
      total: json.total
    }));
  },

  getOne: (resource, params) =>
    httpClient(`${API_URL}/${resource}/${params.id}`).then(({ json }) => ({
      data: json
    })),

  getMany: (resource, params) => {
    const query = new URLSearchParams({
      ids: params.ids.join(',')
    });
    return httpClient(`${API_URL}/${resource}?${query}`).then(({ json }) => ({
      data: json.items
    }));
  },

  getManyReference: (resource, params) => {
    const { page, perPage } = params.pagination;
    const query = new URLSearchParams({
      skip: ((page - 1) * perPage).toString(),
      limit: perPage.toString(),
      [params.target]: params.id
    });

    return httpClient(`${API_URL}/${resource}?${query}`).then(({ json }) => ({
      data: json.items,
      total: json.total
    }));
  },

  update: (resource, params) =>
    httpClient(`${API_URL}/${resource}/${params.id}`, {
      method: 'PUT',
      body: JSON.stringify(params.data)
    }).then(({ json }) => ({ data: json })),

  create: (resource, params) =>
    httpClient(`${API_URL}/${resource}`, {
      method: 'POST',
      body: JSON.stringify(params.data)
    }).then(({ json }) => ({ data: json })),

  delete: (resource, params) =>
    httpClient(`${API_URL}/${resource}/${params.id}`, {
      method: 'DELETE'
    }).then(({ json }) => ({ data: json }))
};