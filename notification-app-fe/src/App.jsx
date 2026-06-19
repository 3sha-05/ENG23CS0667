import { useState } from "react";

const initialNotifications = [
  {
    id: "notif-1",
    title: "Welcome to Campus Notifications",
    body: "Your notification dashboard is ready.",
    type: "info",
    isRead: false,
    createdAt: "2026-06-19T10:00:00Z",
  },
  {
    id: "notif-2",
    title: "New Evaluation Available",
    body: "A new evaluation report is ready for your review.",
    type: "alert",
    isRead: false,
    createdAt: "2026-06-18T16:22:00Z",
  },
  {
    id: "notif-3",
    title: "System Maintenance Scheduled",
    body: "The notification service will be briefly unavailable tomorrow.",
    type: "system",
    isRead: true,
    createdAt: "2026-06-17T14:05:00Z",
  },
];

export default function App() {
  const [notifications, setNotifications] = useState(initialNotifications);

  const toggleRead = (id) => {
    setNotifications((current) =>
      current.map((item) =>
        item.id === id ? { ...item, isRead: !item.isRead } : item,
      ),
    );
  };

  const removeNotification = (id) => {
    setNotifications((current) => current.filter((item) => item.id !== id));
  };

  const unreadCount = notifications.filter((item) => !item.isRead).length;

  return (
    <div className="app-shell">
      <div className="app-card">
        <div className="app-header">
          <div>
            <p className="eyebrow">Stage 1</p>
            <h1>Notification Center</h1>
            <p className="subtitle">
              Review and manage the latest campus notifications.
            </p>
          </div>
          <span className="badge">{unreadCount} unread</span>
        </div>

        <div className="notification-list">
          {notifications.length === 0 ? (
            <p className="empty-state">No notifications available.</p>
          ) : (
            notifications.map((notification) => (
              <article key={notification.id} className="notification-card">
                <div>
                  <div className="notification-title-row">
                    <h2>{notification.title}</h2>
                    <span className={`pill ${notification.type}`}>
                      {notification.type}
                    </span>
                  </div>
                  <p className="notification-body">{notification.body}</p>
                  <p className="notification-meta">
                    {new Date(notification.createdAt).toLocaleString()}
                    {notification.isRead ? " · Read" : " · Unread"}
                  </p>
                </div>
                <div className="notification-actions">
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => toggleRead(notification.id)}
                  >
                    {notification.isRead ? "Mark unread" : "Mark read"}
                  </button>
                  <button
                    className="button danger"
                    type="button"
                    onClick={() => removeNotification(notification.id)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
