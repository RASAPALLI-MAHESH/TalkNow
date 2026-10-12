import { Alert } from 'react-native';
import { acceptFollowRequest, followUser, unblockUser, unfollowUser } from './AuthService';

// How the signed-in user relates to another user, as reported by the server.
// 'blocked' means I blocked them.
export type Relationship = 'self' | 'connected' | 'requested' | 'incoming' | 'none' | 'blocked';

const RELATIONSHIPS: Relationship[] = ['self', 'connected', 'requested', 'incoming', 'none', 'blocked'];

export const toRelationship = (value: unknown): Relationship =>
    RELATIONSHIPS.includes(value as Relationship) ? (value as Relationship) : 'none';

export const relationshipLabel: Record<Relationship, string> = {
    self: 'You',
    connected: 'Connected',
    requested: 'Requested',
    incoming: 'Accept',
    none: 'Follow',
    blocked: 'Unblock',
};

// Buttons that start something new get the filled style.
export const isPrimaryRelationshipAction = (relationship: Relationship) =>
    relationship === 'none' || relationship === 'incoming';

const confirmRemoveConnection = (username: string) =>
    new Promise<boolean>((resolve) => {
        Alert.alert(
            'Remove connection?',
            `You and ${username} will no longer be able to message each other.`,
            [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Remove', style: 'destructive', onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) }
        );
    });

/**
 * Runs the follow button's action for the current relationship and returns the new one:
 * follow, cancel a sent request, accept an incoming request, remove a connection
 * (after confirming) or unblock. Returns the current relationship if the user cancels.
 */
export const performRelationshipAction = async (
    userId: string,
    username: string,
    current: Relationship
): Promise<Relationship> => {
    switch (current) {
        case 'none': {
            const response = await followUser(userId);
            return toRelationship(response?.relationship ?? 'requested');
        }
        case 'requested':
            await unfollowUser(userId);
            return 'none';
        case 'incoming':
            await acceptFollowRequest(undefined, userId);
            return 'connected';
        case 'connected':
            if (!(await confirmRemoveConnection(username))) return current;
            await unfollowUser(userId);
            return 'none';
        case 'blocked':
            await unblockUser(userId);
            return 'none';
        default:
            return current;
    }
};
