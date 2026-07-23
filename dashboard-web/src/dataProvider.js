import { fetchUtils } from 'react-admin'

console.log("Current API_URL:", import.meta.env.VITE_API_URL);

// Define the base URL for the API, using an environment variable if available, or defaulting to localhost
export const BASE_URL = import.meta.env.VITE_API_URL 
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '') 
  : 'http://localhost:8000';

// Base API route prefix
export const API_URL = `${BASE_URL}/api/v1`;

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

    // Used API_URL instead of raw apiUrl
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