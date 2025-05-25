// notifications_handler.js

// Assume currentUser.id will be available globally or passed appropriately when integrated.
// For standalone testing, it might need to be fetched or hardcoded.
let currentUserId = null; // Will be set after authentication

const NOTIFICATION_POLL_INTERVAL = 120000; // 2 minutes

// --- Helper Functions ---
function formatDateForNotification(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diffSeconds = Math.round((now - date) / 1000);
    const diffMinutes = Math.round(diffSeconds / 60);
    const diffHours = Math.round(diffMinutes / 60);
    const diffDays = Math.round(diffHours / 24);

    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return `Yesterday`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

// --- Core Notification Logic ---

// This function would ideally be triggered when the notification panel is opened.
// For now, it will be called on page load for testing.
async function fetchNotifications(userIdToFetch = null) {
    const targetUserId = userIdToFetch || currentUserId;
    if (!targetUserId) {
        console.log("User ID not available for fetching notifications.");
        // Attempt to get it if not set (e.g. initial load)
        try {
            const res = await fetch('/api/auth/me', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                currentUserId = data.user.id;
            } else {
                 if (document.getElementById('notifications-loading')) {
                    document.getElementById('notifications-loading').textContent = 'Please log in to see notifications.';
                }
                return;
            }
        } catch (e) {
             if (document.getElementById('notifications-loading')) {
                document.getElementById('notifications-loading').textContent = 'Error fetching user data.';
            }
            return;
        }
    }


    const notificationsListDiv = document.getElementById('notifications-list');
    const loadingMessageEl = document.getElementById('notifications-loading');
    const noNotificationsMessageEl = document.getElementById('no-notifications-message');
    const badge = document.getElementById('notification-badge'); // Assume this exists in main_layout

    if (loadingMessageEl) loadingMessageEl.style.display = 'block';
    if (noNotificationsMessageEl) noNotificationsMessageEl.style.display = 'none';
    if (notificationsListDiv) notificationsListDiv.innerHTML = ''; // Clear current list

    try {
        const response = await fetch(`/api/user/${targetUserId}/notifications`, { credentials: 'include' });
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }
        const notifications = await response.json();

        if (loadingMessageEl) loadingMessageEl.style.display = 'none';

        if (notifications.length === 0) {
            if (noNotificationsMessageEl) noNotificationsMessageEl.style.display = 'block';
            if (notificationsListDiv) notificationsListDiv.innerHTML = '';
        } else {
            notifications.forEach(notif => {
                const item = document.createElement('div');
                item.className = 'notification-item' + (notif.isRead ? ' read' : ' unread');
                item.style.cssText = "padding: 10px; border-bottom: 1px solid #2A2E31; cursor: pointer;";
                if(!notif.isRead) item.style.backgroundColor = "#2a3b4d";

                item.innerHTML = `
                    <p class="notification-message" style="margin: 0 0 5px 0; font-size: 0.9em;">${notif.message}</p>
                    <small class="notification-timestamp" style="font-size: 0.75em; color: #A0A6AD;">${formatDateForNotification(notif.createdAt)}</small>
                `;
                if (!notif.isRead) {
                    item.addEventListener('click', () => markNotificationAsRead(notif.id, targetUserId));
                }
                if (notificationsListDiv) notificationsListDiv.appendChild(item);
            });
        }
        
        const unreadCount = notifications.filter(n => !n.isRead).length;
        if (badge) {
            badge.textContent = unreadCount;
            badge.style.display = unreadCount > 0 ? 'inline-block' : 'none'; // Or 'flex' depending on badge styling
        }

    } catch (error) {
        console.error('Error fetching notifications:', error);
        if (loadingMessageEl) loadingMessageEl.style.display = 'none';
        if (notificationsListDiv) notificationsListDiv.innerHTML = `<p style="color: #ff6b6b; text-align:center;">Error loading notifications.</p>`;
    }
}

async function markNotificationAsRead(notificationId, userIdToFetch = null) {
    const targetUserId = userIdToFetch || currentUserId;
    if (!targetUserId) return;
    try {
        const response = await fetch(`/api/user/${targetUserId}/notifications/${notificationId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Credentials': 'include' },
            body: JSON.stringify({ isRead: 1 })
        });
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }
        // Successfully marked as read, refresh notifications to update UI
        fetchNotifications(targetUserId); 
    } catch (error) {
        console.error(`Error marking notification ${notificationId} as read:`, error);
        // Optionally show an error to the user
    }
}

async function markAllNotificationsAsRead(userIdToFetch = null) {
    const targetUserId = userIdToFetch || currentUserId;
    if (!targetUserId) return;

    const markAllBtn = document.getElementById('mark-all-read-btn');
    if(markAllBtn) markAllBtn.disabled = true;

    try {
        const response = await fetch(`/api/user/${targetUserId}/notifications-mark-all`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Credentials': 'include' },
            body: JSON.stringify({ isRead: 1 })
        });
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }
        // Refresh notifications
        fetchNotifications(targetUserId);
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
    } finally {
        if(markAllBtn) markAllBtn.disabled = false;
    }
}


// Conceptual: This would be in main_app.js and tied to an icon in main_layout.html
function toggleNotificationsPanel() {
    const panel = document.getElementById('notifications-panel'); // Assuming this ID exists in main_layout.html
    if (panel) {
        const isVisible = panel.style.display === 'block';
        panel.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) { // If panel was hidden and is now shown
            fetchNotifications(); // Fetch notifications when panel is opened
        }
    } else {
        console.warn("Notification panel element not found. Cannot toggle.");
    }
}


// Event listener for the "Mark all as read" button within notifications_panel_content.html
// This needs to be callable after notifications_panel_content.html is loaded into the DOM.
function setupPanelEventListeners() {
    const markAllReadButton = document.getElementById('mark-all-read-btn');
    if (markAllReadButton) {
        markAllReadButton.addEventListener('click', () => markAllNotificationsAsRead());
    }
}

// Initialization:
// This would typically be called once currentUserId is known,
// and the notification panel's HTML content is part of the main page.
async function initializeNotificationSystem() {
    // 1. Get current user ID (if not already available)
    if (!currentUserId) {
        try {
            const res = await fetch('/api/auth/me', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                currentUserId = data.user.id;
            } else {
                console.error("Notifications: User not authenticated.");
                return; // Stop if no user
            }
        } catch (e) {
            console.error("Notifications: Error fetching user.", e);
            return; // Stop on error
        }
    }

    // 2. Setup panel event listeners (assuming panel HTML is already loaded/part of the page)
    setupPanelEventListeners(); // For "Mark all as read"

    // 3. Initial fetch for badge count and panel (if it were visible)
    fetchNotifications();

    // 4. Periodic polling for badge update
    setInterval(async () => {
        if (!currentUserId) { // Re-check in case of logout
             try {
                const res = await fetch('/api/auth/me', { credentials: 'include' });
                if (res.ok) {
                    const data = await res.json();
                    currentUserId = data.user.id;
                } else { currentUserId = null; }
            } catch (e) { currentUserId = null; }
        }
        if(currentUserId) { // Only poll if user is logged in
             const response = await fetch(`/api/user/${currentUserId}/notifications`, { credentials: 'include' });
             if (response.ok) {
                 const notifications = await response.json();
                 const unreadCount = notifications.filter(n => !n.isRead).length;
                 const badge = document.getElementById('notification-badge'); // Conceptual
                 if (badge) {
                     badge.textContent = unreadCount;
                     badge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
                 }
             }
        }
    }, NOTIFICATION_POLL_INTERVAL);

    // Conceptual: Attach toggleNotificationsPanel to an icon click in main_layout.html
    // const notificationIcon = document.getElementById('notifications-icon');
    // if (notificationIcon) {
    //     notificationIcon.addEventListener('click', toggleNotificationsPanel);
    // }
}

// If this script is loaded standalone with notifications_panel_content.html for testing:
// document.addEventListener('DOMContentLoaded', initializeNotificationSystem);
// However, for integration, initializeNotificationSystem should be called from main_app.js
// after user login and when the main layout (including the panel area) is ready.

// For now, to make it testable with notifications_test_page.html, we can do:
if (document.getElementById('notifications-panel-content')) { // Check if we are on a page that has the panel
    document.addEventListener('DOMContentLoaded', async () => {
        // Simulate getting user ID for testing
        try {
            const res = await fetch('/api/auth/me', {credentials: 'include'});
            if (res.ok) {
                const data = await res.json();
                currentUserId = data.user.id;
                setupPanelEventListeners();
                fetchNotifications(); // Fetch and display immediately for test page
            } else {
                console.error("Test page: User not logged in.");
                document.getElementById('notifications-list').innerHTML = '<p style="color: #A0A6AD;">Please log in to see notifications.</p>';
            }
        } catch(e) {
             console.error("Test page init error:", e);
             document.getElementById('notifications-list').innerHTML = '<p style="color: #ff6b6b;">Error initializing notifications.</p>';
        }
    });
}
