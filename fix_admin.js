const fs = require('fs');
const path = 'admin/admin.js';
let content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

const head = lines.slice(0, 45).join('\n');
const middle = `
async function handleLogin(e) {
    e.preventDefault();
    const formData = new FormData(loginForm);
    const username = formData.get('username');
    const password = formData.get('password');
    
    try {
        console.log('Attempting login to:', \`\${API_BASE}/login\`);
        const response = await fetch(\`\${API_BASE}/login\`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json().catch(() => ({ message: 'Invalid JSON from server' }));
        console.log('Login response:', response.status, data);
        
        if (response.ok) {
            authToken = data.token;
            currentAdminToken = data.token;
            currentUser = data.user;
            localStorage.setItem('admin_token', authToken);
            showMessage('loginMessage', 'Login successful!', 'success');
            setTimeout(() => {
                showScreen('dashboard');
                loadDashboard();
            }, 1000);
        } else {
            const errorMsg = data.message || 'Login failed';
            showMessage('loginMessage', errorMsg, 'error');
            alert('Login Error (' + response.status + '): ' + errorMsg);
        }
    } catch (error) {
        console.error('Login network error:', error);
        showMessage('loginMessage', 'Network error. Please try again.', 'error');
        alert('Network Error: ' + error.message + '\\nThis usually means the API is unreachable or crashed.');
    }
}

function handleLogout() {
    authToken = '';
    currentAdminToken = '';
    currentUser = null;
    localStorage.removeItem('admin_token');
    showScreen('login');
    showMessage('loginMessage', '', '');
}

async function verifyToken() {
    try {
        const response = await fetch(\`\${API_BASE}/verify\`, {
`;
const tail = lines.slice(46).join('\n');

fs.writeFileSync(path, head + middle + tail);
console.log('Fixed');
