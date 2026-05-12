import axios from 'axios';

const base = (import.meta.env.VITE_API_URL ?? '') + '/api';
export const api = axios.create({ baseURL: base });

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('jwt');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) { localStorage.removeItem('jwt'); window.location.href = '/login'; }
    return Promise.reject(err);
  }
);
