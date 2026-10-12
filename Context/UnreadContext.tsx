import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import useAuth from '../hooks/useAuth';
import AuthService from '../services/AuthService';

type UnreadContextType = {
    totalUnread: number;
    setTotalUnread: React.Dispatch<React.SetStateAction<number>>;
    refreshUnreadCount: () => void;
};

const UnreadContext = createContext<UnreadContextType>({
    totalUnread: 0,
    setTotalUnread: () => {},
    refreshUnreadCount: () => {},
});

export const UnreadProvider = ({ children }: { children: React.ReactNode }) => {
    const { user } = useAuth();
    const [totalUnread, setTotalUnread] = useState(0);

    const signedIn = !!user;

    // Stable identity: screens list it in effect dependencies.
    const refreshUnreadCount = useCallback(() => {
        if (!signedIn) return;
        AuthService.getUnreadMessageCount()
            .then(res => setTotalUnread(res.totalUnread || 0))
            .catch(err => console.error('Failed to fetch unread count', err));
    }, [signedIn]);

    useEffect(() => {
        if (!signedIn) {
            setTotalUnread(0);
            return;
        }
        refreshUnreadCount();
    }, [signedIn, refreshUnreadCount]);

    const value = useMemo(
        () => ({ totalUnread, setTotalUnread, refreshUnreadCount }),
        [totalUnread, refreshUnreadCount]
    );

    return (
        <UnreadContext.Provider value={value}>
            {children}
        </UnreadContext.Provider>
    );
};

export const useUnread = () => useContext(UnreadContext);
