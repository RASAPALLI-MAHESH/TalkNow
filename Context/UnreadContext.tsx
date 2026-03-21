import React, { createContext, useContext, useState, useEffect } from 'react';
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

    const refreshUnreadCount = () => {
        if (!user) return;
        AuthService.getUnreadMessageCount()
            .then(res => setTotalUnread(res.totalUnread || 0))
            .catch(err => console.error('Failed to fetch unread count', err));
    };

    useEffect(() => {
        if (!user) {
            setTotalUnread(0);
            return;
        }
        refreshUnreadCount();
    }, [user]);

    return (
        <UnreadContext.Provider value={{ totalUnread, setTotalUnread, refreshUnreadCount }}>
            {children}
        </UnreadContext.Provider>
    );
};

export const useUnread = () => useContext(UnreadContext);
