const API_BASE = '/admin/api';

let authToken = localStorage.getItem('admin_token') || '';
let currentAdminToken = localStorage.getItem("admin_token") || "";
let activeChatUserId = null;
let chatRefreshInterval = null;
let currentUser = null;

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const loginForm = document.getElementById('loginForm');
const configForm = document.getElementById('configForm');

// Initialize app
function init() {
    if (authToken) {
        verifyToken();
    } else {
        showScreen('login');
    }
    
    setupEventListeners();
}

function setupEventListeners() {
    // Login form
    loginForm.addEventListener('submit', handleLogin);
    
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // Navigation
    document.querySelectorAll('.nav-tab').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    
    // Config form
    configForm.addEventListener('submit', handleConfigSave);
}

async function handleLogin(e) {
    e.preventDefault();
    const formData = new FormData(loginForm);
    const username = formData.get('username');
    const password = formData.get('password');
    
    try {
        console.log('Attempting login to:', `${API_BASE}/login`);
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
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
            alert('Login Error: ' + errorMsg);
        }
    } catch (error) {
        console.error('Login network error:', error);
        showMessage('loginMessage', 'Network error. Please try again.', 'error');
        alert('Network Error: Could not reach the API. Check your internet or if the server is down.');
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
        const response = await fetch(`${API_BASE}/verify`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            showScreen('dashboard');
            loadDashboard();
        } else {
            handleLogout();
        }
    } catch (error) {
        handleLogout();
    }
}

function showScreen(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    if (screen === 'login') {
        loginScreen.classList.add('active');
    } else {
        dashboardScreen.classList.add('active');
    }
}

function switchTab(tabName) {
    console.log('Switching to tab:', tabName);
    
    // Hide all tabs
    const allTabs = document.querySelectorAll('.tab-content');
    console.log('Found tab contents:', allTabs.length);
    allTabs.forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active class from all nav tabs
    const allNavTabs = document.querySelectorAll('.nav-tab');
    console.log('Found nav tabs:', allNavTabs.length);
    allNavTabs.forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected tab
    const targetTab = document.getElementById(tabName + 'Tab');
    if (targetTab) {
        targetTab.classList.add('active');
        console.log('Tab activated:', tabName + 'Tab');
    } else {
        console.error('Tab not found:', tabName + 'Tab');
    }
    
    // Add active class to clicked nav tab
    const clickedNavTab = document.querySelector(`[data-tab="${tabName}"]`);
    if (clickedNavTab) {
        clickedNavTab.classList.add('active');
    }

    // Clear any existing chat interval
    if (chatRefreshInterval) {
        clearInterval(chatRefreshInterval);
        chatRefreshInterval = null;
    }

    // Load data based on tab
    switch(tabName) {
        case 'overview':
            loadOverview();
            break;
        case 'users':
            loadUsers();
            break;
        case 'deposits':
            loadDeposits();
            break;
        case 'withdrawals':
            loadWithdrawals();
            break;
        case 'support':
            loadAllUserMessages();
            // Polling for new messages every 5s
            chatRefreshInterval = setInterval(loadAllUserMessages, 5000);
            
            // Bind listeners for new chat UI
            const sendBtn = document.getElementById('sendSupportMessage');
            const input = document.getElementById('supportChatInput');
            if (sendBtn) sendBtn.onclick = sendAdminSupportReply;
            if (input) {
                input.onkeypress = (e) => {
                    if (e.key === 'Enter') sendAdminSupportReply();
                };
            }
            break;
        case 'config':
            loadConfig();
            break;
        case 'system':
            loadOverview();
            break;
    }
}

async function loadDashboard() {
    document.getElementById('adminUser').textContent = `Welcome, ${currentUser.username}`;
    loadOverview();
}

async function loadOverview() {
    try {
        const response = await fetch(`${API_BASE}/stats`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const stats = await response.json();
            document.getElementById('totalUsers').textContent = stats.total_users || 0;
            document.getElementById('systemUptime').textContent = formatUptime(stats.system_uptime);
            document.getElementById('memoryUsage').textContent = formatMemory(stats.memory_usage);
            document.getElementById('nodeVersion').textContent = stats.node_version || 'N/A';
        }
    } catch (error) {
        console.error('Failed to load overview:', error);
    }
}

async function loadConfig() {
    try {
        const response = await fetch(`${API_BASE}/config`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const config = await response.json();
            populateConfigForm(config);
        }
    } catch (error) {
        console.error('Failed to load config:', error);
    }
}

function populateConfigForm(config) {
    // Basic settings
    document.getElementById('siteName').value = config.site_name || '';
    document.getElementById('siteDescription').value = config.site_description || '';
    
    // Feature toggles
    document.getElementById('maintenanceMode').checked = config.maintenance_mode || false;
    document.getElementById('registrationEnabled').checked = config.registration_enabled !== false;
    document.getElementById('tradingEnabled').checked = config.trading_enabled !== false;
    document.getElementById('depositEnabled').checked = config.deposit_enabled !== false;
    
    // Support info
    document.getElementById('supportEmail').value = config.support_email || '';
    document.getElementById('supportPhone').value = config.support_phone || '';
    
    // Appearance
    document.getElementById('themeColor').value = config.theme_color || '#1e40af';
    document.getElementById('logoUrl').value = config.logo_url || '';
    
    // Social links
    const socialLinks = config.social_links || {};
    document.getElementById('twitterUrl').value = socialLinks.twitter || '';
    document.getElementById('telegramUrl').value = socialLinks.telegram || '';
    document.getElementById('discordUrl').value = socialLinks.discord || '';
}

async function handleConfigSave(e) {
    e.preventDefault();
    const formData = new FormData(configForm);
    const config = {};
    
    // Convert form data to config object
    for (let [key, value] of formData.entries()) {
        if (key.includes('.')) {
            const parts = key.split('.');
            let obj = config;
            for (let i = 0; i < parts.length - 1; i++) {
                obj[parts[i]] = obj[parts[i]] || {};
                obj = obj[parts[i]];
            }
            obj[parts[parts.length - 1]] = value;
        } else {
            config[key] = value;
        }
    }
    
    // Handle checkboxes
    config.maintenance_mode = document.getElementById('maintenanceMode').checked;
    config.registration_enabled = document.getElementById('registrationEnabled').checked;
    config.trading_enabled = document.getElementById('tradingEnabled').checked;
    config.deposit_enabled = document.getElementById('depositEnabled').checked;
    
    try {
        const response = await fetch(`${API_BASE}/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(config)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showMessage('configMessage', 'Configuration saved successfully!', 'success');
        } else {
            showMessage('configMessage', data.message || 'Failed to save configuration', 'error');
        }
    } catch (error) {
        showMessage('configMessage', 'Network error. Please try again.', 'error');
    }
}

async function loadUsers() {
    try {
        const response = await fetch(`${API_BASE}/users`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            renderUsersTable(data.users);
        }
    } catch (error) {
        console.error('Failed to load users:', error);
        document.querySelector('#usersTable tbody').innerHTML = 
            '<tr><td colspan="8">Failed to load users</td></tr>';
    }
}

function renderUsersTable(users) {
    const tbody = document.querySelector('#usersTable tbody');
    
    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8">No users found</td></tr>';
        return;
    }
    
    tbody.innerHTML = users.map(user => `
        <tr>
            <td><code class="clickable-user-id" onclick="viewUserDetails('${user.id}')" title="Click to view details">${user.id.slice(0, 8)}</code></td>
            <td>${escapeHtml(user.name)}</td>
            <td>${escapeHtml(user.email)}</td>
            <td><code>${user.passwordHash ? user.passwordHash.slice(0, 20) + '...' : 'N/A'}</code></td>
            <td>${user.wallet ? user.wallet.balance.toFixed(2) + ' USDT' : '0.00 USDT'}</td>
            <td>${user.wallet ? 'Active' : 'No Wallet'}</td>
            <td>${new Date(user.createdAt).toLocaleDateString()}</td>
            <td>
                <button class="btn-small" onclick="viewUserDetails('${user.id}')">View</button>
            </td>
        </tr>
    `).join('');
}

async function loadDeposits() {
    try {
        const response = await fetch(`${API_BASE}/deposits`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            renderDepositsTable(data.deposits);
        }
    } catch (error) {
        console.error('Failed to load deposits:', error);
        document.querySelector('#depositsTable tbody').innerHTML = 
            '<tr><td colspan="8">Failed to load deposits</td></tr>';
    }
}

async function loadWithdrawals() {
    try {
        const response = await fetch(`${API_BASE}/withdrawals`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            renderWithdrawalsTable(data.withdrawals);
        }
    } catch (error) {
        console.error('Failed to load withdrawals:', error);
        document.querySelector('#withdrawalsTable tbody').innerHTML = 
            '<tr><td colspan="8">Failed to load withdrawals</td></tr>';
    }
}

function renderDepositsTable(deposits) {
    const tbody = document.querySelector('#depositsTable tbody');
    
    console.log('Rendering deposits table with:', deposits);
    
    if (!deposits || deposits.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8">No pending deposits found</td></tr>';
        return;
    }
    
    tbody.innerHTML = deposits.map(deposit => {
        const depositId = deposit.id || deposit.rechargeId || '';
        console.log('Creating buttons for deposit:', { userId: deposit.userId, depositId });
        
        return `
        <tr>
            <td><code>${depositId ? depositId.slice(0, 8) : 'N/A'}</code></td>
            <td>${escapeHtml(deposit.userName)}</td>
            <td>${escapeHtml(deposit.userEmail)}</td>
            <td>${Number(deposit.amount).toFixed(2)} USDT</td>
            <td>${escapeHtml(deposit.network || 'Unknown')}</td>
            <td>${new Date(deposit.created).toLocaleString()}</td>
            <td><span class="status-pending">Pending</span></td>
            <td>
                <button class="btn-small btn-approve" onclick="approveDeposit('${deposit.userId}', '${depositId}', 'approve')">Approve</button>
                <button class="btn-small btn-reject" onclick="approveDeposit('${deposit.userId}', '${depositId}', 'reject')">Reject</button>
            </td>
        </tr>
    `;
    }).join('');
    
    console.log('Deposits table rendered');
}

function renderWithdrawalsTable(withdrawals) {
    const tbody = document.querySelector('#withdrawalsTable tbody');
    
    console.log('Rendering withdrawals table with:', withdrawals);
    
    if (!withdrawals || withdrawals.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8">No pending withdrawals found</td></tr>';
        return;
    }
    
    tbody.innerHTML = withdrawals.map(withdrawal => {
        const withdrawalId = withdrawal.id || '';
        console.log('Creating buttons for withdrawal:', { userId: withdrawal.userId, withdrawalId });
        
        return `
        <tr>
            <td><code>${withdrawalId ? withdrawalId.slice(0, 8) : 'N/A'}</code></td>
            <td>${escapeHtml(withdrawal.userName)}</td>
            <td>${escapeHtml(withdrawal.userEmail)}</td>
            <td>${Number(withdrawal.amount).toFixed(2)} USDT</td>
            <td>${escapeHtml(withdrawal.network || 'Unknown')}</td>
            <td>${escapeHtml(withdrawal.address || 'N/A')}</td>
            <td>${new Date(withdrawal.created).toLocaleString()}</td>
            <td><span class="status-pending">Pending</span></td>
            <td>
                <button class="btn-small btn-approve" onclick="approveWithdrawal('${withdrawal.userId}', '${withdrawalId}', 'approve')">Approve</button>
                <button class="btn-small btn-reject" onclick="approveWithdrawal('${withdrawal.userId}', '${withdrawalId}', 'reject')">Reject</button>
            </td>
        </tr>
    `;
    }).join('');
    
    console.log('Withdrawals table rendered');
}

async function approveDeposit(userId, depositId, action) {
    console.log('=== APPROVE/REJECT BUTTON CLICKED ===');
    console.log('User ID:', userId);
    console.log('Deposit ID:', depositId);
    console.log('Action:', action);
    console.log('Auth Token:', authToken ? 'Present' : 'Missing');
    
    if (!userId || !depositId || !action) {
        console.error('Missing parameters:', { userId, depositId, action });
        alert('Missing required parameters');
        return;
    }
    
    try {
        console.log('Sending request to:', `${API_BASE}/deposit/action`);
        
        const response = await fetch(`${API_BASE}/deposit/action`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ userId, depositId, action })
        });
        
        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);
        
        const data = await response.json();
        console.log('Response data:', data);
        
        if (response.ok) {
            alert(`Deposit ${action}d successfully!`);
            showMessage('depositMessage', `Deposit ${action}d successfully!`, 'success');
            loadDeposits(); // Refresh deposits list
            loadUsers(); // Refresh users list to update balances
            // Also refresh user details to update deposit history
            if (window.currentUserDetails && window.currentUserDetails.userId === userId) {
                viewUserDetails(userId);
            }
        } else {
            alert(`Failed to ${action} deposit: ${data.message || 'Unknown error'}`);
            showMessage('depositMessage', data.message || `Failed to ${action} deposit`, 'error');
        }
    } catch (error) {
        console.error('=== ERROR IN APPROVE DEPOSIT ===');
        console.error('Error details:', error);
        alert('Network error. Please try again.');
        showMessage('depositMessage', 'Network error. Please try again.', 'error');
    }
}

async function approveWithdrawal(userId, withdrawalId, action) {
    console.log('=== WITHDRAWAL APPROVE/REJECT BUTTON CLICKED ===');
    console.log('User ID:', userId);
    console.log('Withdrawal ID:', withdrawalId);
    console.log('Action:', action);
    console.log('Auth Token:', authToken ? 'Present' : 'Missing');
    
    if (!userId || !withdrawalId || !action) {
        console.error('Missing parameters:', { userId, withdrawalId, action });
        alert('Missing required parameters');
        return;
    }
    
    try {
        console.log('Sending request to:', `${API_BASE}/withdrawal/action`);
        
        const response = await fetch(`${API_BASE}/withdrawal/action`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ userId, withdrawalId, action })
        });
        
        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);
        
        const data = await response.json();
        console.log('Response data:', data);
        
        if (response.ok) {
            alert(`Withdrawal ${action}ed successfully!`);
            showMessage('withdrawalMessage', `Withdrawal ${action}ed successfully!`, 'success');
            loadWithdrawals(); // Refresh withdrawals list
            loadUsers(); // Refresh users list to update balances
            // Also refresh user details to update withdrawal history
            if (window.currentUserDetails && window.currentUserDetails.userId === userId) {
                viewUserDetails(userId);
            }
        } else {
            alert(`Failed to ${action} withdrawal: ${data.message || 'Unknown error'}`);
            showMessage('withdrawalMessage', data.message || `Failed to ${action} withdrawal`, 'error');
        }
    } catch (error) {
        console.error('=== ERROR IN APPROVE WITHDRAWAL ===');
        console.error('Error details:', error);
        alert('Network error. Please try again.');
        showMessage('withdrawalMessage', 'Network error. Please try again.', 'error');
    }
}

function viewUserDetails(userId) {
    console.log('View user details called for:', userId);
    
    // Find user data from the current users list
    fetch(`${API_BASE}/users`, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => {
        console.log('Response status:', response.status);
        return response.json();
    })
    .then(data => {
        console.log('Users data:', data);
        const user = data.users.find(u => u.id === userId);
        console.log('Found user:', user);
        if (user) {
            // Fetch user wallet data to get complete deposit history
            fetch(`${API_BASE}/user-wallet/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            })
            .then(response => response.json())
            .then(walletData => {
                console.log('Wallet data:', walletData);
                user.wallet = walletData.wallet;
                showUserModal(user);
            })
            .catch(error => {
                console.error('Error fetching wallet data:', error);
                showUserModal(user); // Still show user modal even if wallet data fails
            });
        } else {
            alert('User not found');
        }
    })
    .catch(error => {
        console.error('Error fetching user details:', error);
        alert('Failed to load user details');
    });
}

function showUserModal(user) {
    console.log('Showing user modal for:', user);
    
    // Get modal
    const modal = document.getElementById('userModal');
    if (!modal) {
        console.error('User modal not found!');
        alert('User modal not found!');
        return;
    }
    
    // Store current user ID globally for support buttons
    window.currentModalUserId = user.id;
    console.log('Stored user ID:', window.currentModalUserId);
    
    // Populate user information
    console.log('Populating user info...');
    
    // Basic user info
    document.getElementById('modalUserId').textContent = user.id;
    document.getElementById('modalUserName').textContent = user.name || 'N/A';
    document.getElementById('modalUserEmail').textContent = user.email || 'N/A';
    document.getElementById('modalUserBalance').textContent = (user.balance || 0).toFixed(2) + ' USDT';
    document.getElementById('modalUserCreditScore').textContent = user.creditScore || '100';
    document.getElementById('modalUserRegistered').textContent = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A';
    document.getElementById('modalUserWalletStatus').textContent = user.wallet ? 'Active' : 'No Wallet';
    const kycStatus = user.wallet?.profile?.kycStatus || 'none';
    const kycEl = document.getElementById('modalUserKyc');
    if (kycEl) kycEl.textContent = kycStatus;
    const kycDocWrap = document.getElementById('modalKycDocWrap');
    if (kycDocWrap) {
        const v = user.wallet?.profile?.verification || null;
        if (v && v.idImageData) {
            kycDocWrap.innerHTML = `
                <div><strong>${escapeHtml(v.fullName || '')}</strong> · ${escapeHtml(v.idType || '')} · ${escapeHtml(v.idNumber || '')}</div>
                <img src="${v.idImageData}" alt="KYC document" style="max-width: 260px; margin-top: 8px; border-radius: 8px; border:1px solid #ccc;">
            `;
        } else {
            kycDocWrap.innerHTML = '<span class="text-muted">No KYC document submitted.</span>';
        }
    }
    
    // Populate deposit history
    const modalDeposits = document.getElementById('modalDeposits');
    console.log('Deposit history element:', modalDeposits);
    console.log('User wallet data:', user ? user.wallet : 'No user data');
    
    if (modalDeposits) {
        if (user && user.wallet && user.wallet.recharges) {
            console.log('Populating deposit history...');
            const completedDeposits = user.wallet.recharges.filter(deposit => deposit.status === 'completed');
            console.log('Completed deposits found:', completedDeposits.length);
            
            if (completedDeposits.length === 0) {
                modalDeposits.innerHTML = '<p class="text-muted">No deposit history found</p>';
            } else {
                modalDeposits.innerHTML = completedDeposits.map(deposit => {
                    console.log('Processing deposit:', deposit.id);
                    return `
                    <div class="deposit-item" style="border: 1px solid #ddd; padding: 10px; margin-bottom: 10px; border-radius: 5px;">
                        <div class="deposit-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                            <strong>${deposit.id ? deposit.id.slice(0, 8) : 'N/A'}</strong>
                            <span class="deposit-amount" style="color: green; font-weight: bold;">${Number(deposit.amount).toFixed(2)} USDT</span>
                            <span class="deposit-status ${deposit.status}" style="background: #28a745; color: white; padding: 2px 8px; border-radius: 3px; font-size: 12px;">${deposit.status}</span>
                            <span class="deposit-date">${new Date(deposit.created).toLocaleDateString()}</span>
                        </div>
                        <div class="deposit-details" style="font-size: 12px; color: #666;">
                            <strong>Network:</strong> ${deposit.network || 'N/A'}<br>
                            <strong>Completed:</strong> ${deposit.completedAt ? new Date(deposit.completedAt).toLocaleString() : 'N/A'}
                        </div>
                    </div>`;
                }).join('');
            }
        } else {
            console.log('No deposit history data available');
            modalDeposits.innerHTML = '<p class="text-muted">No deposit history found</p>';
        }
    } else {
        console.error('Deposit history element not found!');
    }
    
    // Check transaction password (this would need to be implemented in backend)
    document.getElementById('modalUserTransactionPassword').textContent = 'Not Available';
    
    // Show modal
    modal.hidden = false;
    modal.style.display = 'flex';
    console.log('User modal displayed');
}

async function kycAction(action) {
    const userId = window.currentModalUserId;
    if (!userId) return;
    try {
        const response = await fetch(`${API_BASE}/kyc/action`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId, action })
        });
        const data = await response.json();
        if (!response.ok) {
            alert(data.message || 'KYC action failed');
            return;
        }
        alert(`KYC ${action}ed successfully`);
        viewUserDetails(userId);
        loadUsers();
    } catch (error) {
        alert('Network error while KYC action');
    }
}

function closeUserModal() {
    const modal = document.getElementById('userModal');
    if (modal) {
        modal.hidden = true;
        modal.style.display = 'none';
        window.currentModalUserId = null;
    }
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

function formatMemory(memoryUsage) {
    const used = memoryUsage.heapUsed / 1024 / 1024;
    const total = memoryUsage.heapTotal / 1024 / 1024;
    return `${used.toFixed(1)}MB / ${total.toFixed(1)}MB`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Customer Support Functions
async function loadSupportTickets() {
    try {
        const response = await fetch(`${API_BASE}/support/tickets`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            renderSupportTickets(data.tickets || []);
        } else {
            renderSupportTickets([]);
        }
    } catch (error) {
        console.error('Error loading support tickets:', error);
        renderSupportTickets([]);
    }
    
    // Also load all user messages
    loadAllUserMessages();
}

async function loadAllUserMessages() {
  try {
    const res = await fetch("/admin/api/support/all-messages", {
      headers: { Authorization: `Bearer ${currentAdminToken}` },
    });
    const data = await res.json();
    const conversations = data.conversations || [];
    renderAllUserConversations(conversations);
    
    // Auto-refresh chat if one is open
    if (activeChatUserId) {
        loadActiveChatMessages(activeChatUserId);
    }
  } catch (e) {
    console.error("Support load error:", e);
  }
}

function renderAllUserConversations(conversations) {
  const root = document.getElementById("adminMessagesList");
  if (!root) return;
  
  if (conversations.length === 0) {
    root.innerHTML = '<div class="p-4 muted">No active conversations</div>';
    return;
  }

  root.innerHTML = conversations.map(conv => {
    const lastMsg = conv.lastMessage;
    const name = conv.userName || "User";
    const preview = lastMsg ? lastMsg.message : "No messages";
    const time = lastMsg ? new Date(lastMsg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";
    const isActive = activeChatUserId === conv.userId ? "active" : "";
    const initials = name.slice(0, 2).toUpperCase();
    const isUnread = conv.unreadCount > 0;
    
    return `
      <div class="conv-item ${isActive}" onclick="selectChatUser('${conv.userId}', '${name}', '${conv.userEmail}')">
        <div class="conv-avatar" style="background: ${isUnread ? '#e7f3ff' : '#eee'}">${initials}</div>
        <div class="conv-info">
          <div style="display:flex; justify-content:space-between">
            <span class="conv-name" style="font-weight: ${isUnread ? '700' : '600'}">${name}</span>
            <span class="conv-time">${time}</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center">
            <span class="conv-preview" style="color: ${isUnread ? '#1a1a1a' : '#666'}">${preview}</span>
            ${conv.unreadCount > 0 ? `<span class="unread-badge">${conv.unreadCount}</span>` : ""}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

async function selectChatUser(userId, name, email) {
    activeChatUserId = userId;
    
    // Update UI highlights
    document.querySelectorAll(".conv-item").forEach(el => el.classList.remove("active"));
    const selectedItem = document.querySelector(`.conv-item[onclick*="${userId}"]`);
    if (selectedItem) selectedItem.classList.add("active");
    
    document.getElementById("activeUserName").textContent = name;
    document.getElementById("activeUserEmail").textContent = email;
    
    const input = document.getElementById("supportChatInput");
    const sendBtn = document.getElementById("sendSupportMessage");
    const profileBtn = document.getElementById("viewActiveProfileBtn");
    
    if (input) { 
        input.disabled = false; 
        input.placeholder = "Type your reply...";
        input.focus(); 
    }
    if (sendBtn) sendBtn.disabled = false;
    if (profileBtn) {
        profileBtn.style.display = "block";
        profileBtn.onclick = () => {
            document.getElementById("customerSearchInput").value = email;
            searchCustomer();
        };
    }
    
    loadActiveChatMessages(userId);
}

async function loadActiveChatMessages(userId) {
    const container = document.getElementById("supportChatMessages");
    if (!container || activeChatUserId !== userId) return;
    
    try {
        const res = await fetch(`/admin/api/support/history?userId=${userId}`, {
            headers: { Authorization: `Bearer ${currentAdminToken}` }
        });
        const data = await res.json();
        const messages = data.messages || [];
        
        if (messages.length === 0) {
            container.innerHTML = '<div class="empty-chat-state">No messages in this thread</div>';
        } else {
            container.innerHTML = messages.map(msg => {
                const isAdmin = msg.type === "admin";
                const cls = isAdmin ? "msg-admin" : "msg-user";
                const time = new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return `
                    <div class="msg-bubble ${cls}">
                        <div>${msg.message}</div>
                        <div class="msg-time">${time}</div>
                    </div>
                `;
            }).join("");
            container.scrollTop = container.scrollHeight;
        }
    } catch (e) {
        console.error("Chat load error:", e);
    }
}

async function sendAdminSupportReply() {
    if (!activeChatUserId) return;
    const input = document.getElementById("supportChatInput");
    const text = input.value.trim();
    if (!text) return;
    
    try {
        const res = await fetch("/admin/api/support/reply", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                Authorization: `Bearer ${currentAdminToken}` 
            },
            body: JSON.stringify({ userId: activeChatUserId, message: text })
        });
        
        if (res.ok) {
            input.value = "";
            await loadActiveChatMessages(activeChatUserId);
            await loadAllUserMessages(); // Update sidebar preview
        } else {
            showToast("Error sending message", true);
        }
    } catch (e) {
        console.error("Reply error:", e);
        showToast("Connection error", true);
    }
}

function renderSupportTickets(tickets) {
    const tbody = document.querySelector('#supportTicketsTable tbody');
    
    if (!tickets || tickets.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">No support tickets found</td></tr>';
        return;
    }
    
    tbody.innerHTML = tickets.map(ticket => `
        <tr>
            <td><code>${ticket.id.slice(0, 8)}</code></td>
            <td>${escapeHtml(ticket.customerName)}</td>
            <td>${escapeHtml(ticket.subject)}</td>
            <td><span class="status-${ticket.status}">${ticket.status}</span></td>
            <td><span class="priority-${ticket.priority}">${ticket.priority}</span></td>
            <td>${new Date(ticket.created).toLocaleString()}</td>
            <td>
                <button class="btn-small" onclick="viewTicketDetails('${ticket.id}')">View</button>
                <button class="btn-small" onclick="viewCustomerProfile('${ticket.customerId}')">Profile</button>
            </td>
        </tr>
    `).join('');
}

function viewTicketDetails(ticketId) {
    alert(`Ticket details for ID: ${ticketId.slice(0, 8)}... (Feature coming soon)`);
}

function viewCustomerProfile(customerId) {
    viewUserDetails(customerId);
}

// Customer search functionality
document.addEventListener('DOMContentLoaded', function() {
    const searchBtn = document.getElementById('searchCustomerBtn');
    const searchInput = document.getElementById('customerSearchInput');
    
    if (searchBtn && searchInput) {
        searchBtn.addEventListener('click', searchCustomer);
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchCustomer();
            }
        });
    }
    
    // Admin chat control buttons
    const refreshBtn = document.getElementById('refreshMessagesBtn');
    const clearBtn = document.getElementById('clearMessagesBtn');
    
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadAllUserMessages();
        });
    }
    
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            document.getElementById('adminMessagesList').innerHTML = '<p class="text-muted">Messages cleared. Click refresh to reload.</p>';
        });
    }
    
    // Quick action buttons
    const createTicketBtn = document.getElementById('createTicketBtn');
    const viewAllCustomersBtn = document.getElementById('viewAllCustomersBtn');
    const supportReportsBtn = document.getElementById('supportReportsBtn');
    
    if (createTicketBtn) {
        createTicketBtn.addEventListener('click', () => {
            alert('Create new ticket feature coming soon');
        });
    }
    
    if (viewAllCustomersBtn) {
        viewAllCustomersBtn.addEventListener('click', () => {
            switchTab('users');
        });
    }
    
    if (supportReportsBtn) {
        supportReportsBtn.addEventListener('click', () => {
            alert('Support reports feature coming soon');
        });
    }
    
    // Support chat send button
    const sendSupportMessageBtn = document.getElementById('sendSupportMessage');
    if (sendSupportMessageBtn) {
        sendSupportMessageBtn.addEventListener('click', sendSupportMessage);
    }
    
    // Support chat input enter key
    const supportChatInput = document.getElementById('supportChatInput');
    if (supportChatInput) {
        supportChatInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendSupportMessage();
            }
        });
    }
});

async function searchCustomer() {
    const searchTerm = document.getElementById('customerSearchInput').value.trim();
    if (!searchTerm) {
        document.getElementById('customerChatHistory').innerHTML = '<p>Please enter a customer name or email</p>';
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/users`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const users = data.users || [];
            
            const matchedUser = users.find(user => 
                user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                user.email.toLowerCase().includes(searchTerm.toLowerCase())
            );
            
            if (matchedUser) {
                displayCustomerChatHistory(matchedUser);
            } else {
                document.getElementById('customerChatHistory').innerHTML = '<p>No customer found</p>';
            }
        }
    } catch (error) {
        console.error('Error searching customer:', error);
        document.getElementById('customerChatHistory').innerHTML = '<p>Error searching customer</p>';
    }
}

function displayCustomerChatHistory(customer) {
    const chatHistory = document.getElementById('customerChatHistory');
    
    const mockMessages = [
        { type: 'customer', message: 'Hi, I need help with my deposit', time: new Date(Date.now() - 3600000) },
        { type: 'admin', message: 'Hello! I\'d be happy to help you with your deposit. Can you provide your transaction ID?', time: new Date(Date.now() - 3000000) },
        { type: 'customer', message: 'My transaction ID is TX123456', time: new Date(Date.now() - 2400000) },
        { type: 'admin', message: 'Thank you! Let me check that for you.', time: new Date(Date.now() - 1800000) }
    ];
    
    const messagesHtml = `
        <div class="customer-info">
            <strong>${escapeHtml(customer.name)}</strong> (${escapeHtml(customer.email)})
            <button class="btn-small" onclick="viewUserDetails('${customer.id}')" style="float: right;">View Profile</button>
        </div>
        <div class="messages">
            ${mockMessages.map(msg => `
                <div class="chat-message ${msg.type}">
                    <div><strong>${msg.type === 'customer' ? customer.name : 'Admin'}:</strong> ${msg.message}</div>
                    <small>${new Date(msg.time).toLocaleString()}</small>
                </div>
            `).join('')}
        </div>
        <div class="chat-input">
            <input type="text" placeholder="Type your message..." style="width: 70%; margin-right: 10px;">
            <button class="btn-primary btn-small">Send</button>
        </div>
    `;
    
    chatHistory.innerHTML = messagesHtml;
}

// Support Chat Functions
let currentSupportUserId = null;

function openSupportChat(userId = null) {
    currentSupportUserId = userId || window.currentModalUserId || document.getElementById('modalUserId').textContent;
    console.log('Opening support chat for user:', currentSupportUserId);
    const modal = document.getElementById('supportChatModal');
    modal.hidden = false;
    loadSupportChatMessages(currentSupportUserId);
}

function closeSupportChatModal() {
    document.getElementById('supportChatModal').hidden = true;
    currentSupportUserId = null;
}

function viewSupportHistory(userId = null) {
    const targetUserId = userId || window.currentModalUserId || document.getElementById('modalUserId').textContent;
    alert(`Support history for user ID: ${targetUserId.slice(0, 8)}... (Feature coming soon)`);
}

async function loadSupportChatMessages(userId) {
    try {
        const response = await fetch(`${API_BASE}/support/messages/${userId}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            renderSupportChatMessages(data.messages || []);
        } else {
            // Load mock messages if API fails
            const mockMessages = [
                { type: 'user', message: 'Hello, I need help with my account', time: Date.now() - 3600000 },
                { type: 'admin', message: 'Hello! How can I help you today?', time: Date.now() - 3000000 }
            ];
            renderSupportChatMessages(mockMessages);
        }
    } catch (error) {
        console.error('Error loading support messages:', error);
        renderSupportChatMessages([]);
    }
}

function renderSupportChatMessages(messages) {
    const messagesContainer = document.getElementById('supportChatMessages');
    
    if (messages.length === 0) {
        messagesContainer.innerHTML = '<p class="text-center text-muted">No messages yet. Start a conversation!</p>';
        return;
    }
    
    messagesContainer.innerHTML = messages.map(msg => `
        <div class="chat-message ${msg.type}">
            <div class="sender">${msg.type === 'user' ? 'User' : 'Admin'}</div>
            <div class="message">${escapeHtml(msg.message)}</div>
            <div class="time">${new Date(msg.time).toLocaleString()}</div>
        </div>
    `).join('');
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function sendSupportMessage() {
    const input = document.getElementById('supportChatInput');
    const message = input.value.trim();
    
    if (!message || !currentSupportUserId) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/support/messages/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                userId: currentSupportUserId,
                message: message,
                type: 'admin'
            })
        });
        
        if (response.ok) {
            input.value = '';
            loadSupportChatMessages(currentSupportUserId);
        } else {
            alert('Failed to send message');
        }
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Error sending message');
    }
}

function initEventListeners() {
    // Tab switching
    document.querySelectorAll('.sidebar-nav a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = link.getAttribute('data-tab');
            showTab(tabId);
        });
    });

    // Support Tab Specific
    document.getElementById('refreshMessagesBtn')?.addEventListener('click', loadAllUserMessages);
    document.getElementById('sendSupportMessage')?.addEventListener('click', sendAdminSupportReply);
    document.getElementById('supportChatInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendAdminSupportReply();
    });

    // Other listeners...
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
}

// Start the app
init();
