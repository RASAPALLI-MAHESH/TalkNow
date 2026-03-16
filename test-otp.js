const axios = require('axios');
axios.post('http://localhost:8080/api/auth/send-signup-otp', { email: 'test@example.com' })
    .then(res => console.log('Success:', res.data))
    .catch(err => {
        console.error('Error Status:', err.response?.status);
        console.error('Error Data:', err.response?.data);
        console.error('Error Message:', err.message);
    });