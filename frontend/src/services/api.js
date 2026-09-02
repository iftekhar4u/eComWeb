import axios from 'axios'
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', withCredentials: true })
let csrfToken = ''
api.interceptors.request.use(async (config) => {
	if (!['post', 'put', 'patch', 'delete'].includes(config.method)) return config
	if (!csrfToken) {
		const response = await api.get('/auth/csrf-token')
		csrfToken = response.data.csrfToken
	}
	config.headers['X-CSRF-Token'] = csrfToken
	return config
})
api.interceptors.response.use((response) => {
	if (response.data?.csrfToken) csrfToken = response.data.csrfToken
	return response
}, async (error) => {
	const config = error.config
	const method = config?.method?.toLowerCase()
	if (error.response?.status === 403 && config && ['post', 'put', 'patch', 'delete'].includes(method) && !config._csrfRetry) {
		config._csrfRetry = true
		csrfToken = ''
		const response = await api.get('/auth/csrf-token')
		csrfToken = response.data.csrfToken
		config.headers['X-CSRF-Token'] = csrfToken
		return api(config)
	}
	return Promise.reject(error)
})
export default api
