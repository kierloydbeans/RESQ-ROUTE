import { fetchUtils } from 'react-admin'

const apiUrl = 'http://localhost:8000/api/v1'
const httpClient = fetchUtils.fetchJson

export const dataProvider = {
  getList: (resource, params) => {
    const { page, perPage } = params.pagination
    const query = new URLSearchParams({
      skip: ((page - 1) * perPage).toString(),
      limit: perPage.toString()
    })

    return httpClient(`${apiUrl}/${resource}?${query}`).then(({ json }) => ({
      data: json.items,
      total: json.total
    }))
  },

  getOne: (resource, params) =>
    httpClient(`${apiUrl}/${resource}/${params.id}`).then(({ json }) => ({
      data: json
    })),

  getMany: (resource, params) => {
    const query = new URLSearchParams({
      ids: params.ids.join(',')
    })
    return httpClient(`${apiUrl}/${resource}?${query}`).then(({ json }) => ({
      data: json.items
    }))
  },

  getManyReference: (resource, params) => {
    const { page, perPage } = params.pagination
    const query = new URLSearchParams({
      skip: ((page - 1) * perPage).toString(),
      limit: perPage.toString(),
      [params.target]: params.id
    })

    return httpClient(`${apiUrl}/${resource}?${query}`).then(({ json }) => ({
      data: json.items,
      total: json.total
    }))
  },

  update: (resource, params) =>
    httpClient(`${apiUrl}/${resource}/${params.id}`, {
      method: 'PUT',
      body: JSON.stringify(params.data)
    }).then(({ json }) => ({ data: json })),

  create: (resource, params) =>
    httpClient(`${apiUrl}/${resource}`, {
      method: 'POST',
      body: JSON.stringify(params.data)
    }).then(({ json }) => ({ data: json })),

  delete: (resource, params) =>
    httpClient(`${apiUrl}/${resource}/${params.id}`, {
      method: 'DELETE'
    }).then(({ json }) => ({ data: json }))
}
