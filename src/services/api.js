import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle responses and unwrap APIResponse { success: true, data: ... }
api.interceptors.response.use(
  (response) => {
    // If backend uses APIResponse envelope { success: true, data: ... }
    if (response.data && typeof response.data === 'object' && 'success' in response.data && 'data' in response.data) {
      // Keep reference to raw wrapper if needed, but make response.data point to the payload
      const unwrap = response.data.data !== null && response.data.data !== undefined ? response.data.data : response.data;
      return {
        ...response,
        data: unwrap,
        _raw: response.data,
      };
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Helper to extract clean error message from backend error responses
export function getErrorMessage(err, fallback = 'An unexpected error occurred') {
  if (!err) return fallback;
  if (err.response?.data) {
    const d = err.response.data;
    // Standard APIErrorResponse { success: false, error: { message, code, details } }
    if (d.error?.message) return d.error.message;
    // FastAPI HTTP standard { detail: string | array }
    if (typeof d.detail === 'string') return d.detail;
    if (Array.isArray(d.detail) && d.detail.length > 0) {
      return d.detail.map((e) => e.msg || e.message).join(', ');
    }
    if (d.message) return d.message;
  }
  return err.message || fallback;
}

export default api;
