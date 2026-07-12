import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { fetchUnreadBadgeCount, markAllNotificationsRead, subscribeToNotifications } from "../lib/notifications";
import { useAuth } from "./AuthProvider";

interface NotificationsContextValue {
  unreadCount: number;
  refetch: () => void;
  markAllRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

// Same shape as AuthProvider — wraps the whole app so the tab bar badge
// (which lives outside the Notifications screen itself) always has a
// live count, and ChatScreen can push an immediate refetch after marking
// a channel read without waiting for the next unrelated realtime event.
export function NotificationsProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [unreadCount, setUnreadCount] = useState(0);

  const refetch = useCallback(() => {
    if (!userId) return;
    fetchUnreadBadgeCount(userId)
      .then(setUnreadCount)
      .catch(() => {
        // Badge count is non-critical UI — a failed refetch just leaves
        // the previous count showing rather than surfacing an error.
      });
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }

    refetch();
    const unsubscribe = subscribeToNotifications(userId, refetch, "badge");
    return unsubscribe;
  }, [userId, refetch]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    await markAllNotificationsRead(userId);
    refetch();
  }, [userId, refetch]);

  return (
    <NotificationsContext.Provider value={{ unreadCount, refetch, markAllRead }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within a NotificationsProvider");
  return ctx;
}
