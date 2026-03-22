// Configuration
const CONFIG = {
    MQTT_BROKER: 'your-instance.hivemq.cloud',
    MQTT_PORT: 8883,
    MQTT_TOPICS: {
        SCHEDULE_UPDATE: 'bell/schedule/update',
        RING_NOW: 'bell/ring/now',
        STATUS: 'bell/status'
    },
    API_URL: '/.netlify/functions'
};

// Global Variables
let mqttClient = null;
let schedule = [];
let user = null;
let daysSchedule = {
    "Monday": { enabled: false, periods: [] },
    "Tuesday": { enabled: false, periods: [] },
    "Wednesday": { enabled: false, periods: [] },
    "Thursday": { enabled: false, periods: [] },
    "Friday": { enabled: false, periods: [] },
    "Saturday": { enabled: false, periods: [] },
    "Sunday": { enabled: false, periods: [] },
    "Exam Day": { enabled: false, periods: [] }
};
let isExamMode = false;
let expandedDay = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function () {
    initNetlifyIdentity();
    setupEventListeners();
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
});

// Netlify Identity Setup
function initNetlifyIdentity() {
    if (window.netlifyIdentity) {
        window.netlifyIdentity.on('init', user => {
            if (user) {
                handleLogin(user);
            }
        });

        window.netlifyIdentity.on('login', handleLogin);
        window.netlifyIdentity.on('logout', handleLogout);
    }

    // Check if user is already logged in
    const currentUser = netlifyIdentity.currentUser();
    if (currentUser) {
        handleLogin(currentUser);
    }
}

function handleLogin(userData) {
    user = userData;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    connectToMQTT();
    
    // Load schedule AFTER login
    setTimeout(() => {
        loadSchedule();
    }, 500); // Small delay to ensure everything is ready
}

function handleLogout() {
    user = null;
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
    if (mqttClient && mqttClient.connected) {
        mqttClient.end();
    }
}

// Event Listeners
function setupEventListeners() {
    // Login Button
    document.getElementById('googleLogin')?.addEventListener('click', () => {
        netlifyIdentity.open('login');
    });

    // Logout Button
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        netlifyIdentity.logout();
    });

    // Add Period Button
    document.getElementById('addPeriodBtn')?.addEventListener('click', () => {
        document.getElementById('addPeriodModal').style.display = 'flex';
    });

    // Ring Now Button
    document.getElementById('ringNowBtn')?.addEventListener('click', ringBellNow);

    // Modal Close Buttons
    document.querySelectorAll('.close, .cancel-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('addPeriodModal').style.display = 'none';
            document.getElementById('periodForm').reset();
        });
    });

    // Period Form Submission
    document.getElementById('periodForm')?.addEventListener('submit', savePeriod);

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('addPeriodModal');
        if (e.target === modal) {
            modal.style.display = 'none';
            document.getElementById('periodForm').reset();
        }
    });

    // Mode selector
    document.querySelectorAll('input[name="scheduleMode"]').forEach(radio => {
        radio.addEventListener('change', async (e) => {
            if (e.target.value === 'exam') {
                isExamMode = true;
                await toggleDay('Exam Day', true);
            } else {
                isExamMode = false;
                await toggleDay('Exam Day', false);
            }
        });
    });

    // Toggle all days
    document.getElementById('toggleAllBtn')?.addEventListener('click', async () => {
        const allEnabled = Object.keys(daysSchedule).every(day => daysSchedule[day].enabled);

        Object.keys(daysSchedule).forEach(async (dayName) => {
            if (dayName !== 'Exam Day') {
                await toggleDay(dayName, !allEnabled);
            }
        });
    });

    // Clear all periods
    document.getElementById('clearAllBtn')?.addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear all periods?')) {
            Object.keys(daysSchedule).forEach(dayName => {
                daysSchedule[dayName].periods = [];
                updateDayCard(dayName);
            });
            await clearDatabaseAndUpdateSchedule();
            showNotification('All periods cleared', 'success');
        }
    });
}

// MQTT Connection
function connectToMQTT() {
    // For production, use a proper MQTT library with WebSocket support
    // This is a simplified version - in real implementation, use Paho MQTT or similar

    console.log('Connecting to MQTT broker...');
    updateConnectionStatus('connecting');

    // Simulated connection - replace with actual MQTT implementation
    setTimeout(() => {
        updateConnectionStatus('connected');
        simulateMQTTConnection();
    }, 1000);
}

function simulateMQTTConnection() {
    // This simulates MQTT messages - replace with actual MQTT client
    setInterval(() => {
        // Simulate status updates
        const statuses = ['online', 'offline', 'bell_rang'];
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

        if (randomStatus === 'bell_rang') {
            updateLastBellTime();
        }

        updateMQTTStatus(randomStatus);
    }, 10000);
}

// Schedule Management
// Load schedule from database
async function loadSchedule() {
    try {
        console.log('📥 Loading schedule from database...');
        
        // Fetch from API
        const response = await fetch(`${CONFIG.API_URL}/getSchedule`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('📊 Raw schedule data:', result);

        // Reset days schedule but KEEP existing periods structure
        const previousSchedule = JSON.parse(JSON.stringify(daysSchedule)); // Backup
        
        // Initialize days with empty periods first
        Object.keys(daysSchedule).forEach(dayName => {
            daysSchedule[dayName].periods = [];
            daysSchedule[dayName].enabled = false;
        });
        
        if (result.schedule && result.schedule.periods && result.schedule.periods.length > 0) {
            console.log(`✅ Found ${result.schedule.periods.length} periods in database`);
            
            // Group periods by day
            result.schedule.periods.forEach(period => {
                if (daysSchedule[period.day]) {
                    // Add period to the appropriate day
                    daysSchedule[period.day].periods.push({
                        name: period.name || 'Period',
                        day: period.day,
                        startTime: period.startTime,
                        endTime: period.endTime || period.startTime, // If no end time, use start time + 45 min
                        duration: period.duration || 5,
                        scheduleId: period.scheduleId || generateScheduleId(),
                        bellRang: false
                    });
                    
                    // Mark day as enabled if it has periods
                    daysSchedule[period.day].enabled = true;
                    
                    console.log(`   Added period to ${period.day}: ${period.startTime}`);
                }
            });
            
            // Check if exam mode is active
            isExamMode = result.schedule.periods.some(p => p.day === 'Exam Day');
            
            // Save to localStorage as backup
            localStorage.setItem('bellSchedule', JSON.stringify(daysSchedule));
            
            console.log('✅ Schedule loaded successfully');
        } else {
            console.log('ℹ️ No periods found in database, using empty schedule');
            
            // If no data in DB but we have local backup, use that
            const localBackup = localStorage.getItem('bellSchedule');
            if (localBackup) {
                try {
                    const backupSchedule = JSON.parse(localBackup);
                    Object.assign(daysSchedule, backupSchedule);
                    console.log('📦 Restored from local backup');
                } catch (e) {
                    console.error('Error parsing local backup:', e);
                }
            }
        }
        
        // Initialize UI with loaded schedule
        initializeDays();
        updatePeriodsCount();
        calculateNextBell();
        
        // Print summary for debugging
        printScheduleSummary();
        
    } catch (error) {
        console.error('❌ Error loading schedule:', error);
        
        // Fallback to localStorage if API fails
        try {
            const savedSchedule = localStorage.getItem('bellSchedule');
            if (savedSchedule) {
                const parsed = JSON.parse(savedSchedule);
                Object.assign(daysSchedule, parsed);
                console.log('📦 Fallback: Loaded from localStorage');
                initializeDays();
                updatePeriodsCount();
                calculateNextBell();
            } else {
                // Initialize with empty days
                initializeDays();
            }
        } catch (e) {
            console.error('Error loading from localStorage:', e);
            initializeDays();
        }
    }
}

// Helper function to generate schedule ID if missing
function generateScheduleId() {
    return 'xxxxxx'.replace(/[x]/g, () => {
        return Math.floor(Math.random() * 16).toString(16);
    });
}

// Print schedule summary for debugging
function printScheduleSummary() {
    console.log('\n📊 CURRENT SCHEDULE SUMMARY:');
    console.log('============================');
    
    let totalPeriods = 0;
    Object.keys(daysSchedule).forEach(dayName => {
        const count = daysSchedule[dayName].periods.length;
        if (count > 0) {
            console.log(`${dayName}: ${count} periods ${daysSchedule[dayName].enabled ? '(ENABLED)' : '(DISABLED)'}`);
            totalPeriods += count;
        }
    });
    
    console.log(`TOTAL: ${totalPeriods} periods`);
    console.log(`Exam Mode: ${isExamMode ? 'YES' : 'NO'}`);
    console.log('============================\n');
}

function renderSchedule() {
    const scheduleList = document.getElementById('scheduleList');
    scheduleList.innerHTML = '';

    schedule.forEach((period, index) => {
        const periodElement = document.createElement('div');
        periodElement.className = 'schedule-item';
        periodElement.innerHTML = `
            <div class="schedule-info">
                <h3>${period.name || `Period ${index + 1}`}</h3>
                <div class="schedule-time">
                    <i class="far fa-clock"></i> ${period.startTime} - ${period.endTime}
                    <span class="duration">(${period.duration}s bell)</span>
                </div>
            </div>
            <div class="schedule-actions">
                <button class="btn edit-btn" onclick="editPeriod(${index})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn delete-btn" onclick="deletePeriod(${index})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        scheduleList.appendChild(periodElement);
    });
}

async function savePeriod(e) {
    e.preventDefault();
    
    const dayName = document.getElementById('periodDay').value;
    const periodName = document.getElementById('periodName').value;
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    const bellDuration = parseInt(document.getElementById('bellDuration').value);
    
    // Validate inputs
    if (!dayName) {
        showNotification('Please select a day', 'error');
        return;
    }
    
    if (!periodName) {
        showNotification('Please enter a period name', 'error');
        return;
    }
    
    if (startTime >= endTime) {
        showNotification('End time must be after start time', 'error');
        return;
    }
    
    // Check for duplicate periods on the SAME day only
    const existingPeriod = daysSchedule[dayName].periods.find(p => 
        p.startTime === startTime
    );
    
    if (existingPeriod) {
        showNotification(`A period already exists on ${dayName} at ${startTime}`, 'error');
        return;
    }
    
    const period = {
        name: periodName,
        day: dayName,
        startTime: startTime,
        endTime: endTime,
        duration: bellDuration
    };
    
    console.log(`Adding period: ${dayName} ${startTime} - ${endTime}`);
    
    // Add period to the day
    daysSchedule[dayName].periods.push(period);
    
    // Sort periods by time
    daysSchedule[dayName].periods.sort((a, b) => {
        return a.startTime.localeCompare(b.startTime);
    });
    
    // Update the day card
    updateDayCard(dayName);
    
    // Save to database if day is enabled
    if (daysSchedule[dayName].enabled) {
        await updateScheduleInDatabase();
    } else {
        // Just save to local storage/SPIFFS
        saveScheduleToLocalStorage();
    }
    
    // Close modal and reset form
    document.getElementById('addPeriodModal').style.display = 'none';
    document.getElementById('periodForm').reset();
    
    showNotification(`Period added to ${dayName} successfully!`, 'success');
    
    // Update counts
    updatePeriodsCount();
    calculateNextBell();
}

async function sendScheduleToESP32() {
    try {
        const periods = getAllEnabledPeriods();
        
        // Validate periods before sending
        if (periods.length === 0) {
            console.log('No periods to send');
            return;
        }
        
        // Log what we're sending for debugging
        console.log('Sending periods:', periods);
        
        const timestamp = new Date().getTime();
        const response = await fetch(`${CONFIG.API_URL}/scheduleQueue?_=${timestamp}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token.access_token}`,
                'Cache-Control': 'no-cache'
            },
            body: JSON.stringify({
                periods: periods,
                timestamp: new Date().toISOString(),
                type: 'full_schedule_update'
            })
        });
        
        if (response.status === 401 || response.status === 403) {
            showNotification('Session expired. Please log in again.', 'error');
            netlifyIdentity.logout();
            return;
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server responded with ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        console.log('✅ Schedule sent and stored:', result);
        showNotification(`Schedule sent (${periods.length} periods)`, 'success');
        
    } catch (error) {
        console.error('Error sending schedule:', error);
        showNotification('Failed to send schedule', 'error');
    }
}

async function forceScheduleSync() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/getSchedule`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${user.token.access_token}`
            }
        });

        const result = await response.json();

        if (!response.ok) throw new Error(result.error || 'Failed to sync schedule');

        console.log('✅ Schedule synced from server:', result);
        showNotification(`Schedule synced (${result.count} periods)`, 'success');

    } catch (error) {
        console.error('Error syncing schedule:', error);
        showNotification('Failed to sync schedule', 'error');
    }
}

async function ringBellNow() {
    const duration = parseInt(document.getElementById('manualDuration').value);

    try {
        const response = await fetch(`${CONFIG.API_URL}/ringNow`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token.access_token}`
            },
            body: JSON.stringify({ duration })
        });

        if (!response.ok) throw new Error('Failed to ring bell');

        updateLastBellTime();
        showNotification('Bell rung successfully!', 'success');
    } catch (error) {
        console.error('Error ringing bell:', error);
        showNotification('Failed to ring bell', 'error');
    }
}

// Helper Functions
function updateCurrentTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', {
        hour12: true,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('currentTime').textContent = timeString;
}

function updateConnectionStatus(status) {
    const statusElement = document.getElementById('connectionStatus');
    const dotElement = document.querySelector('.status-dot');

    switch (status) {
        case 'connected':
            statusElement.textContent = 'Connected';
            dotElement.className = 'status-dot online';
            break;
        case 'connecting':
            statusElement.textContent = 'Connecting...';
            dotElement.className = 'status-dot connecting';
            break;
        case 'disconnected':
            statusElement.textContent = 'Disconnected';
            dotElement.className = 'status-dot offline';
            break;
    }
}

function updateMQTTStatus(status) {
    document.getElementById('mqttStatus').textContent = status;
}

function updateLastBellTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', {
        hour12: true,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('lastBellTime').textContent = timeString;
}

// Update periods count
function updatePeriodsCount() {
    const totalPeriods = Object.keys(daysSchedule).reduce((total, dayName) => {
        return total + daysSchedule[dayName].periods.length;
    }, 0);

    document.getElementById('periodsCount').textContent = totalPeriods;
}

// Calculate next bell considering day
function calculateNextBell() {
    const now = new Date();
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
    const currentTime = now.getHours() * 60 + now.getMinutes();

    let nextBell = null;

    // Check today's schedule if enabled
    if (daysSchedule[currentDay]?.enabled) {
        for (const period of daysSchedule[currentDay].periods) {
            const [startHour, startMinute] = period.startTime.split(':').map(Number);
            const startTime = startHour * 60 + startMinute;

            if (startTime > currentTime) {
                if (!nextBell || startTime < nextBell.startTime) {
                    nextBell = {
                        time: period.startTime,
                        startTime: startTime,
                        day: currentDay
                    };
                }
            }
        }
    }

    // If no bell today, check next enabled day
    if (!nextBell) {
        const days = Object.keys(daysSchedule);
        const currentDayIndex = days.indexOf(currentDay);

        for (let i = 1; i <= days.length; i++) {
            const nextDayIndex = (currentDayIndex + i) % days.length;
            const nextDay = days[nextDayIndex];

            if (daysSchedule[nextDay]?.enabled && daysSchedule[nextDay].periods.length > 0) {
                const earliestPeriod = daysSchedule[nextDay].periods.reduce((earliest, period) => {
                    const [startHour, startMinute] = period.startTime.split(':').map(Number);
                    const startTime = startHour * 60 + startMinute;
                    return !earliest || startTime < earliest.startTime ?
                        { time: period.startTime, startTime: startTime, day: nextDay } : earliest;
                }, null);

                if (earliestPeriod) {
                    nextBell = earliestPeriod;
                    break;
                }
            }
        }
    }

    if (nextBell) {
        document.getElementById('nextBellTime').textContent =
            `${nextBell.day} ${nextBell.time}`;
    } else {
        document.getElementById('nextBellTime').textContent = 'No schedule';
    }
}

function editPeriod(index) {
    const period = schedule[index];

    document.getElementById('periodName').value = period.name || '';
    document.getElementById('startTime').value = period.startTime;
    document.getElementById('endTime').value = period.endTime;
    document.getElementById('bellDuration').value = period.duration;

    // Remove the old period
    schedule.splice(index, 1);

    document.getElementById('addPeriodModal').style.display = 'flex';
}

async function deletePeriod(index) {
    if (confirm('Are you sure you want to delete this period?')) {
        const period = schedule[index];

        try {
            // First get the latest schedule to see the structure
            const getResponse = await fetch(`${CONFIG.API_URL}/getSchedule`);
            const latestSchedule = await getResponse.json();

            console.log('Latest schedule from DB:', latestSchedule);

            // Use startTime for deletion
            const response = await fetch(`${CONFIG.API_URL}/scheduleQueue`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user.token.access_token}`
                },
                body: JSON.stringify({
                    startTime: period.startTime
                })
            });

            if (response.ok) {
                schedule.splice(index, 1);
                localStorage.setItem('bellSchedule', JSON.stringify(schedule));
                renderSchedule();
                updatePeriodsCount();
                calculateNextBell();
                showNotification('Period deleted successfully!', 'success');
                await sendScheduleToESP32();
            } else {
                throw new Error('Delete failed');
            }

        } catch (error) {
            console.error('Error:', error);
            showNotification('Delete failed. Using startTime: ' + period.startTime, 'error');
        }
    }
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        background: ${type === 'success' ? '#4cc9f0' : '#f72585'};
        color: white;
        border-radius: 8px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Add CSS for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Initialize days in schedule list
function initializeDays() {
    const scheduleList = document.getElementById('scheduleList');
    scheduleList.innerHTML = '';

    Object.keys(daysSchedule).forEach(dayName => {
        const dayCard = createDayCard(dayName);
        scheduleList.appendChild(dayCard);
    });
}

// Create day card HTML
function createDayCard(dayName) {
    const day = daysSchedule[dayName];
    const periodCount = day.periods.length;

    const dayCard = document.createElement('div');
    dayCard.className = `day-card ${day.enabled ? 'active' : ''} ${isExamMode && dayName === 'Exam Day' ? 'exam-mode' : ''}`;
    dayCard.id = `day-${dayName.replace(/\s+/g, '-').toLowerCase()}`;

    dayCard.innerHTML = `
        <div class="day-header" onclick="toggleDayExpansion('${dayName}')">
            <div class="day-info">
                <i class="ri-arrow-right-s-fill day-icon"></i>
                <span class="day-title">${dayName}</span>
                <span class="period-count">${periodCount} period${periodCount !== 1 ? 's' : ''}</span>
            </div>
            <div class="day-toggle">
                <label class="toggle-switch">
                    <input type="checkbox" ${day.enabled ? 'checked' : ''} 
                           onchange="toggleDay('${dayName}', this.checked)">
                    <span class="toggle-slider"></span>
                </label>
                <button class="add-period-btn" onclick="openAddPeriodModal('${dayName}')">
                    <i class="ri-apps-2-add-fill"></i>
                </button>
            </div>
        </div>
        <div class="periods-container">
            ${renderPeriodsForDay(dayName)}
        </div>
    `;

    return dayCard;
}

// Render periods for a specific day
function renderPeriodsForDay(dayName) {
    const periods = daysSchedule[dayName].periods;
    if (periods.length === 0) {
        return '<div class="no-periods">No periods added</div>';
    }

    return periods.map((period, index) => `
        <div class="period-item" data-period-index="${index}">
            <div class="period-info">
                <h4>${period.name || `Period ${index + 1}`}</h4>
                <div class="period-time">
                    <i class="far fa-clock"></i> ${period.startTime} - ${period.endTime}
                    <span class="duration">(${period.duration}s bell)</span>
                </div>
            </div>
            <div class="period-actions">
                <button class="btn delete-period-btn" onclick="deletePeriodFromDay('${dayName}', ${index})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Toggle day expansion
function toggleDayExpansion(dayName) {
    const dayCard = document.getElementById(`day-${dayName.replace(/\s+/g, '-').toLowerCase()}`);

    if (expandedDay === dayName) {
        dayCard.classList.remove('day-expanded');
        expandedDay = null;
    } else {
        // Collapse previously expanded day
        if (expandedDay) {
            const prevDayCard = document.getElementById(`day-${expandedDay.replace(/\s+/g, '-').toLowerCase()}`);
            prevDayCard.classList.remove('day-expanded');
        }

        dayCard.classList.add('day-expanded');
        expandedDay = dayName;
    }
}

// Toggle day on/off
async function toggleDay(dayName, enabled) {
    if (isExamMode && dayName !== 'Exam Day' && enabled) {
        showNotification('Cannot enable regular days in Exam mode. Disable Exam Day first.', 'error');
        document.querySelector(`#day-${dayName.replace(/\s+/g, '-').toLowerCase()} input[type="checkbox"]`).checked = false;
        return;
    }
    
    if (dayName === 'Exam Day' && enabled) {
        // Enable Exam Day mode - keep all periods but disable other days
        isExamMode = true;
        Object.keys(daysSchedule).forEach(day => {
            if (day !== 'Exam Day') {
                daysSchedule[day].enabled = false;
                updateDayCard(day);
            }
        });
        daysSchedule['Exam Day'].enabled = true;
        updateDayCard('Exam Day');
        await updateScheduleInDatabase('replace'); // Replace mode for exam change
        
    } else if (dayName === 'Exam Day' && !enabled) {
        // Disable Exam Day mode
        isExamMode = false;
        daysSchedule['Exam Day'].enabled = false;
        updateDayCard('Exam Day');
        await updateScheduleInDatabase('replace'); // Replace mode for exam change
        
    } else {
        // Regular day toggle - preserve all periods
        daysSchedule[dayName].enabled = enabled;
        updateDayCard(dayName);
        
        // Update database (merge mode preserves other days)
        await updateScheduleInDatabase('merge');
    }
    
    // Update mode selector
    document.querySelector('input[name="scheduleMode"][value="exam"]').checked = isExamMode;
    document.querySelector('input[name="scheduleMode"][value="regular"]').checked = !isExamMode;
    
    // Save to localStorage
    localStorage.setItem('bellSchedule', JSON.stringify(daysSchedule));
}

// Open add period modal with selected day
function openAddPeriodModal(dayName) {
    document.getElementById('addPeriodModal').style.display = 'flex';
    document.getElementById('selectedDay').value = dayName;
    document.getElementById('periodDay').value = dayName;
}

async function deletePeriodFromDay(dayName, periodIndex) {
    if (confirm('Are you sure you want to delete this period?')) {
        const period = daysSchedule[dayName].periods[periodIndex];
        console.log(`Deleting period: ${dayName} ${period.startTime} - ${period.name}`);
        
        daysSchedule[dayName].periods.splice(periodIndex, 1);
        updateDayCard(dayName);
        
        if (daysSchedule[dayName].enabled) {
            await updateScheduleInDatabase();
        } else {
            saveScheduleToLocalStorage();
        }
        
        updatePeriodsCount();
        calculateNextBell();
        
        showNotification(`Period deleted from ${dayName}`, 'success');
    }
}

// Update day card in UI
function updateDayCard(dayName) {
    const dayCard = document.getElementById(`day-${dayName.replace(/\s+/g, '-').toLowerCase()}`);
    const newDayCard = createDayCard(dayName);

    // Preserve expansion state
    if (dayCard.classList.contains('day-expanded')) {
        newDayCard.classList.add('day-expanded');
    }

    dayCard.replaceWith(newDayCard);
}

// Get all enabled periods
function getAllEnabledPeriods() {
    const allPeriods = [];
    const seenKeys = new Set(); // Track unique day+time combinations
    
    Object.keys(daysSchedule).forEach(dayName => {
        if (daysSchedule[dayName].enabled && daysSchedule[dayName].periods.length > 0) {
            daysSchedule[dayName].periods.forEach(period => {
                // Create unique key with day and startTime
                const key = `${dayName}-${period.startTime}`;
                
                // Only add if we haven't seen this day+time combination
                if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    allPeriods.push({
                        ...period,
                        day: dayName
                    });
                } else {
                    console.warn(`⚠️ Skipping duplicate period: ${dayName} ${period.startTime}`);
                }
            });
        }
    });
    
    console.log(`📊 Total enabled periods: ${allPeriods.length}`);
    return allPeriods;
}

// Clear database and update schedule
async function clearDatabaseAndUpdateSchedule() {
    try {
        // Clear all schedules from database
        const clearResponse = await fetch(`${CONFIG.API_URL}/clearSchedule`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token.access_token}`
            }
        });

        if (!clearResponse.ok) {
            throw new Error('Failed to clear schedule');
        }

        // Update with current schedule
        await updateScheduleInDatabase();

    } catch (error) {
        console.error('Error clearing schedule:', error);
        showNotification('Failed to update schedule', 'error');
    }
}

// Clear specific day from database
async function clearDayFromDatabase(dayName) {
    try {
        const response = await fetch(`${CONFIG.API_URL}/clearDay`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token.access_token}`
            },
            body: JSON.stringify({ day: dayName })
        });

        if (!response.ok) {
            throw new Error('Failed to clear day');
        }

        showNotification(`Cleared ${dayName} from schedule`, 'success');
    } catch (error) {
        console.error('Error clearing day:', error);
    }
}

// Update schedule in database
async function updateScheduleInDatabase() {
    const periods = getAllEnabledPeriods();
    
    if (periods.length === 0) {
        console.log('No enabled periods to save');
        // Clear database if no periods
        await clearDatabaseAndUpdateSchedule();
        return;
    }
    
    // Log periods being sent for debugging
    console.log('📤 Sending periods to database:', periods);
    
    // Check for duplicates before sending
    const uniquePeriods = [];
    const seenKeys = new Set();
    
    for (const period of periods) {
        const key = `${period.day}-${period.startTime}`;
        if (!seenKeys.has(key)) {
            seenKeys.add(key);
            uniquePeriods.push(period);
        } else {
            console.warn(`⚠️ Duplicate found and removed: ${period.day} ${period.startTime}`);
        }
    }
    
    try {
        const timestamp = new Date().getTime();
        const response = await fetch(`${CONFIG.API_URL}/scheduleQueue?_=${timestamp}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token.access_token}`,
                'Cache-Control': 'no-cache'
            },
            body: JSON.stringify({
                periods: uniquePeriods,
                timestamp: new Date().toISOString(),
                type: 'full_schedule_update'
            })
        });
        
        if (response.status === 401 || response.status === 403) {
            showNotification('Session expired. Please log in again.', 'error');
            netlifyIdentity.logout();
            return;
        }
        
        if (!response.ok) {
            throw new Error('Failed to update schedule');
        }
        
        const result = await response.json();
        console.log('✅ Schedule updated in database:', result);
        showNotification(`Schedule updated (${uniquePeriods.length} periods)`, 'success');
        
        // Send to ESP32
        await sendScheduleToESP32();
        
    } catch (error) {
        console.error('Error updating schedule:', error);
        showNotification('Failed to update schedule', 'error');
    }
}

// Helper function to clear database
async function clearDatabase() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/clearSchedule`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.token.access_token}`
            }
        });
        
        if (!response.ok) {
            console.warn('Failed to clear database:', await response.text());
        } else {
            console.log('✅ Database cleared');
        }
    } catch (error) {
        console.error('Error clearing database:', error);
    }
}

// ==============================================
// PWA FUNCTIONALITY
// ==============================================

let deferredPrompt = null;
let isPwaInstalled = false;
let pwaPromptShown = false;

// Check if PWA is already installed
function checkPwaInstallation() {
    // Check display mode
    if (window.matchMedia('(display-mode: standalone)').matches) {
        isPwaInstalled = true;
        console.log('📱 Running as PWA');
        return true;
    }

    // Check if launched from home screen
    if (window.navigator.standalone) {
        isPwaInstalled = true;
        console.log('📱 Running as iOS PWA');
        return true;
    }

    return false;
}

// Handle beforeinstallprompt event
window.addEventListener('beforeinstallprompt', (e) => {
    console.log('📱 PWA Installation available');

    // Prevent Chrome 67 and earlier from automatically showing the prompt
    e.preventDefault();

    // Stash the event so it can be triggered later
    deferredPrompt = e;

    // Check if we should show the prompt
    const hasSeenPrompt = localStorage.getItem('pwaPromptShown');
    const shouldShowPrompt = !hasSeenPrompt && !checkPwaInstallation();

    if (shouldShowPrompt && !pwaPromptShown) {
        // Wait a bit before showing prompt for better UX
        setTimeout(() => {
            showPwaInstallPrompt();
        }, 2000);
    }
});

// Show PWA installation prompt
function showPwaInstallPrompt() {
    if (!deferredPrompt || pwaPromptShown || checkPwaInstallation()) return;

    const prompt = document.getElementById('pwaInstallPrompt');
    prompt.style.display = 'flex';
    pwaPromptShown = true;

    // Mark as shown in localStorage
    localStorage.setItem('pwaPromptShown', 'true');

    console.log('📱 Showing PWA installation prompt');
}

// Hide PWA installation prompt
function hidePwaInstallPrompt() {
    const prompt = document.getElementById('pwaInstallPrompt');
    prompt.style.display = 'none';
}

// Install PWA
async function installPwa() {
    if (!deferredPrompt) {
        console.log('❌ No installation prompt available');
        return;
    }

    try {
        // Show the install prompt
        deferredPrompt.prompt();

        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            console.log('✅ PWA installation accepted');

            // Show redirect notice
            showRedirectNotice();

            // Redirect to PWA after installation
            setTimeout(() => {
                window.location.href = window.location.origin;
            }, 2000);

        } else {
            console.log('❌ PWA installation dismissed');
        }

        // Clear the deferredPrompt variable
        deferredPrompt = null;

        // Hide the prompt
        hidePwaInstallPrompt();

    } catch (error) {
        console.error('❌ PWA installation error:', error);
        hidePwaInstallPrompt();
    }
}

// Show redirect notice
function showRedirectNotice() {
    const redirectNotice = document.getElementById('pwaRedirectNotice');
    redirectNotice.style.display = 'flex';

    // Hide after 3 seconds
    setTimeout(() => {
        redirectNotice.style.display = 'none';
    }, 3000);
}

// Check if running in PWA and redirect if needed
function checkAndRedirectToPwa() {
    const isInBrowser = !window.matchMedia('(display-mode: standalone)').matches;
    const hasPwaInstalled = localStorage.getItem('pwaInstalled') === 'true';

    if (isInBrowser && hasPwaInstalled) {
        console.log('📱 Redirecting to installed PWA');
        showRedirectNotice();

        // Try to open PWA
        setTimeout(() => {
            window.location.href = window.location.origin + '?pwa=true';
        }, 1500);
    }
}

// Handle app installed event
window.addEventListener('appinstalled', (e) => {
    console.log('PWA installed successfully');
    isPwaInstalled = true;

    // Mark as installed in localStorage
    localStorage.setItem('pwaInstalled', 'true');

    // Hide any prompts
    hidePwaInstallPrompt();

    // Show success message
    showNotification('Bell System App installed successfully!', 'success');
});

// Offline detection
function setupOfflineDetection() {
    // Check initial status
    if (!navigator.onLine) {
        handleOffline();
    }

    // Listen for online/offline events
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
}

function handleOffline() {
    console.log('📴 Device is offline');

    // Only redirect to offline page if not already there
    if (!window.location.pathname.includes('offline.html')) {
        window.location.href = '/offline.html';
    }
}

function handleOnline() {
    console.log('📱 Device is back online');

    // If on offline page, redirect back
    if (window.location.pathname.includes('offline.html')) {
        window.location.href = '/';
    }

    // Reload schedule data
    if (user) {
        loadSchedule();
    }
}

// Register service worker
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/service-worker.js');
            console.log('✅ Service Worker registered:', registration);
            
            // Check for updates
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                console.log('🔄 Service Worker update found');
                
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showNotification('New version available! Refresh to update.', 'info');
                    }
                });
            });
            
        } catch (error) {
            console.error('❌ Service Worker registration failed:', error);
        }
    } else {
        console.log('ℹ️ Service Worker not supported in this browser');
    }
}

// Initialize PWA
function initPwa() {
    // Register service worker
    registerServiceWorker();

    // Check if PWA is installed
    checkPwaInstallation();

    // Setup offline detection
    setupOfflineDetection();

    // Setup PWA event listeners
    setupPwaEventListeners();
}

// Setup PWA event listeners
function setupPwaEventListeners() {
    // Install button
    document.getElementById('installPwaBtn')?.addEventListener('click', installPwa);

    // Close prompt button
    document.getElementById('closePwaPrompt')?.addEventListener('click', hidePwaInstallPrompt);

    // Later button
    document.getElementById('laterBtn')?.addEventListener('click', () => {
        hidePwaInstallPrompt();
        localStorage.setItem('pwaPromptShown', 'true');
    });
}

// Update the existing initialize function
document.addEventListener('DOMContentLoaded', function () {
    // Initialize PWA first
    initPwa();
    
    // Initialize Netlify Identity
    initNetlifyIdentity();
    
    // Setup event listeners
    setupEventListeners();
    
    // Update time
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    
    // Check if user is already logged in
    const currentUser = netlifyIdentity.currentUser();
    if (currentUser) {
        // User is logged in, load schedule
        setTimeout(() => {
            loadSchedule();
        }, 1000);
    }
    
    // Check and redirect to PWA if needed
    setTimeout(checkAndRedirectToPwa, 1000);
});
