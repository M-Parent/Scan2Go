// For all-in-one Docker: use empty string (relative URL via Nginx proxy)
// For development/microservices: use REACT_APP_API_URL env variable
const API_BASE_URL = process.env.REACT_APP_API_URL || "";

export default API_BASE_URL;
