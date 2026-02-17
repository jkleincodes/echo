import axios from 'axios';
import { getServerUrl } from './serverUrl';

export const api = axios.create({
  baseURL: getServerUrl(),
  headers: { 'Content-Type': 'application/json' },
  timeout: 5000,
});

// JWT interceptor — set token from store
export function setApiToken(token: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

// Update baseURL when server URL changes (e.g. after login page config)
export function updateApiBaseUrl() {
  api.defaults.baseURL = getServerUrl();
}
