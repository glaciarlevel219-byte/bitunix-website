// BitBank Trading Platform - Complete JavaScript Application

// Global State
const state = {
    currentPage: 'home',
    selectedPair: 'BTC/USDT',
    selectedTimeframe: '1m',
    orderSide: 'buy',
    leverage: 10,
    user: {
        email: '',
        phone: '',
        username: '',
        authenticated: false
    },
    wallet: {
        BTC: { available: 0, inOrder: 0 },
        ETH: { available: 0, inOrder: 0 },
        USDT: { available: 10000, inOrder: 0 }
    },
    marketData: {},
    chart: null,
    orderBook: {
        buys: [],
        sells: []
    },
    recentTrades: []
};

// API Endpoints
const api = {
    binance: 'https://api.binance.com/api/v3',
    coingecko: 'https://api.coingecko.com/api/v3',
    frankfurter: 'https://api.frankfurter.app'
};

// Trading Pairs
const tradingPairs = [
    { symbol: 'BTC/USDT', base: 'BTC', quote: 'USDT', price: 45234.56 },
    { symbol: 'ETH/USDT', base: 'ETH', quote: 'USDT', price: 2845.32 },
    { symbol: 'BNB/USDT', base: 'BNB', quote: 'USDT', price: 312.45 },
    { symbol: 'SOL/USDT', base: 'SOL', quote: 'USDT', price: 98.76 },
    { symbol: 'ADA/USDT', base: 'ADA', quote: 'USDT', price: 0.45 },
    { symbol: 'DOT/USDT', base: 'DOT', quote: 'USDT', price: 7.89 },
    { symbol: 'MATIC/USDT', base: 'MATIC', quote: 'USDT', price: 0.92 },
    { symbol: 'AVAX/USDT', base: 'AVAX', quote: 'USDT', price: 38.45 }
];

// Market Coins Data
const marketCoins = [
    { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', price: 45234.56, change24h: 2.34, volume24h: 12500000000, marketCap: 885000000000 },
    { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', price: 2845.32, change24h: 1.87, volume24h: 8500000000, marketCap: 342000000000 },
    { id: 'binancecoin', symbol: 'BNB', name: 'Binance Coin', price: 312.45, change24h: -0.65, volume24h: 1200000000, marketCap: 48000000000 },
    { id: 'solana', symbol: 'SOL', name: 'Solana', price: 98.76, change24h: 5.23, volume24h: 2300000000, marketCap: 42000000000 },
    { id: 'cardano', symbol: 'ADA', name: 'Cardano', price: 0.45, change24h: 3.12, volume24h: 450000000, marketCap: 15000000000 },
    { id: 'polkadot', symbol: 'DOT', name: 'Polkadot', price: 7.89, change24h: -1.45, volume24h: 320000000, marketCap: 9000000000 },
    { id: 'polygon', symbol: 'MATIC', name: 'Polygon', price: 0.92, change24h: 2.78, volume24h: 280000000, marketCap: 8500000000 },
    { id: 'avalanche', symbol: 'AVAX', name: 'Avalanche', price: 38.45, change24h: 4.56, volume24h: 410000000, marketCap: 14000000000 }
];

// Initialize Application
function initApp() {
    try {
        console.log('Initializing BitBank Trading Platform...');
        initializeApp();
        setupEventListeners();
        loadMarketData();
        initializeCharts();
        startLiveUpdates();
        console.log('BitBank Trading Platform initialized successfully');
    } catch (error) {
        console.error('Error initializing app:', error);
        // Fallback initialization
        try {
            initializeApp();
            setupEventListeners();
        } catch (fallbackError) {
            console.error('Fallback initialization failed:', fallbackError);
        }
    }
}

// Multiple initialization attempts
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// Backup initialization
window.addEventListener('load', function() {
    if (!window.bitbankInitialized) {
        console.log('Backup initialization triggered');
        initApp();
    }
});

function initializeApp() {
    console.log('BitBank Trading Platform Initialized');
    window.bitbankInitialized = true;
    showPage('home');
    updateWalletDisplay();
    generateOrderBook();
    generateRecentTrades();
}

function setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Navigation - with better error handling
    const navItems = document.querySelectorAll('.nav-item, .mobile-nav .nav-item');
    console.log('Found nav items:', navItems.length);
    navItems.forEach((item, index) => {
        console.log('Setting up nav item:', index, item.getAttribute('data-page'));
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const page = this.getAttribute('data-page');
            console.log('Nav clicked:', page);
            showPage(page);
        });
    });

    // Trading pair selection
    const pairItems = document.querySelectorAll('.pair-item, .contract-item');
    console.log('Found pair items:', pairItems.length);
    pairItems.forEach((item, index) => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Pair item clicked:', index);
            selectTradingPair(this);
        });
    });

    // Timeframe selection
    const timeframeBtns = document.querySelectorAll('.timeframe-btn');
    console.log('Found timeframe buttons:', timeframeBtns.length);
    timeframeBtns.forEach((btn, index) => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Timeframe clicked:', index);
            selectTimeframe(this);
        });
    });

    // Buy/Sell tabs
    const tabBtns = document.querySelectorAll('.buy-sell-tabs .tab-btn');
    console.log('Found tab buttons:', tabBtns.length);
    tabBtns.forEach((btn, index) => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Tab clicked:', index);
            selectOrderSide(this);
        });
    });

    // Order form inputs
    document.getElementById('orderAmount')?.addEventListener('input', calculateOrderTotal);
    document.getElementById('orderPrice')?.addEventListener('input', calculateOrderTotal);

    // Buy/Sell buttons - with timeout to ensure elements exist
    setTimeout(() => {
        const buyBtn = document.getElementById('buyBtn');
        const sellBtn = document.getElementById('sellBtn');
        console.log('Buy button found:', !!buyBtn);
        console.log('Sell button found:', !!sellBtn);
        
        if (buyBtn) {
            buyBtn.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('Buy button clicked');
                placeOrder('buy');
            });
        }
        if (sellBtn) {
            sellBtn.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('Sell button clicked');
                placeOrder('sell');
            });
        }
    }, 100);

    // User menu
    const menuItems = document.querySelectorAll('.menu-item');
    console.log('Found menu items:', menuItems.length);
    menuItems.forEach((item, index) => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.getAttribute('data-section');
            console.log('Menu item clicked:', section);
            showUserSection(section);
        });
    });

    // Admin panel button
    setTimeout(() => {
        const adminBtn = document.getElementById('adminPanelBtn');
        console.log('Admin button found:', !!adminBtn);
        if (adminBtn) {
            adminBtn.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('Admin button clicked');
                openAdminPanel();
            });
        }
    }, 100);

    // Save profile
    setTimeout(() => {
        const saveBtn = document.getElementById('saveProfile');
        console.log('Save button found:', !!saveBtn);
        if (saveBtn) {
            saveBtn.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('Save button clicked');
                saveUserProfile();
            });
        }
    }, 100);

    // Market search
    document.getElementById('coinSearch')?.addEventListener('input', filterMarketCoins);
    document.getElementById('pairSearch')?.addEventListener('input', filterTradingPairs);

    // Category filters
    document.getElementById('categoryFilter')?.addEventListener('change', filterMarketCoins);

    // Quick actions
    const actionCards = document.querySelectorAll('.action-card');
    console.log('Found action cards:', actionCards.length);
    actionCards.forEach((card, index) => {
        card.addEventListener('click', function(e) {
            e.preventDefault();
            const action = this.getAttribute('data-action');
            console.log('Action card clicked:', action);
            handleQuickAction(action);
        });
    });

    // Assets tabs
    setTimeout(() => {
        const assetTabs = document.querySelectorAll('.assets-tabs .tab-btn');
        console.log('Found asset tabs:', assetTabs.length);
        assetTabs.forEach((btn, index) => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                const tab = this.getAttribute('data-tab');
                console.log('Asset tab clicked:', tab);
                showAssetsTab(tab);
            });
        });
    }, 100);

    // Leverage selector
    setTimeout(() => {
        const leverageSelect = document.getElementById('leverageSelect');
        console.log('Leverage select found:', !!leverageSelect);
        if (leverageSelect) {
            leverageSelect.addEventListener('change', function(e) {
                console.log('Leverage changed:', this.value);
                state.leverage = parseInt(this.value);
            });
        }
    }, 100);
    
    console.log('Event listeners setup completed');
}

function showPage(pageName) {
    try {
        console.log('Switching to page:', pageName);
        
        // Hide all pages
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });

        // Show selected page
        const targetPage = document.getElementById(pageName + 'Page');
        if (targetPage) {
            targetPage.classList.add('active');
            console.log('Page activated:', pageName);
        } else {
            console.error('Page not found:', pageName + 'Page');
            return;
        }

        // Update navigation
        document.querySelectorAll('.nav-item, .mobile-nav .nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-page') === pageName) {
                item.classList.add('active');
            }
        });

        state.currentPage = pageName;

        // Page-specific initialization
        if (pageName === 'market') {
            renderMarketTable();
        } else if (pageName === 'trade') {
            renderTradingPairs();
            setTimeout(() => initializeTradingChart(), 500);
        } else if (pageName === 'assets') {
            updateWalletDisplay();
        } else if (pageName === 'user') {
            // User page initialization
        } else if (pageName === 'futures') {
            // Futures page initialization
        }
        
        console.log('Page switch completed:', pageName);
    } catch (error) {
        console.error('Error switching page:', error);
    }
}

function loadMarketData() {
    // Load market data from APIs
    Promise.all([
        fetchBinanceData(),
        fetchCoinGeckoData()
    ]).then(([binanceData, coingeckoData]) => {
        state.marketData = {
            binance: binanceData,
            coingecko: coingeckoData
        };
        updateMarketOverview();
        updateMarketTable();
    }).catch(error => {
        console.error('Error loading market data:', error);
        // Use mock data as fallback
        useMockMarketData();
    });
}

async function fetchBinanceData() {
    try {
        const response = await fetch(`${api.binance}/ticker/24hr?symbol=BTCUSDT`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Binance API error:', error);
        return null;
    }
}

async function fetchCoinGeckoData() {
    try {
        const response = await fetch(`${api.coingecko}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('CoinGecko API error:', error);
        return null;
    }
}

function useMockMarketData() {
    console.log('Using mock market data');
    updateMarketOverview();
    updateMarketTable();
}

function updateMarketOverview() {
    // Update hero stats with real-time data
    const stats = {
        volume24h: '$2.5T+',
        listedCoins: '350+',
        users: '50M+'
    };

    // Update market cards
    const marketCards = document.querySelectorAll('.market-card');
    marketCards.forEach((card, index) => {
        if (index < marketCoins.length) {
            const coin = marketCoins[index];
            const priceElement = card.querySelector('.current-price');
            const changeElement = card.querySelector('.price-change');
            
            if (priceElement) priceElement.textContent = `$${coin.price.toLocaleString()}`;
            if (changeElement) {
                changeElement.textContent = `${coin.change24h > 0 ? '+' : ''}${coin.change24h}%`;
                changeElement.className = `price-change ${coin.change24h > 0 ? 'positive' : 'negative'}`;
            }
        }
    });
}

function renderMarketTable() {
    try {
        console.log('Rendering market table...');
        const tbody = document.getElementById('marketTableBody');
        if (!tbody) {
            console.error('Market table body not found');
            return;
        }

        tbody.innerHTML = '';
        
        marketCoins.forEach((coin, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 20px;">${getCoinIcon(coin.symbol)}</span>
                        <div>
                            <div style="font-weight: bold;">${coin.name}</div>
                            <div style="color: #8b949e; font-size: 12px;">${coin.symbol}</div>
                        </div>
                    </div>
                </td>
                <td>$${coin.price.toLocaleString()}</td>
                <td style="color: ${coin.change24h > 0 ? '#3fb950' : '#f85149'};">
                    ${coin.change24h > 0 ? '+' : ''}${coin.change24h}%
                </td>
                <td>$${(coin.volume24h / 1000000).toFixed(0)}M</td>
                <td>$${(coin.marketCap / 1000000000).toFixed(1)}B</td>
                <td>
                    <div style="height: 40px; background: #0d1117; border-radius: 4px;"></div>
                </td>
                <td>
                    <button class="btn btn-primary" style="padding: 4px 8px; font-size: 12px;" onclick="window.showPage('trade'); window.selectCoinBySymbol('${coin.symbol}')">
                        Trade
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
        
        console.log('Market table rendered successfully');
    } catch (error) {
        console.error('Error rendering market table:', error);
    }
}

function renderTradingPairs() {
    try {
        console.log('Rendering trading pairs...');
        const pairList = document.getElementById('pairList');
        if (!pairList) {
            console.error('Pair list not found');
            return;
        }

        pairList.innerHTML = '';
        
        tradingPairs.forEach(pair => {
            const pairItem = document.createElement('div');
            pairItem.className = 'pair-item';
            if (pair.symbol === state.selectedPair) {
                pairItem.classList.add('active');
            }
            
            pairItem.innerHTML = `
                <span>${pair.symbol}</span>
                <span>$${pair.price.toLocaleString()}</span>
            `;
            
            pairItem.addEventListener('click', () => {
                selectTradingPair(pair);
            });
            
            pairList.appendChild(pairItem);
        });
        
        console.log('Trading pairs rendered successfully');
    } catch (error) {
        console.error('Error rendering trading pairs:', error);
    }
}

function selectTradingPair(pair) {
    if (typeof pair === 'object') {
        state.selectedPair = pair.symbol;
    } else {
        state.selectedPair = pair;
    }
    
    // Update UI
    const selectedPairElement = document.getElementById('selectedPair');
    if (selectedPairElement) {
        selectedPairElement.textContent = state.selectedPair;
    }
    
    // Update pair list
    document.querySelectorAll('.pair-item').forEach(item => {
        item.classList.remove('active');
        if (item.textContent.includes(state.selectedPair)) {
            item.classList.add('active');
        }
    });
    
    // Update price
    const pair = tradingPairs.find(p => p.symbol === state.selectedPair);
    if (pair) {
        updateTradingPrice(pair.price);
        generateOrderBook(pair.price);
        loadTradingChart(pair.symbol);
    }
}

function selectTimeframe(btn) {
    document.querySelectorAll('.timeframe-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.selectedTimeframe = btn.getAttribute('data-tf');
    loadTradingChart(state.selectedPair);
}

function selectOrderSide(btn) {
    document.querySelectorAll('.buy-sell-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.orderSide = btn.getAttribute('data-side');
}

function calculateOrderTotal() {
    const price = parseFloat(document.getElementById('orderPrice')?.value || 0);
    const amount = parseFloat(document.getElementById('orderAmount')?.value || 0);
    const total = price * amount;
    
    const totalInput = document.getElementById('orderTotal');
    if (totalInput) {
        totalInput.value = total.toFixed(2);
    }
}

function placeOrder(side) {
    const price = parseFloat(document.getElementById('orderPrice')?.value || 0);
    const amount = parseFloat(document.getElementById('orderAmount')?.value || 0);
    
    if (!price || !amount) {
        alert('Please enter valid price and amount');
        return;
    }
    
    const total = price * amount;
    
    // Check wallet balance
    if (side === 'buy') {
        if (total > state.wallet.USDT.available) {
            alert('Insufficient USDT balance');
            return;
        }
        state.wallet.USDT.available -= total;
        state.wallet.USDT.inOrder += total;
    } else {
        const pair = tradingPairs.find(p => p.symbol === state.selectedPair);
        if (pair && amount > state.wallet[pair.base]?.available) {
            alert(`Insufficient ${pair.base} balance`);
            return;
        }
        if (pair) {
            state.wallet[pair.base].available -= amount;
            state.wallet[pair.base].inOrder += amount;
        }
    }
    
    // Add to recent trades
    const trade = {
        pair: state.selectedPair,
        side: side,
        price: price,
        amount: amount,
        total: total,
        time: new Date().toLocaleTimeString()
    };
    
    state.recentTrades.unshift(trade);
    if (state.recentTrades.length > 20) {
        state.recentTrades.pop();
    }
    
    updateRecentTrades();
    updateWalletDisplay();
    
    // Clear form
    document.getElementById('orderAmount').value = '';
    document.getElementById('orderTotal').value = '';
    
    alert(`${side.toUpperCase()} order placed successfully!`);
}

function generateOrderBook(basePrice = null) {
    const price = basePrice || tradingPairs.find(p => p.symbol === state.selectedPair)?.price || 45234.56;
    
    state.orderBook.buys = [];
    state.orderBook.sells = [];
    
    // Generate buy orders
    for (let i = 0; i < 10; i++) {
        const orderPrice = price - (i + 1) * (price * 0.001);
        const amount = Math.random() * 2 + 0.1;
        state.orderBook.buys.push({
            price: orderPrice,
            amount: amount,
            total: orderPrice * amount
        });
    }
    
    // Generate sell orders
    for (let i = 0; i < 10; i++) {
        const orderPrice = price + (i + 1) * (price * 0.001);
        const amount = Math.random() * 2 + 0.1;
        state.orderBook.sells.push({
            price: orderPrice,
            amount: amount,
            total: orderPrice * amount
        });
    }
    
    updateOrderBook();
}

function updateOrderBook() {
    const buyOrders = document.getElementById('buyOrders');
    const sellOrders = document.getElementById('sellOrders');
    
    if (buyOrders) {
        buyOrders.innerHTML = '';
        state.orderBook.buys.forEach(order => {
            const row = document.createElement('div');
            row.className = 'book-row buy';
            row.innerHTML = `
                <span>${order.price.toFixed(2)}</span>
                <span>${order.amount.toFixed(4)}</span>
                <span>${order.total.toFixed(2)}</span>
            `;
            buyOrders.appendChild(row);
        });
    }
    
    if (sellOrders) {
        sellOrders.innerHTML = '';
        state.orderBook.sells.reverse().forEach(order => {
            const row = document.createElement('div');
            row.className = 'book-row sell';
            row.innerHTML = `
                <span>${order.price.toFixed(2)}</span>
                <span>${order.amount.toFixed(4)}</span>
                <span>${order.total.toFixed(2)}</span>
            `;
            sellOrders.appendChild(row);
        });
    }
}

function generateRecentTrades() {
    state.recentTrades = [];
    for (let i = 0; i < 10; i++) {
        const pair = tradingPairs[Math.floor(Math.random() * tradingPairs.length)];
        const side = Math.random() > 0.5 ? 'buy' : 'sell';
        const price = pair.price * (1 + (Math.random() - 0.5) * 0.002);
        const amount = Math.random() * 2 + 0.1;
        
        state.recentTrades.push({
            pair: pair.symbol,
            side: side,
            price: price,
            amount: amount,
            total: price * amount,
            time: new Date(Date.now() - Math.random() * 3600000).toLocaleTimeString()
        });
    }
    
    updateRecentTrades();
}

function updateRecentTrades() {
    const tradesList = document.getElementById('recentTrades');
    if (!tradesList) return;
    
    tradesList.innerHTML = '';
    state.recentTrades.forEach(trade => {
        const row = document.createElement('div');
        row.className = `trade-row ${trade.side}`;
        row.innerHTML = `
            <span>${trade.pair}</span>
            <span>${trade.price.toFixed(2)}</span>
            <span>${trade.amount.toFixed(4)}</span>
        `;
        tradesList.appendChild(row);
    });
}

function initializeCharts() {
    // Initialize mini charts on home page
    setTimeout(() => {
        createMiniChart('btcChart');
        createMiniChart('ethChart');
        createMiniChart('bnbChart');
        createMiniChart('solChart');
    }, 100);
}

function createMiniChart(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Simple line chart using canvas
    const canvas = document.createElement('canvas');
    canvas.width = container.offsetWidth;
    canvas.height = container.offsetHeight;
    container.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    const points = [];
    const numPoints = 20;
    
    for (let i = 0; i < numPoints; i++) {
        points.push(Math.random() * canvas.height * 0.6 + canvas.height * 0.2);
    }
    
    ctx.strokeStyle = '#58a6ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    points.forEach((point, index) => {
        const x = (index / (numPoints - 1)) * canvas.width;
        if (index === 0) {
            ctx.moveTo(x, point);
        } else {
            ctx.lineTo(x, point);
        }
    });
    
    ctx.stroke();
}

function initializeTradingChart() {
    if (typeof LightweightCharts === 'undefined') {
        console.log('LightweightCharts not loaded yet');
        setTimeout(initializeTradingChart, 1000);
        return;
    }
    
    const container = document.getElementById('tradingChart');
    if (!container) return;
    
    if (state.chart) {
        state.chart.remove();
    }
    
    state.chart = LightweightCharts.createChart(container, {
        width: container.offsetWidth,
        height: 400,
        layout: {
            background: { color: '#0d1117' },
            textColor: '#8b949e'
        },
        grid: {
            vertLines: { color: '#21262d' },
            horzLines: { color: '#21262d' }
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal
        },
        rightPriceScale: {
            borderColor: '#21262d'
        },
        timeScale: {
            borderColor: '#21262d',
            timeVisible: true
        }
    });
    
    const candlestickSeries = state.chart.addCandlestickSeries({
        upColor: '#3fb950',
        downColor: '#f85149',
        borderVisible: false,
        wickUpColor: '#3fb950',
        wickDownColor: '#f85149'
    });
    
    // Generate sample candlestick data
    const data = generateCandlestickData();
    candlestickSeries.setData(data);
    
    state.chart.timeScale().fitContent();
}

function generateCandlestickData() {
    const data = [];
    const now = Date.now();
    let price = 45234.56;
    
    for (let i = 100; i >= 0; i--) {
        const time = now - i * 60000; // 1 minute intervals
        const open = price;
        const change = (Math.random() - 0.5) * price * 0.002;
        const close = price + change;
        const high = Math.max(open, close) + Math.random() * price * 0.001;
        const low = Math.min(open, close) - Math.random() * price * 0.001;
        
        data.push({
            time: Math.floor(time / 1000),
            open: open,
            high: high,
            low: low,
            close: close
        });
        
        price = close;
    }
    
    return data;
}

function loadTradingChart(symbol) {
    // In a real application, this would load actual chart data
    // For now, regenerate chart with new data
    initializeTradingChart();
}

function updateTradingPrice(price) {
    const currentPriceElement = document.getElementById('currentPrice');
    const orderPriceInput = document.getElementById('orderPrice');
    const spreadPriceElement = document.getElementById('spreadPrice');
    
    if (currentPriceElement) {
        currentPriceElement.textContent = `$${price.toLocaleString()}`;
    }
    
    if (orderPriceInput && !orderPriceInput.value) {
        orderPriceInput.value = price.toFixed(2);
    }
    
    if (spreadPriceElement) {
        spreadPriceElement.textContent = price.toFixed(2);
    }
    
    calculateOrderTotal();
}

function showUserSection(section) {
    // Update menu
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-section') === section) {
            item.classList.add('active');
        }
    });
    
    // Show section
    document.querySelectorAll('.user-section').forEach(sec => {
        sec.classList.remove('active');
    });
    
    const targetSection = document.getElementById(section + 'Section');
    if (targetSection) {
        targetSection.classList.add('active');
    }
}

function saveUserProfile() {
    const email = document.getElementById('userEmail')?.value;
    const phone = document.getElementById('userPhone')?.value;
    const username = document.getElementById('username')?.value;
    
    state.user.email = email;
    state.user.phone = phone;
    state.user.username = username;
    
    alert('Profile saved successfully!');
}

function openAdminPanel() {
    // Open admin panel in new window
    window.open('/admin', '_blank');
}

function updateWalletDisplay() {
    // Update total balance
    let totalBalance = state.wallet.USDT.available;
    const btcPrice = marketCoins.find(c => c.symbol === 'BTC')?.price || 45234.56;
    const ethPrice = marketCoins.find(c => c.symbol === 'ETH')?.price || 2845.32;
    
    totalBalance += state.wallet.BTC.available * btcPrice;
    totalBalance += state.wallet.ETH.available * ethPrice;
    
    const totalBalanceElement = document.getElementById('totalBalance');
    if (totalBalanceElement) {
        totalBalanceElement.textContent = totalBalance.toFixed(2);
    }
    
    // Update wallet cards
    const walletCards = document.querySelectorAll('.wallet-card');
    walletCards.forEach(card => {
        const walletName = card.querySelector('.wallet-name')?.textContent;
        if (walletName === 'Bitcoin') {
            card.querySelector('.available').textContent = `Available: ${state.wallet.BTC.available.toFixed(8)}`;
            card.querySelector('.in-order').textContent = `In Order: ${state.wallet.BTC.inOrder.toFixed(8)}`;
        } else if (walletName === 'Ethereum') {
            card.querySelector('.available').textContent = `Available: ${state.wallet.ETH.available.toFixed(8)}`;
            card.querySelector('.in-order').textContent = `In Order: ${state.wallet.ETH.inOrder.toFixed(8)}`;
        } else if (walletName === 'Tether') {
            card.querySelector('.available').textContent = `Available: ${state.wallet.USDT.available.toFixed(2)}`;
            card.querySelector('.in-order').textContent = `In Order: ${state.wallet.USDT.inOrder.toFixed(2)}`;
        }
    });
}

function filterMarketCoins() {
    const searchTerm = document.getElementById('coinSearch')?.value.toLowerCase() || '';
    const category = document.getElementById('categoryFilter')?.value || 'all';
    
    const filteredCoins = marketCoins.filter(coin => {
        const matchesSearch = coin.name.toLowerCase().includes(searchTerm) || 
                              coin.symbol.toLowerCase().includes(searchTerm);
        const matchesCategory = category === 'all' || true; // Add category logic if needed
        return matchesSearch && matchesCategory;
    });
    
    // Re-render table with filtered coins
    const tbody = document.getElementById('marketTableBody');
    if (tbody) {
        tbody.innerHTML = '';
        filteredCoins.forEach(coin => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 20px;">${getCoinIcon(coin.symbol)}</span>
                        <div>
                            <div style="font-weight: bold;">${coin.name}</div>
                            <div style="color: #8b949e; font-size: 12px;">${coin.symbol}</div>
                        </div>
                    </div>
                </td>
                <td>$${coin.price.toLocaleString()}</td>
                <td style="color: ${coin.change24h > 0 ? '#3fb950' : '#f85149'};">
                    ${coin.change24h > 0 ? '+' : ''}${coin.change24h}%
                </td>
                <td>$${(coin.volume24h / 1000000).toFixed(0)}M</td>
                <td>$${(coin.marketCap / 1000000000).toFixed(1)}B</td>
                <td>
                    <div style="height: 40px; background: #0d1117; border-radius: 4px;"></div>
                </td>
                <td>
                    <button class="btn btn-primary" style="padding: 4px 8px; font-size: 12px;" onclick="showPage('trade'); selectCoinBySymbol('${coin.symbol}')">
                        Trade
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }
}

function filterTradingPairs() {
    const searchTerm = document.getElementById('pairSearch')?.value.toLowerCase() || '';
    
    const filteredPairs = tradingPairs.filter(pair => 
        pair.symbol.toLowerCase().includes(searchTerm)
    );
    
    const pairList = document.getElementById('pairList');
    if (pairList) {
        pairList.innerHTML = '';
        filteredPairs.forEach(pair => {
            const pairItem = document.createElement('div');
            pairItem.className = 'pair-item';
            if (pair.symbol === state.selectedPair) {
                pairItem.classList.add('active');
            }
            
            pairItem.innerHTML = `
                <span>${pair.symbol}</span>
                <span>$${pair.price.toLocaleString()}</span>
            `;
            
            pairItem.addEventListener('click', () => {
                selectTradingPair(pair);
            });
            
            pairList.appendChild(pairItem);
        });
    }
}

function selectCoinBySymbol(symbol) {
    const pair = tradingPairs.find(p => p.base === symbol);
    if (pair) {
        selectTradingPair(pair);
    }
}

function handleQuickAction(action) {
    switch (action) {
        case 'buy':
            showPage('trade');
            selectOrderSide(document.querySelector('.buy-sell-tabs .tab-btn[data-side="buy"]'));
            break;
        case 'sell':
            showPage('trade');
            selectOrderSide(document.querySelector('.buy-sell-tabs .tab-btn[data-side="sell"]'));
            break;
        case 'transfer':
            alert('Transfer feature coming soon!');
            break;
        case 'staking':
            alert('Staking feature coming soon!');
            break;
    }
}

function showAssetsTab(tab) {
    // Update tabs
    document.querySelectorAll('.assets-tabs .tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-tab') === tab) {
            btn.classList.add('active');
        }
    });
    
    // Show/hide content based on tab
    // This would typically show different wallet sections
    console.log('Showing assets tab:', tab);
}

function getCoinIcon(symbol) {
    const icons = {
        'BTC': '₿',
        'ETH': 'Ξ',
        'BNB': '🟡',
        'SOL': '🟣',
        'ADA': '🔵',
        'DOT': '🔴',
        'MATIC': '🟪',
        'AVAX': '🟠'
    };
    return icons[symbol] || '🪙';
}

function startLiveUpdates() {
    // Update prices every 5 seconds
    setInterval(() => {
        updateMarketOverview();
        generateOrderBook();
        
        // Update selected pair price
        const pair = tradingPairs.find(p => p.symbol === state.selectedPair);
        if (pair) {
            // Simulate price movement
            const change = (Math.random() - 0.5) * pair.price * 0.001;
            pair.price += change;
            updateTradingPrice(pair.price);
        }
    }, 5000);
    
    // Update recent trades every 3 seconds
    setInterval(() => {
        if (Math.random() > 0.7) {
            generateRecentTrades();
        }
    }, 3000);
}

// Export functions for global access
window.showPage = showPage;
window.selectCoinBySymbol = selectCoinBySymbol;
