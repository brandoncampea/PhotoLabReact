import api from './api';

const playerService = {
  async getRoster() {
    // Example: GET /api/roster or /api/players
    // Adjust the endpoint as needed for your backend
    const response = await api.get('/roster');
    return response.data;
  },
};

export default playerService;
